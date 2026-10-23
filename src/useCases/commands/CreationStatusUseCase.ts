import type { messagingApi } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { PuzzlePreviewService } from "../../services/PuzzlePreviewService.js";
import { currentTurnUserId, displayNameOf } from "../../domain/services/puzzleRound.js";
import { textMessage, withButtonsOnLast } from "../../lineMessages.js";
import type { PuzzleRound } from "../../types.js";
import { challengeButtons, hideButtons, recruitButtons } from "../buttons.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

/** 作成状況: where the group's round is in creation, re-offering that step's buttons. */
export class CreationStatusUseCase implements CommandUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly puzzlePreview: PuzzlePreviewService,
  ) {}

  async execute({ groupId }: CommandInput): Promise<messagingApi.Message[]> {
    const round = await this.puzzleRounds.getActiveByGroup(groupId);
    if (!round || round.phase === "in_challenge") {
      return [textMessage("作成中のパズルラウンドがありません。")];
    }

    if (round.phase === "preparing") {
      return [textMessage(preparingStatus(round))];
    }
    if (round.phase === "recruiting") {
      return withButtonsOnLast(
        [textMessage(`隠す人を募集中です。\n${participantList(round)}`)],
        recruitButtons(round.id),
      );
    }
    if (round.phase === "ready_to_challenge") {
      return withButtonsOnLast(
        [textMessage("作成完了しています。「挑戦開始」で解答フェーズに進めます。")],
        challengeButtons(),
      );
    }

    const remaining = round.totalHideCount - round.hiddenPositions.length;
    const turn = currentTurnUserId(round);
    const messages = await this.puzzlePreview.compose(round, 0, "creation", {
      label: "現在の状態",
      after: `残り${remaining}箇所。${turn ? `${displayNameOf(round, turn)}さんの番です。` : ""}`,
    });
    return withButtonsOnLast(messages, hideButtons(round.id));
  }
}

function participantList(round: PuzzleRound): string {
  if (round.participantIds.length === 0) return "まだ誰も参加していません。";
  return round.participantIds.map((id, i) => `${i + 1}. ${displayNameOf(round, id)}`).join("\n");
}

function preparingStatus(round: PuzzleRound): string {
  if (round.sourceType === "text") return "文章の問題を準備中です。作成者の問題文を待っています。";
  if (round.sourceImagePath === null) return "画像の問題を準備中です。作成者の画像を待っています。";
  if (round.gridSize === null) {
    return "画像の問題を準備中です。作成者のマス数の選択を待っています。";
  }
  return "画像の問題を準備中です。作成者の正解の登録を待っています。";
}
