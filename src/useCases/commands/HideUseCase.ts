import type { messagingApi } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import type { Transactor } from "../../repositories/Transactor.js";
import { PuzzlePreviewService } from "../../services/PuzzlePreviewService.js";
import { textMessage } from "../../lineMessages.js";
import type { PuzzleRound } from "../../types.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

const NO_ROUND_REPLY = "作成中のパズルラウンドがありません。「問題作成開始」で始めてください。";

type HideResult =
  | { kind: "reply"; text: string }
  | { kind: "complete"; total: number }
  | { kind: "hidden"; round: PuzzleRound; remaining: number };

export class HideUseCase implements CommandUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly transactor: Transactor,
    private readonly puzzlePreview: PuzzlePreviewService,
  ) {}

  async execute({ groupId, userId, args }: CommandInput): Promise<messagingApi.Message[]> {
    const existing = await this.puzzleRounds.getByGroupAndPhase(groupId, "creating");
    if (!existing) {
      return [textMessage(NO_ROUND_REPLY)];
    }

    const position = Number.parseInt(args.trim(), 10);
    if (!Number.isInteger(position) || position < 1 || position > existing.totalHideCount) {
      const unit = existing.sourceType === "image" ? "マス番号" : "文字位置";
      return [
        textMessage(`1〜${existing.totalHideCount}の${unit}を指定してください（例: 隠す 3）。`),
      ];
    }
    const zeroBasedPosition = position - 1;

    // Re-reads and validates against the round's latest state inside the transaction so
    // two people hiding at the same time can't silently overwrite one another's update.
    const result = await this.transactor.run(async (txn): Promise<HideResult> => {
      const round = await this.puzzleRounds.getByIdInTransaction(txn, existing.id);
      if (!round) {
        return { kind: "reply", text: NO_ROUND_REPLY };
      }
      if (round.lastHiderId === userId) {
        return { kind: "reply", text: "直前の手番と同じ人は連続で隠せません。他の人の番です。" };
      }
      if (round.hiddenPositions.includes(zeroBasedPosition)) {
        return {
          kind: "reply",
          text: "その位置はすでに隠されています。別の位置を指定してください。",
        };
      }

      const hiddenPositions = [...round.hiddenPositions, zeroBasedPosition];
      const participantIds = round.participantIds.includes(userId)
        ? round.participantIds
        : [...round.participantIds, userId];
      const complete = hiddenPositions.length >= round.totalHideCount;
      const patch = {
        hiddenPositions,
        participantIds,
        lastHiderId: userId,
        phase: complete ? ("ready_to_challenge" as const) : ("creating" as const),
      };
      this.puzzleRounds.updateInTransaction(txn, round.id, patch);

      if (complete) return { kind: "complete", total: round.totalHideCount };
      return {
        kind: "hidden",
        round: { ...round, ...patch },
        remaining: round.totalHideCount - hiddenPositions.length,
      };
    });

    if (result.kind === "reply") return [textMessage(result.text)];
    if (result.kind === "complete") {
      return [
        textMessage(
          `${result.total}箇所すべて隠し終えました。作成完了です。「挑戦開始」で解答フェーズに進めます。`,
        ),
      ];
    }
    // Rendered after the transaction commits: image rendering does network I/O and must
    // not run inside a transaction body that Firestore may retry.
    return this.puzzlePreview.compose(result.round, 0, "creation", {
      before: `隠しました。残り${result.remaining}箇所です。`,
      label: "現在の状態",
    });
  }
}
