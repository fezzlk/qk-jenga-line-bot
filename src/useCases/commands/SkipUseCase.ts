import type { messagingApi } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { AnswerSessionRepository } from "../../repositories/AnswerSessionRepository.js";
import { AnswerFlowService } from "../../services/AnswerFlowService.js";
import { PuzzlePreviewService } from "../../services/PuzzlePreviewService.js";
import { textMessage } from "../../lineMessages.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

export class SkipUseCase implements CommandUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly answerSessions: AnswerSessionRepository,
    private readonly answerFlow: AnswerFlowService,
    private readonly puzzlePreview: PuzzlePreviewService,
  ) {}

  async execute({ groupId, userId }: CommandInput): Promise<messagingApi.Message[]> {
    const session = await this.answerSessions.getActiveByGroup(groupId);
    if (!session) {
      return [textMessage("進行中の挑戦がありません。「挑戦開始」で始めてください。")];
    }
    const round = await this.puzzleRounds.getById(session.puzzleRoundId);
    if (!round) {
      throw new Error(`PuzzleRound not found for active session: ${session.puzzleRoundId}`);
    }

    // revealedCount/answererIds are re-read and recomputed inside
    // AnswerFlowService.submitSkip's own transaction (FEZ-166), so `session` above
    // is only used to locate the session/round.
    const result = await this.answerFlow.submitSkip(session.id, round, userId);

    if (result.outcome === "fully_revealed") {
      return this.puzzlePreview.compose(round, result.session.revealedCount, "challenge", {
        before: "スキップしました。全開示となりました。",
        label: "最終状態",
        after: `結果: アウト（${result.score >= 0 ? "+" : ""}${result.score}点、記録済み）`,
      });
    }

    return this.puzzlePreview.compose(round, result.session.revealedCount, "challenge", {
      before: "スキップしました。",
      label: "現在の状態",
    });
  }
}
