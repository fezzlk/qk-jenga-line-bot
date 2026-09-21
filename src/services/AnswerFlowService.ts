import { AnswerSessionRepository } from "../repositories/AnswerSessionRepository.js";
import { PuzzleRoundRepository } from "../repositories/PuzzleRoundRepository.js";
import { PlayerStatsRepository } from "../repositories/PlayerStatsRepository.js";
import type { Transactor } from "../repositories/Transactor.js";
import { isFullyRevealed } from "../domain/services/textPuzzle.js";
import {
  type AnswerSession,
  type AnswerSessionStatus,
  type PuzzleRound,
} from "../types.js";

/** Result of AnswerFlowService.submitAnswer, discriminated on how the attempt landed. */
export type AnswerSubmitOutcome =
  | { outcome: "correct"; session: AnswerSession; score: number }
  | { outcome: "wrong_limit"; session: AnswerSession; score: number }
  | { outcome: "fully_revealed"; session: AnswerSession; score: number }
  | { outcome: "continue_revealed"; session: AnswerSession }
  | { outcome: "continue"; session: AnswerSession };

/** Result of AnswerFlowService.submitSkip, discriminated on how the skip landed. */
export type SkipSubmitOutcome =
  | { outcome: "fully_revealed"; session: AnswerSession; score: number }
  | { outcome: "continue"; session: AnswerSession };

/**
 * Shared write-path for the answer phase: revealing the next block and ending a
 * session. Centralized here because every termination (correct / wrong_limit /
 * fully_revealed) needs the same three writes (session, round, player stats), each
 * scored per the session's own scoreCorrect/scoreWrongLimit/scoreFullyRevealed
 * (overridable per round, defaulting to +1 / -1 / 0 respectively).
 *
 * submitAnswer/submitSkip re-read the session by id inside a single Firestore
 * transaction instead of trusting a session snapshot fetched before the
 * transaction started (FEZ-166: concurrent answerers/skippers could otherwise
 * silently overwrite one another's wrongAnswerCount/currentStepAttempts/
 * answererIds update). revealNextBlock/endSession stay as-is — signature and
 * return shape unchanged — since StartChallengeUseCase (the only other caller)
 * has no such race: only the creator knows the freshly created session's id yet.
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
   * `score` is null while the session stays active, and the recorded score once it ends.
   */
  async revealNextBlock(
    session: AnswerSession,
    round: PuzzleRound,
    extraPatch: Partial<AnswerSession> = {},
  ): Promise<{ session: AnswerSession; score: number | null }> {
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
    return { session: { ...session, ...patch }, score: null };
  }

  async endSession(
    session: AnswerSession,
    round: PuzzleRound,
    status: Exclude<AnswerSessionStatus, "active">,
    extraPatch: Partial<AnswerSession> = {},
  ): Promise<{ session: AnswerSession; score: number }> {
    return this.transactor.run(async (txn) => this.applyEndSession(txn, session, round, status, extraPatch));
  }

  /**
   * Transaction-safe write-path for AnswerUseCase: re-reads the session by id inside a
   * single Firestore transaction before deciding correct / wrong_limit / fully_revealed /
   * continue_revealed / continue, so two concurrent answerers' counters never overwrite
   * one another (FEZ-166).
   */
  async submitAnswer(
    sessionId: string,
    round: PuzzleRound,
    userId: string,
    answerText: string,
  ): Promise<AnswerSubmitOutcome> {
    return this.transactor.run(async (txn) => {
      const session = await this.answerSessions.getByIdInTransaction(txn, sessionId);
      if (!session) {
        throw new Error(`AnswerSession not found: ${sessionId}`);
      }
      const answererIds = session.answererIds.includes(userId)
        ? session.answererIds
        : [...session.answererIds, userId];

      if (answerText === round.sourceText) {
        const { session: ended, score } = this.applyEndSession(txn, session, round, "correct", { answererIds });
        return { outcome: "correct", session: ended, score };
      }

      const wrongAnswerCount = session.wrongAnswerCount + 1;
      if (wrongAnswerCount >= session.wrongAnswerLimit) {
        const { session: ended, score } = this.applyEndSession(txn, session, round, "wrong_limit", {
          wrongAnswerCount,
          answererIds,
        });
        return { outcome: "wrong_limit", session: ended, score };
      }

      const currentStepAttempts = session.currentStepAttempts + 1;
      if (currentStepAttempts >= session.attemptsPerBlockLimit) {
        const revealedCount = session.revealedCount + 1;
        if (isFullyRevealed(round.hiddenPositions, revealedCount)) {
          const { session: ended, score } = this.applyEndSession(txn, session, round, "fully_revealed", {
            wrongAnswerCount,
            answererIds,
            revealedCount,
            currentStepAttempts: 0,
          });
          return { outcome: "fully_revealed", session: ended, score };
        }
        const patch = { wrongAnswerCount, answererIds, revealedCount, currentStepAttempts: 0 };
        this.answerSessions.updateInTransaction(txn, session.id, patch);
        return { outcome: "continue_revealed", session: { ...session, ...patch } };
      }

      const patch = { wrongAnswerCount, currentStepAttempts, answererIds };
      this.answerSessions.updateInTransaction(txn, session.id, patch);
      return { outcome: "continue", session: { ...session, ...patch } };
    });
  }

  /**
   * Transaction-safe write-path for SkipUseCase: same re-read pattern as submitAnswer,
   * for fully_revealed / continue.
   */
  async submitSkip(sessionId: string, round: PuzzleRound, userId: string): Promise<SkipSubmitOutcome> {
    return this.transactor.run(async (txn) => {
      const session = await this.answerSessions.getByIdInTransaction(txn, sessionId);
      if (!session) {
        throw new Error(`AnswerSession not found: ${sessionId}`);
      }
      const answererIds = session.answererIds.includes(userId)
        ? session.answererIds
        : [...session.answererIds, userId];

      const revealedCount = session.revealedCount + 1;
      if (isFullyRevealed(round.hiddenPositions, revealedCount)) {
        const { session: ended, score } = this.applyEndSession(txn, session, round, "fully_revealed", {
          answererIds,
          revealedCount,
          currentStepAttempts: 0,
        });
        return { outcome: "fully_revealed", session: ended, score };
      }
      const patch = { answererIds, revealedCount, currentStepAttempts: 0 };
      this.answerSessions.updateInTransaction(txn, session.id, patch);
      return { outcome: "continue", session: { ...session, ...patch } };
    });
  }

  /** Queues the end-session writes on an already-open transaction; does not open its own. */
  private applyEndSession(
    txn: FirebaseFirestore.Transaction,
    session: AnswerSession,
    round: PuzzleRound,
    status: Exclude<AnswerSessionStatus, "active">,
    extraPatch: Partial<AnswerSession>,
  ): { session: AnswerSession; score: number } {
    const patch: Partial<AnswerSession> = { ...extraPatch, status, endedAt: Date.now() };
    const merged = { ...session, ...patch };
    // patch.answererIds reflects a participant who just joined via this same action
    // (see AnswerUseCase/SkipUseCase); fall back to the session's existing list otherwise.
    const answererIds = patch.answererIds ?? session.answererIds;
    const score = this.scoreFor(merged, status);
    this.answerSessions.updateInTransaction(txn, session.id, patch);
    this.puzzleRounds.updateInTransaction(txn, round.id, { phase: "closed" });
    for (const answererId of answererIds) {
      this.playerStats.recordResultInTransaction(txn, session.groupId, answererId, score);
    }
    return { session: merged, score };
  }

  private scoreFor(session: AnswerSession, status: Exclude<AnswerSessionStatus, "active">): number {
    return {
      correct: session.scoreCorrect,
      wrong_limit: session.scoreWrongLimit,
      fully_revealed: session.scoreFullyRevealed,
    }[status];
  }
}
