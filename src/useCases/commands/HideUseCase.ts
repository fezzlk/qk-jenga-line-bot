import type { messagingApi } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import type { Transactor } from "../../repositories/Transactor.js";
import { PuzzlePreviewService } from "../../services/PuzzlePreviewService.js";
import {
  currentTurnUserId,
  displayNameOf,
  nextTurnIndex,
} from "../../domain/services/puzzleRound.js";
import { textMessage, withButtonsOnLast } from "../../lineMessages.js";
import type { PuzzleRound } from "../../types.js";
import { challengeButtons, hideButtons } from "../buttons.js";
import { STALE_BUTTON_REPLY } from "../replies.js";

type SubmitResult =
  | { kind: "reply"; text: string }
  | { kind: "complete"; total: number }
  | { kind: "hidden"; round: PuzzleRound; remaining: number };

/**
 * 隠す: the participant whose turn it is taps 隠す, then sends the position number as
 * their next message (mode gate). Turns rotate through the order fixed at 締め切る.
 */
export class HideUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly transactor: Transactor,
    private readonly puzzlePreview: PuzzlePreviewService,
  ) {}

  async requestHide(
    groupId: string,
    userId: string,
    roundId: string,
  ): Promise<messagingApi.Message[]> {
    const round = await this.puzzleRounds.getByGroupAndPhase(groupId, "creating");
    if (!round || round.id !== roundId) return [textMessage(STALE_BUTTON_REPLY)];

    const turnUserId = currentTurnUserId(round);
    if (turnUserId !== userId) {
      const name = turnUserId ? displayNameOf(round, turnUserId) : "参加者";
      return [textMessage(`今は${name}さんの番です。`)];
    }

    await this.puzzleRounds.update(round.id, {
      pendingInput: { userId, kind: "hide_position" },
    });
    return [textMessage(`隠す番号を送ってください（1〜${round.totalHideCount}）。`)];
  }

  /**
   * Mode-gate value: the position number the current-turn participant sent after 隠す.
   * On an invalid number the pending input is left as is, so they can simply resend.
   */
  async submitPosition(
    round: PuzzleRound,
    userId: string,
    text: string,
  ): Promise<messagingApi.Message[]> {
    // NFKC so full-width digits typed on a Japanese keyboard ("３") count too.
    const normalized = text.normalize("NFKC").trim();
    const position = /^\d+$/.test(normalized) ? Number.parseInt(normalized, 10) : NaN;
    if (!Number.isInteger(position) || position < 1 || position > round.totalHideCount) {
      return [textMessage(`1〜${round.totalHideCount}の番号を数字だけで送ってください。`)];
    }
    const zeroBasedPosition = position - 1;

    // Re-reads and validates against the round's latest state inside the transaction so
    // two submissions at the same time can't silently overwrite one another's update.
    const result = await this.transactor.run(async (txn): Promise<SubmitResult> => {
      const latest = await this.puzzleRounds.getByIdInTransaction(txn, round.id);
      if (
        !latest ||
        latest.phase !== "creating" ||
        latest.pendingInput?.userId !== userId ||
        latest.pendingInput.kind !== "hide_position"
      ) {
        return { kind: "reply", text: STALE_BUTTON_REPLY };
      }
      if (latest.hiddenPositions.includes(zeroBasedPosition)) {
        return {
          kind: "reply",
          text: "その位置はすでに隠されています。別の番号を送ってください。",
        };
      }

      const hiddenPositions = [...latest.hiddenPositions, zeroBasedPosition];
      const complete = hiddenPositions.length >= latest.totalHideCount;
      const patch = {
        hiddenPositions,
        pendingInput: null,
        turnIndex: nextTurnIndex(latest),
        phase: complete ? ("ready_to_challenge" as const) : ("creating" as const),
      };
      this.puzzleRounds.updateInTransaction(txn, latest.id, patch);

      if (complete) return { kind: "complete", total: latest.totalHideCount };
      return {
        kind: "hidden",
        round: { ...latest, ...patch },
        remaining: latest.totalHideCount - hiddenPositions.length,
      };
    });

    if (result.kind === "reply") return [textMessage(result.text)];
    if (result.kind === "complete") {
      return withButtonsOnLast(
        [
          textMessage(
            `${result.total}箇所すべて隠し終えました。作成完了です。\n解答者がそろったら「挑戦開始」を押してください。`,
          ),
        ],
        challengeButtons(),
      );
    }
    // Rendered after the transaction commits: image rendering does network I/O and must
    // not run inside a transaction body that Firestore may retry.
    const next = currentTurnUserId(result.round)!;
    const messages = await this.puzzlePreview.compose(result.round, 0, "creation", {
      before: `隠しました。残り${result.remaining}箇所です。`,
      label: "現在の状態",
      after: `次は${displayNameOf(result.round, next)}さんの番です。「隠す」を押してください。`,
    });
    return withButtonsOnLast(messages, hideButtons(result.round.id));
  }
}
