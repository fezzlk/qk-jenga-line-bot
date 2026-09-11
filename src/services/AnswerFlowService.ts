import { AnswerSessionRepository } from "../repositories/AnswerSessionRepository.js";
import { PuzzleRoundRepository } from "../repositories/PuzzleRoundRepository.js";
import { PlayerStatsRepository } from "../repositories/PlayerStatsRepository.js";
import type { Transactor } from "../repositories/Transactor.js";
import { isFullyRevealed } from "../domain/services/textPuzzle.js";
import {
  SCORE_BY_END_STATUS,
  type AnswerSession,
  type AnswerSessionStatus,
  type PuzzleRound,
} from "../types.js";

/**
 * Shared write-path for the answer phase: revealing the next block and ending a
 * session. Centralized here because every termination (correct / wrong_limit /
 * fully_revealed) needs the same three writes (session, round, player stats),
 * with the score recorded depending on SCORE_BY_END_STATUS per SPECIFICATION.md.
 */
export class AnswerFlowService {
  constructor(
    private readonly answerSessions: AnswerSessionRepository,
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly playerStats: PlayerStatsRepository,
    private readonly transactor: Transactor,
  ) {}

  /**
   * Reveals the next block, ending the session as "fully_revealed" if that was the last one.
   * extraPatch lets callers fold an additional session update (e.g. an incremented
   * wrongAnswerCount) into this same write instead of issuing a separate update first.
   */
  async revealNextBlock(
    session: AnswerSession,
    round: PuzzleRound,
    extraPatch: Partial<AnswerSession> = {},
  ): Promise<AnswerSession> {
    const revealedCount = session.revealedCount + 1;
    if (isFullyRevealed(round.hiddenPositions, revealedCount)) {
      return this.endSession(session, round, "fully_revealed", {
        ...extraPatch,
        revealedCount,
        currentStepAttempts: 0,
      });
    }
    const patch = { ...extraPatch, revealedCount, currentStepAttempts: 0 };
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
    // patch.answererIds reflects a participant who just joined via this same action
    // (see AnswerUseCase/SkipUseCase); fall back to the session's existing list otherwise.
    const answererIds = patch.answererIds ?? session.answererIds;
    const scoreDelta = SCORE_BY_END_STATUS[status];
    await this.transactor.run(async (txn) => {
      this.answerSessions.updateInTransaction(txn, session.id, patch);
      this.puzzleRounds.updateInTransaction(txn, round.id, { phase: "closed" });
      for (const answererId of answererIds) {
        this.playerStats.recordResultInTransaction(txn, session.groupId, answererId, scoreDelta);
      }
    });
    return { ...session, ...patch };
  }
}
