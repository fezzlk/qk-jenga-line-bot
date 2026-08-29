import { AnswerSessionRepository } from "../repositories/AnswerSessionRepository.js";
import { PuzzleRoundRepository } from "../repositories/PuzzleRoundRepository.js";
import { PlayerStatsRepository } from "../repositories/PlayerStatsRepository.js";
import { isFullyRevealed } from "../domain/services/textPuzzle.js";
import {
  OUT_SCORE_PENALTY,
  type AnswerSession,
  type AnswerSessionStatus,
  type PuzzleRound,
} from "../types.js";

/**
 * Shared write-path for the answer phase: revealing the next block and ending a
 * session. Centralized here because every termination (correct / wrong_limit /
 * fully_revealed) needs the same three writes (session, round, player stats) per
 * SPECIFICATION.md's "終了条件はすべて「解答者アウト」として同列、暫定-1点" rule.
 */
export class AnswerFlowService {
  constructor(
    private readonly answerSessions: AnswerSessionRepository,
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly playerStats: PlayerStatsRepository,
  ) {}

  /** Reveals the next block, ending the session as "fully_revealed" if that was the last one. */
  async revealNextBlock(session: AnswerSession, round: PuzzleRound): Promise<AnswerSession> {
    const revealedCount = session.revealedCount + 1;
    if (isFullyRevealed(round.hiddenPositions, revealedCount)) {
      return this.endSession(session, round, "fully_revealed", {
        revealedCount,
        currentStepAttempts: 0,
      });
    }
    const patch = { revealedCount, currentStepAttempts: 0 };
    await this.answerSessions.update(session.id, patch);
    return { ...session, ...patch };
  }

  async endSession(
    session: AnswerSession,
    round: PuzzleRound,
    status: Exclude<AnswerSessionStatus, "active">,
    extraPatch: Partial<AnswerSession> = {},
  ): Promise<AnswerSession> {
    const patch: Partial<AnswerSession> = { ...extraPatch, status, endedAt: Date.now() };
    await this.answerSessions.update(session.id, patch);
    await this.puzzleRounds.update(round.id, { phase: "closed" });
    await this.playerStats.recordResult(session.groupId, session.answererId, OUT_SCORE_PENALTY);
    return { ...session, ...patch };
  }
}
