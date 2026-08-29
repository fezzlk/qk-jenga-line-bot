import type { PuzzleRoundRepository } from "../../src/repositories/PuzzleRoundRepository.js";
import type { AnswerSessionRepository } from "../../src/repositories/AnswerSessionRepository.js";
import type { PlayerStatsRepository } from "../../src/repositories/PlayerStatsRepository.js";
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
  };
}

export function createFakePlayerStatsRepository(): PlayerStatsRepository & {
  calls: Array<{ groupId: string; userId: string; scoreDelta: number }>;
} {
  const stats = new Map<string, PlayerStats>();
  const calls: Array<{ groupId: string; userId: string; scoreDelta: number }> = [];

  return {
    calls,
    async get(groupId, userId) {
      return stats.get(`${groupId}_${userId}`) ?? null;
    },
    async recordResult(groupId, userId, scoreDelta) {
      calls.push({ groupId, userId, scoreDelta });
      const key = `${groupId}_${userId}`;
      const existing = stats.get(key);
      stats.set(key, {
        groupId,
        userId,
        totalPlays: (existing?.totalPlays ?? 0) + 1,
        totalScore: (existing?.totalScore ?? 0) + scoreDelta,
      });
    },
  };
}
