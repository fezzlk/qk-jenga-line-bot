import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { AnswerSessionRepository } from "../../repositories/AnswerSessionRepository.js";
import { renderRevealedText } from "../../domain/services/textPuzzle.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

export class ChallengeStatusUseCase implements CommandUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly answerSessions: AnswerSessionRepository,
  ) {}

  async execute({ groupId }: CommandInput): Promise<string> {
    const session = await this.answerSessions.getActiveByGroup(groupId);
    if (!session) {
      return "進行中の挑戦がありません。";
    }
    const round = await this.puzzleRounds.getById(session.puzzleRoundId);
    if (!round) {
      throw new Error(`PuzzleRound not found for active session: ${session.puzzleRoundId}`);
    }
    const preview = renderRevealedText(round.sourceText, round.hiddenPositions, session.revealedCount);
    return (
      `現在の状態: ${preview}\n` +
      `誤答: ${session.wrongAnswerCount}/${session.wrongAnswerLimit}　` +
      `この位置での回答: ${session.currentStepAttempts}/${session.attemptsPerBlockLimit}`
    );
  }
}
