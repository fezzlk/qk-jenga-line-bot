import { AnswerSessionRepository } from "../repositories/AnswerSessionRepository.js";
import { PuzzleRoundRepository } from "../repositories/PuzzleRoundRepository.js";
import { PlayerStatsRepository } from "../repositories/PlayerStatsRepository.js";
import type { Transactor } from "../repositories/Transactor.js";
import { isFullyRevealed } from "../domain/services/textPuzzle.js";
import {
  OUT_SCORE_PENALTY,
  type AnswerSession,
  type AnswerSessionStatus,
  type PuzzleRound,
} from "../types.js";

/** Result of submitAnswer/submitSkip, discriminated on how the attempt landed. */
export type AnswerAttemptResult =
  // The session was no longer active by the time this attempt's transaction ran
  // (e.g. another concurrent answer already ended it).
  | { kind: "no_session" }
  // The session ended as part of this attempt (correct answer, wrong-answer limit,
  // or the last block was just revealed/skipped).
  | { kind: "ended"; reason: Exclude<AnswerSessionStatus, "active">; session: AnswerSession }
  // The per-block attempt limit was hit and a new block was revealed, but the
  // session is still active.
  | { kind: "revealed"; session: AnswerSession }
  // Still under the per-block attempt limit; only the counters were updated.
  | { kind: "retry"; session: AnswerSession };

/**
 * Shared write-path for the answer phase: revealing the next block and ending a
 * session. Centralized here because every termination (correct / wrong_limit /
 * fully_revealed) needs the same three writes (session, round, player stats) per
 * SPECIFICATION.md's "終了条件はすべて「解答者アウト」として同列、暫定-1点" rule.
 *
 * submitAnswer/submitSkip re-read the session by ID inside a single Firestore
 * transaction (mirroring HideUseCase's pattern) instead of trusting a session
 * snapshot fetched before the transaction started. Concurrent answerers can then
 * safely race: whichever request's transaction commits first is the one whose
 * counters/participant list the other retries build on top of, instead of one
 * silently overwriting the other's update.
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
    return this.transactor.run(async (txn) => this.applyRevealNextBlock(txn, session, round, extraPatch));
  }

  async endSession(
    session: AnswerSession,
    round: PuzzleRound,
    status: Exclude<AnswerSessionStatus, "active">,
    extraPatch: Partial<AnswerSession> = {},
  ): Promise<AnswerSession> {
    return this.transactor.run(async (txn) => this.applyEndSession(txn, session, round, status, extraPatch));
  }

  /** Transaction-safe write-path for AnswerUseCase: re-reads the session before deciding. */
  async submitAnswer(
    sessionId: string,
    round: PuzzleRound,
    userId: string,
    answerText: string,
  ): Promise<AnswerAttemptResult> {
    return this.transactor.run(async (txn) => {
      const session = await this.answerSessions.getByIdInTransaction(txn, sessionId);
      if (!session || session.status !== "active") {
        return { kind: "no_session" };
      }
      const answererIds = session.answererIds.includes(userId)
        ? session.answererIds
        : [...session.answererIds, userId];

      if (answerText === round.sourceText) {
        const ended = this.applyEndSession(txn, session, round, "correct", { answererIds });
        return { kind: "ended", reason: "correct", session: ended };
      }

      const wrongAnswerCount = session.wrongAnswerCount + 1;
      if (wrongAnswerCount >= session.wrongAnswerLimit) {
        const ended = this.applyEndSession(txn, session, round, "wrong_limit", { wrongAnswerCount, answererIds });
        return { kind: "ended", reason: "wrong_limit", session: ended };
      }

      const currentStepAttempts = session.currentStepAttempts + 1;
      if (currentStepAttempts >= session.attemptsPerBlockLimit) {
        const revealed = this.applyRevealNextBlock(txn, session, round, { wrongAnswerCount, answererIds });
        if (revealed.status !== "active") {
          return { kind: "ended", reason: revealed.status, session: revealed };
        }
        return { kind: "revealed", session: revealed };
      }

      const patch = { wrongAnswerCount, currentStepAttempts, answererIds };
      this.answerSessions.updateInTransaction(txn, session.id, patch);
      return { kind: "retry", session: { ...session, ...patch } };
    });
  }

  /** Transaction-safe write-path for SkipUseCase: re-reads the session before deciding. */
  async submitSkip(sessionId: string, round: PuzzleRound, userId: string): Promise<AnswerAttemptResult> {
    return this.transactor.run(async (txn) => {
      const session = await this.answerSessions.getByIdInTransaction(txn, sessionId);
      if (!session || session.status !== "active") {
        return { kind: "no_session" };
      }
      const answererIds = session.answererIds.includes(userId)
        ? session.answererIds
        : [...session.answererIds, userId];

      const revealed = this.applyRevealNextBlock(txn, session, round, { answererIds });
      if (revealed.status !== "active") {
        return { kind: "ended", reason: revealed.status, session: revealed };
      }
      return { kind: "revealed", session: revealed };
    });
  }

  /** Queues the reveal-next-block writes on an already-open transaction; does not open its own. */
  private applyRevealNextBlock(
    txn: FirebaseFirestore.Transaction,
    session: AnswerSession,
    round: PuzzleRound,
    extraPatch: Partial<AnswerSession>,
  ): AnswerSession {
    const revealedCount = session.revealedCount + 1;
    if (isFullyRevealed(round.hiddenPositions, revealedCount)) {
      return this.applyEndSession(txn, session, round, "fully_revealed", {
        ...extraPatch,
        revealedCount,
        currentStepAttempts: 0,
      });
    }
    const patch = { ...extraPatch, revealedCount, currentStepAttempts: 0 };
    this.answerSessions.updateInTransaction(txn, session.id, patch);
    return { ...session, ...patch };
  }

  /** Queues the end-session writes on an already-open transaction; does not open its own. */
  private applyEndSession(
    txn: FirebaseFirestore.Transaction,
    session: AnswerSession,
    round: PuzzleRound,
    status: Exclude<AnswerSessionStatus, "active">,
    extraPatch: Partial<AnswerSession>,
  ): AnswerSession {
    const patch: Partial<AnswerSession> = { ...extraPatch, status, endedAt: Date.now() };
    // patch.answererIds reflects a participant who just joined via this same action
    // (see AnswerUseCase/SkipUseCase); fall back to the session's existing list otherwise.
    const answererIds = patch.answererIds ?? session.answererIds;
    this.answerSessions.updateInTransaction(txn, session.id, patch);
    this.puzzleRounds.updateInTransaction(txn, round.id, { phase: "closed" });
    for (const answererId of answererIds) {
      this.playerStats.recordResultInTransaction(txn, session.groupId, answererId, OUT_SCORE_PENALTY);
    }
    return { ...session, ...patch };
  }
}
