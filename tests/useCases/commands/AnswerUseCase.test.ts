import { textOf } from "../../../src/lineMessages.js";
import { describe, expect, it } from "vitest";
import { AnswerUseCase } from "../../../src/useCases/commands/AnswerUseCase.js";
import { AnswerFlowService } from "../../../src/services/AnswerFlowService.js";
import {
  createFakePuzzlePreview,
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
  creatorId: "creator",
  participantNames: {},
  turnIndex: 0,
  pendingInput: null,
  hiddenPositions: [0, 1],
  phase: "in_challenge",
  createdAt: 0,
};

function makeSession(overrides: Partial<AnswerSession> = {}): AnswerSession {
  return {
    id: "session-1",
    puzzleRoundId: "round-1",
    groupId: "g1",
    answererIds: ["u1"],
    answerModeUserIds: [],
    revealedCount: 1,
    wrongAnswerCount: 0,
    currentStepAttempts: 0,
    wrongAnswerLimit: 2,
    attemptsPerBlockLimit: 2,
    scoreCorrect: 1,
    scoreWrongLimit: -1,
    scoreFullyRevealed: 0,
    status: "active",
    startedAt: 0,
    endedAt: null,
    ...overrides,
  };
}

function build(session: AnswerSession, roundOverride: PuzzleRound = round) {
  const puzzleRounds = createFakePuzzleRoundRepository([roundOverride]);
  const answerSessions = createFakeAnswerSessionRepository([session]);
  const playerStats = createFakePlayerStatsRepository();
  const answerFlow = new AnswerFlowService(
    answerSessions,
    puzzleRounds,
    playerStats,
    createFakeTransactor(),
  );
  const useCase = new AnswerUseCase(
    puzzleRounds,
    answerSessions,
    answerFlow,
    createFakePuzzlePreview(),
    createFakeTransactor(),
  );
  return { useCase, puzzleRounds, answerSessions, playerStats, active: session };
}

describe("AnswerUseCase", () => {
  it("ends the session as correct and records +1 on a full match", async () => {
    const { active, useCase, playerStats } = build(makeSession());

    const reply = await useCase.submitAnswer(active, "u1", "ab");

    expect(textOf(reply)).toContain("正解です");
    expect(playerStats.calls).toEqual([{ groupId: "g1", userId: "u1", scoreDelta: 1 }]);
  });

  it("accepts an answer from a new participant (先着順) and joins them to the session", async () => {
    const { active, useCase, answerSessions } = build(makeSession({ attemptsPerBlockLimit: 2 }));

    const reply = await useCase.submitAnswer(active, "someone-else", "zz");

    expect(textOf(reply)).toContain("あと1回回答できます");
    const session = await answerSessions.getById("session-1");
    expect(session?.answererIds).toEqual(["u1", "someone-else"]);
  });

  it("records +1 for every participant, not just the one who typed the winning answer", async () => {
    const { active, useCase, answerSessions, playerStats } = build(
      makeSession({ answererIds: ["u1", "u2"] }),
    );

    const reply = await useCase.submitAnswer(active, "u2", "ab");

    expect(textOf(reply)).toContain("正解です");
    expect(playerStats.calls).toEqual([
      { groupId: "g1", userId: "u1", scoreDelta: 1 },
      { groupId: "g1", userId: "u2", scoreDelta: 1 },
    ]);
    const session = await answerSessions.getById("session-1");
    expect(session?.answererIds).toEqual(["u1", "u2"]);
  });

  it("allows a retry when under the per-block attempt limit", async () => {
    const { active, useCase, answerSessions } = build(makeSession({ attemptsPerBlockLimit: 2 }));

    const reply = await useCase.submitAnswer(active, "u1", "zz");

    expect(textOf(reply)).toContain("あと1回回答できます");
    const session = await answerSessions.getById("session-1");
    expect(session?.currentStepAttempts).toBe(1);
    expect(session?.revealedCount).toBe(1);
  });

  it("advances the reveal once the per-block attempt limit is hit, with blocks remaining", async () => {
    const threeCharRound: PuzzleRound = {
      ...round,
      sourceText: "abc",
      totalHideCount: 3,
      hiddenPositions: [0, 1, 2],
    };
    const { active, useCase, answerSessions } = build(
      makeSession({ attemptsPerBlockLimit: 1, wrongAnswerLimit: 5 }),
      threeCharRound,
    );

    const reply = await useCase.submitAnswer(active, "u1", "zz");

    expect(textOf(reply)).toContain("次を開示します");
    const session = await answerSessions.getById("session-1");
    expect(session?.revealedCount).toBe(2);
    expect(session?.currentStepAttempts).toBe(0);
    expect(session?.wrongAnswerCount).toBe(1);
  });

  it("ends as fully_revealed and records 0 when the per-block limit is hit on the last block", async () => {
    const { active, useCase, answerSessions, playerStats } = build(
      makeSession({ attemptsPerBlockLimit: 1, wrongAnswerLimit: 5 }),
    );

    const reply = await useCase.submitAnswer(active, "u1", "zz");

    expect(textOf(reply)).toContain("全開示となりました");
    const session = await answerSessions.getById("session-1");
    expect(session?.status).toBe("fully_revealed");
    expect(session?.wrongAnswerCount).toBe(1);
    expect(playerStats.calls).toEqual([{ groupId: "g1", userId: "u1", scoreDelta: 0 }]);
  });

  it("ends the session and records -1 when the wrong-answer limit is reached", async () => {
    const { active, useCase, playerStats } = build(
      makeSession({ wrongAnswerCount: 1, wrongAnswerLimit: 2, attemptsPerBlockLimit: 5 }),
    );

    const reply = await useCase.submitAnswer(active, "u1", "zz");

    expect(textOf(reply)).toContain("誤答上限");
    expect(playerStats.calls).toEqual([{ groupId: "g1", userId: "u1", scoreDelta: -1 }]);
  });

  it("builds counters from a fresh re-read, not the initial (possibly stale) lookup", async () => {
    // Mirrors two concurrent answerers: the use case's initial getActiveByGroup() may
    // already be outdated by the time AnswerFlowService.submitAnswer's transaction runs.
    // The caller (HandleLineEventUseCase) only ever looked up the stale snapshot
    // (wrongAnswerCount: 0) via getActiveByGroup, while the live store (mutated below,
    // simulating the other request's write) is what the transactional re-read sees.
    const staleSnapshot = makeSession({
      wrongAnswerCount: 0,
      wrongAnswerLimit: 5,
      attemptsPerBlockLimit: 5,
    });
    const puzzleRounds = createFakePuzzleRoundRepository([round]);
    const liveAnswerSessions = createFakeAnswerSessionRepository([staleSnapshot]);
    const playerStats = createFakePlayerStatsRepository();
    const answerFlow = new AnswerFlowService(
      liveAnswerSessions,
      puzzleRounds,
      playerStats,
      createFakeTransactor(),
    );
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
    const useCase = new AnswerUseCase(
      puzzleRounds,
      staleViewAnswerSessions,
      answerFlow,
      createFakePuzzlePreview(),
      createFakeTransactor(),
    );

    await liveAnswerSessions.update("session-1", { wrongAnswerCount: 3 });

    const reply = await useCase.submitAnswer(staleSnapshot, "u1", "zz");

    expect(textOf(reply)).toContain("誤答: 4/5");
    expect((await liveAnswerSessions.getById("session-1"))?.wrongAnswerCount).toBe(4);
  });

  it("replies that the challenge is over, without scoring, if it ended concurrently (FEZ-224)", async () => {
    // The caller looked the session up while it was still active; another request then
    // ended it before this answer's transaction re-read it.
    const { active, useCase, answerSessions, playerStats } = build(makeSession());
    await answerSessions.update("session-1", { status: "correct" });

    const reply = await useCase.submitAnswer(active, "u1", "ab");

    expect(textOf(reply)).toBe("この挑戦は既に終了しています。");
    expect(playerStats.calls).toEqual([]);
  });
});
