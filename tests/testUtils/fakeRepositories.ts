import type { PuzzleRoundRepository } from "../../src/repositories/PuzzleRoundRepository.js";
import type { AnswerSessionRepository } from "../../src/repositories/AnswerSessionRepository.js";
import type { PlayerStatsRepository } from "../../src/repositories/PlayerStatsRepository.js";
import type { Transactor } from "../../src/repositories/Transactor.js";
import type { AnswerSession, PlayerStats, PuzzleRound } from "../../src/types.js";

export function createFakePuzzleRoundRepository(initial: PuzzleRound[] = []): PuzzleRoundRepository {
  const rounds = new Map<string, PuzzleRound>();
  let nextId = 1;
  for (const round of initial) rounds.set(round.id, round);

  return {
    async create(round) {
      const id = `round-${nextId++}`;
      const entity = { ...round, id };
      rounds.set(id, entity);
      return entity;
    },
    async getById(id) {
      return rounds.get(id) ?? null;
    },
    async getByGroupAndPhase(groupId, phase) {
      return [...rounds.values()].find((r) => r.groupId === groupId && r.phase === phase) ?? null;
    },
    async getActiveByGroup(groupId) {
      return [...rounds.values()].find((r) => r.groupId === groupId && r.phase !== "closed") ?? null;
    },
    async update(id, patch) {
      const existing = rounds.get(id);
      if (!existing) throw new Error(`not found: ${id}`);
      rounds.set(id, { ...existing, ...patch });
    },
    // Fakes have no real Firestore transaction, so these just perform the same
    // synchronous map read/write as their non-transactional counterparts above.
    async getByIdInTransaction(_txn, id) {
      return rounds.get(id) ?? null;
    },
    updateInTransaction(_txn, id, patch) {
      const existing = rounds.get(id);
      if (!existing) throw new Error(`not found: ${id}`);
      rounds.set(id, { ...existing, ...patch });
    },
  };
}

export function createFakeAnswerSessionRepository(
  initial: AnswerSession[] = [],
): AnswerSessionRepository {
  const sessions = new Map<string, AnswerSession>();
  let nextId = 1;
  for (const session of initial) sessions.set(session.id, session);

  return {
    async create(session) {
      const id = `session-${nextId++}`;
      const entity = { ...session, id };
      sessions.set(id, entity);
      return entity;
    },
    async getById(id) {
      return sessions.get(id) ?? null;
    },
    async getActiveByGroup(groupId) {
      return (
        [...sessions.values()].find((s) => s.groupId === groupId && s.status === "active") ?? null
      );
    },
    async update(id, patch) {
      const existing = sessions.get(id);
      if (!existing) throw new Error(`not found: ${id}`);
      sessions.set(id, { ...existing, ...patch });
    },
    // Fakes have no real Firestore transaction, so this just performs the same
    // synchronous map read as its non-transactional counterpart above.
    async getByIdInTransaction(_txn, id) {
      return sessions.get(id) ?? null;
    },
    updateInTransaction(_txn, id, patch) {
      const existing = sessions.get(id);
      if (!existing) throw new Error(`not found: ${id}`);
      sessions.set(id, { ...existing, ...patch });
    },
  };
}

export function createFakePlayerStatsRepository(): PlayerStatsRepository & {
  calls: Array<{ groupId: string; userId: string; scoreDelta: number }>;
} {
  const stats = new Map<string, PlayerStats>();
  const calls: Array<{ groupId: string; userId: string; scoreDelta: number }> = [];

  function apply(groupId: string, userId: string, scoreDelta: number) {
    calls.push({ groupId, userId, scoreDelta });
    const key = `${groupId}_${userId}`;
    const existing = stats.get(key);
    stats.set(key, {
      groupId,
      userId,
      totalPlays: (existing?.totalPlays ?? 0) + 1,
      totalScore: (existing?.totalScore ?? 0) + scoreDelta,
    });
  }

  return {
    calls,
    async get(groupId, userId) {
      return stats.get(`${groupId}_${userId}`) ?? null;
    },
    async recordResult(groupId, userId, scoreDelta) {
      apply(groupId, userId, scoreDelta);
    },
    recordResultInTransaction(_txn, groupId, userId, scoreDelta) {
      apply(groupId, userId, scoreDelta);
    },
  };
}

/** Runs the callback inline (no real Firestore transaction) for use with the fake repositories above. */
export function createFakeTransactor(): Transactor {
  return {
    async run(fn) {
      return fn({} as FirebaseFirestore.Transaction);
    },
  };
}
