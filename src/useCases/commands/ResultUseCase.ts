import type { messagingApi } from "@line/bot-sdk";
import { PlayerStatsRepository } from "../../repositories/PlayerStatsRepository.js";
import { textMessage } from "../../lineMessages.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

export class ResultUseCase implements CommandUseCase {
  constructor(private readonly playerStats: PlayerStatsRepository) {}

  async execute({ groupId, userId }: CommandInput): Promise<messagingApi.Message[]> {
    const stats = await this.playerStats.get(groupId, userId);
    if (!stats) {
      return [textMessage("このグループでのプレイ記録はまだありません。")];
    }
    return [
      textMessage(`通算プレイ回数: ${stats.totalPlays}回　通算スコア: ${stats.totalScore}点`),
    ];
  }
}
