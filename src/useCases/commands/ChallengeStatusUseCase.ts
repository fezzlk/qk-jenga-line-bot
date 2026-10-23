import type { messagingApi } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { AnswerSessionRepository } from "../../repositories/AnswerSessionRepository.js";
import { PuzzlePreviewService } from "../../services/PuzzlePreviewService.js";
import { textMessage } from "../../lineMessages.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

export class ChallengeStatusUseCase implements CommandUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly answerSessions: AnswerSessionRepository,
    private readonly puzzlePreview: PuzzlePreviewService,
  ) {}

  async execute({ groupId }: CommandInput): Promise<messagingApi.Message[]> {
    const session = await this.answerSessions.getActiveByGroup(groupId);
    if (!session) {
      return [textMessage("進行中の挑戦がありません。")];
    }
    const round = await this.puzzleRounds.getById(session.puzzleRoundId);
    if (!round) {
      throw new Error(`PuzzleRound not found for active session: ${session.puzzleRoundId}`);
    }
    return this.puzzlePreview.compose(round, session.revealedCount, "challenge", {
      label: "現在の状態",
      after:
        `誤答: ${session.wrongAnswerCount}/${session.wrongAnswerLimit}　` +
        `この位置での回答: ${session.currentStepAttempts}/${session.attemptsPerBlockLimit}`,
    });
  }
}
