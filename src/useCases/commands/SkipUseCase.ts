import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { AnswerSessionRepository } from "../../repositories/AnswerSessionRepository.js";
import { AnswerFlowService } from "../../services/AnswerFlowService.js";
import { renderRevealedText } from "../../domain/services/textPuzzle.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

export class SkipUseCase implements CommandUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly answerSessions: AnswerSessionRepository,
    private readonly answerFlow: AnswerFlowService,
  ) {}

  async execute({ groupId, userId }: CommandInput): Promise<string> {
    const activeSession = await this.answerSessions.getActiveByGroup(groupId);
    if (!activeSession) {
      return "進行中の挑戦がありません。「挑戦開始」で始めてください。";
    }
    const round = await this.puzzleRounds.getById(activeSession.puzzleRoundId);
    if (!round) {
      throw new Error(`PuzzleRound not found for active session: ${activeSession.puzzleRoundId}`);
    }

    // Participants are re-read and recomputed inside the transaction (see
    // AnswerFlowService.submitSkip), so activeSession above only locates the session/round.
    const result = await this.answerFlow.submitSkip(activeSession.id, round, userId);

    if (result.kind === "no_session") {
      return "進行中の挑戦がありません。「挑戦開始」で始めてください。";
    }

    const preview = renderRevealedText(round.sourceText, round.hiddenPositions, result.session.revealedCount);
    if (result.kind === "ended") {
      return `スキップしました。全開示となりました。\n最終状態: ${preview}\n結果: アウト（-1点、記録済み）`;
    }
    return `スキップしました。\n現在の状態: ${preview}`;
  }
}
