import type { messagingApi } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { PuzzlePreviewService } from "../../services/PuzzlePreviewService.js";
import { textMessage } from "../../lineMessages.js";
import type { ImagePuzzleRound } from "../../types.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

export class CreationStatusUseCase implements CommandUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly puzzlePreview: PuzzlePreviewService,
  ) {}

  async execute({ groupId }: CommandInput): Promise<messagingApi.Message[]> {
    const preparing = await this.puzzleRounds.getByGroupAndPhase(groupId, "preparing");
    if (preparing?.sourceType === "image") {
      return [textMessage(preparingStatus(preparing))];
    }

    const round = await this.puzzleRounds.getByGroupAndPhase(groupId, "creating");
    if (!round) {
      return [textMessage("作成中のパズルラウンドがありません。")];
    }
    const remaining = round.totalHideCount - round.hiddenPositions.length;
    const turnHint = round.lastHiderId
      ? "直前に隠した人以外が次の手番です。"
      : "誰でも最初の手番になれます。";
    return this.puzzlePreview.compose(round, 0, "creation", {
      label: "現在の状態",
      after: `残り${remaining}箇所。${turnHint}`,
    });
  }
}

function preparingStatus(round: ImagePuzzleRound): string {
  if (round.sourceImagePath === null) return "画像の問題を準備中です。作成者の画像を待っています。";
  if (round.gridSize === null)
    return "画像の問題を準備中です。作成者のマス数の選択を待っています。";
  return "画像の問題を準備中です。作成者の正解の登録を待っています。";
}
