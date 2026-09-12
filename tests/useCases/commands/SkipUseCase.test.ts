import { describe, expect, it } from "vitest";
import { SkipUseCase } from "../../../src/useCases/commands/SkipUseCase.js";
import { AnswerFlowService } from "../../../src/services/AnswerFlowService.js";
import {
  createFakeAnswerSessionRepository,
  createFakePlayerStatsRepository,
  createFakePuzzleRoundRepository,
  createFakeTransactor,
} from "../../testUtils/fakeRepositories.js";
import type { AnswerSessionRepository } from "../../../src/repositories/AnswerSessionRepository.js";
import type { AnswerSession, PuzzleRound } from "../../../src/types.js";

const round: PuzzleRound = {
  id: "round-1",
  groupId: "g1",
  sourceType: "text",
  sourceText: "ab",
  totalHideCount: 2,
  participantIds: [],
  lastHiderId: null,
  hiddenPositions: [0, 1],
  phase: "in_challenge",
  createdAt: 0,
};

function build(session: AnswerSession) {
  const puzzleRounds = createFakePuzzleRoundRepository([round]);
  const answerSessions = createFakeAnswerSessionRepository([session]);
  const playerStats = createFakePlayerStatsRepository();
  const answerFlow = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());
  const useCase = new SkipUseCase(puzzleRounds, answerSessions, answerFlow);
  return { useCase, answerSessions, playerStats };
}

describe("SkipUseCase", () => {
  it("advances the reveal without penalty when more blocks remain", async () => {
    const session: AnswerSession = {
      id: "session-1",
      puzzleRoundId: "round-1",
      groupId: "g1",
      answererIds: ["u1"],
      revealedCount: 0,
      wrongAnswerCount: 0,
      currentStepAttempts: 0,
      wrongAnswerLimit: 3,
      attemptsPerBlockLimit: 1,
      status: "active",
      startedAt: 0,
      endedAt: null,
    };
    const { useCase, answerSessions, playerStats } = build(session);

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "" });

    expect(reply).toContain("スキップしました");
    expect((await answerSessions.getById("session-1"))?.revealedCount).toBe(1);
    expect(playerStats.calls).toHaveLength(0);
  });

  it("joins a new participant (先着順) when they skip without having answered before", async () => {
    const session: AnswerSession = {
      id: "session-1",
      puzzleRoundId: "round-1",
      groupId: "g1",
      answererIds: ["u1"],
      revealedCount: 0,
      wrongAnswerCount: 0,
      currentStepAttempts: 0,
      wrongAnswerLimit: 3,
      attemptsPerBlockLimit: 1,
      status: "active",
      startedAt: 0,
      endedAt: null,
    };
    const { useCase, answerSessions } = build(session);

    await useCase.execute({ groupId: "g1", userId: "someone-else", args: "" });

    expect((await answerSessions.getById("session-1"))?.answererIds).toEqual(["u1", "someone-else"]);
  });

  it("ends the session as fully_revealed when the last block is skipped, recording -1 for every participant", async () => {
    const session: AnswerSession = {
      id: "session-1",
      puzzleRoundId: "round-1",
      groupId: "g1",
      answererIds: ["u1", "u2"],
      revealedCount: 1,
      wrongAnswerCount: 0,
      currentStepAttempts: 0,
      wrongAnswerLimit: 3,
      attemptsPerBlockLimit: 1,
      status: "active",
      startedAt: 0,
      endedAt: null,
    };
    const { useCase, playerStats } = build(session);

    const reply = await useCase.execute({ groupId: "g1", userId: "u2", args: "" });

    expect(reply).toContain("全開示となりました");
    expect(playerStats.calls).toEqual([
      { groupId: "g1", userId: "u1", scoreDelta: -1 },
      { groupId: "g1", userId: "u2", scoreDelta: -1 },
    ]);
  });

  it("builds revealedCount from a fresh re-read, not the initial (possibly stale) lookup", async () => {
    // Mirrors two concurrent participants: the use case's initial getActiveByGroup() may
    // already be outdated by the time its transaction runs. Wrap the session repo so
    // execute() only ever sees the stale snapshot (revealedCount: 0) via getActiveByGroup,
    // while the live store (mutated below, simulating the other request's write) is what
    // the transactional re-read inside AnswerFlowService sees.
    const staleSnapshot: AnswerSession = {
      id: "session-1",
      puzzleRoundId: "round-1",
      groupId: "g1",
      answererIds: ["u1"],
      revealedCount: 0,
      wrongAnswerCount: 0,
      currentStepAttempts: 0,
      wrongAnswerLimit: 3,
      attemptsPerBlockLimit: 1,
      status: "active",
      startedAt: 0,
      endedAt: null,
    };
    const puzzleRounds = createFakePuzzleRoundRepository([round]);
    const liveAnswerSessions = createFakeAnswerSessionRepository([staleSnapshot]);
    const playerStats = createFakePlayerStatsRepository();
    const answerFlow = new AnswerFlowService(liveAnswerSessions, puzzleRounds, playerStats, createFakeTransactor());
    const staleViewAnswerSessions: AnswerSessionRepository = {
      create: liveAnswerSessions.create.bind(liveAnswerSessions),
      getById: liveAnswerSessions.getById.bind(liveAnswerSessions),
      update: liveAnswerSessions.update.bind(liveAnswerSessions),
      getByIdInTransaction: liveAnswerSessions.getByIdInTransaction.bind(liveAnswerSessions),
      updateInTransaction: liveAnswerSessions.updateInTransaction.bind(liveAnswerSessions),
      async getActiveByGroup() {
        return staleSnapshot;
      },
    };
    const useCase = new SkipUseCase(puzzleRounds, staleViewAnswerSessions, answerFlow);

    // A concurrent skip already revealed the first (of two) blocks.
    await liveAnswerSessions.update("session-1", { revealedCount: 1 });

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "" });

    expect(reply).toContain("全開示となりました");
    expect((await liveAnswerSessions.getById("session-1"))?.revealedCount).toBe(2);
  });
});
