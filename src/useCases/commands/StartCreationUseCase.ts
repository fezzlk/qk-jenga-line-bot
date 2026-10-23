import type { messagingApi } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { textMessage, withButtons } from "../../lineMessages.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

/** 問題作成開始: offers the source types; the round itself is created once one is chosen. */
export class StartCreationUseCase implements CommandUseCase {
  constructor(private readonly puzzleRounds: PuzzleRoundRepository) {}

  async execute({ groupId }: CommandInput): Promise<messagingApi.Message[]> {
    const existing = await this.puzzleRounds.getActiveByGroup(groupId);
    // A round still preparing is replaced when a type is chosen (see RoundSetupUseCase).
    if (existing && existing.phase !== "preparing") {
      return [
        textMessage(
          "すでに進行中のパズルラウンドがあります。「作成状況」または「挑戦状況」で確認してください。",
        ),
      ];
    }
    return [
      withButtons(textMessage("どの形式で問題を作りますか？"), [
        { label: "文章で作る", postback: { action: "type", sourceType: "text" } },
        { label: "画像で作る", postback: { action: "type", sourceType: "image" } },
        { label: "テンプレートから", postback: { action: "type", sourceType: "template" } },
      ]),
    ];
  }
}
