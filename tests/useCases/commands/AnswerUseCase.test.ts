import { describe, expect, it } from "vitest";
import { AnswerUseCase } from "../../../src/useCases/commands/AnswerUseCase.js";
import { AnswerFlowService } from "../../../src/services/AnswerFlowService.js";
import {
  createFakeAnswerSessionRepository,
  createFakePlayerStatsRepository,
  createFakePuzzleRoundRepository,
  createFakeTransactor,
} from "../../testUtils/fakeRepositories.js";
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

function makeSession(overrides: Partial<AnswerSession> = {}): AnswerSession {
  return {
    id: "session-1",
    puzzleRoundId: "round-1",
    groupId: "g1",
    answererIds: ["u1"],
    revealedCount: 1,
    wrongAnswerCount: 0,
    currentStepAttempts: 0,
    wrongAnswerLimit: 2,
    attemptsPerBlockLimit: 2,
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
  const answerFlow = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());
  const useCase = new AnswerUseCase(puzzleRounds, answerSessions, answerFlow);
  return { useCase, puzzleRounds, answerSessions, playerStats };
}

describe("AnswerUseCase", () => {
  it("ends the session as correct and records +1 on a full match", async () => {
    const { useCase, playerStats } = build(makeSession());

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "ab" });

    expect(reply).toContain("正解です");
    expect(playerStats.calls).toEqual([{ groupId: "g1", userId: "u1", scoreDelta: 1 }]);
  });

  it("accepts an answer from a new participant (先着順) and joins them to the session", async () => {
    const { useCase, answerSessions } = build(makeSession({ attemptsPerBlockLimit: 2 }));

    const reply = await useCase.execute({ groupId: "g1", userId: "someone-else", args: "zz" });

    expect(reply).toContain("あと1回回答できます");
    const session = await answerSessions.getById("session-1");
    expect(session?.answererIds).toEqual(["u1", "someone-else"]);
  });

  it("records +1 for every participant, not just the one who typed the winning answer", async () => {
    const { useCase, answerSessions, playerStats } = build(
      makeSession({ answererIds: ["u1", "u2"] }),
    );

    const reply = await useCase.execute({ groupId: "g1", userId: "u2", args: "ab" });

    expect(reply).toContain("正解です");
    expect(playerStats.calls).toEqual([
      { groupId: "g1", userId: "u1", scoreDelta: 1 },
      { groupId: "g1", userId: "u2", scoreDelta: 1 },
    ]);
    const session = await answerSessions.getById("session-1");
    expect(session?.answererIds).toEqual(["u1", "u2"]);
  });

  it("allows a retry when under the per-block attempt limit", async () => {
    const { useCase, answerSessions } = build(makeSession({ attemptsPerBlockLimit: 2 }));

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "zz" });

    expect(reply).toContain("あと1回回答できます");
    const session = await answerSessions.getById("session-1");
    expect(session?.currentStepAttempts).toBe(1);
    expect(session?.revealedCount).toBe(1);
  });

  it("advances the reveal once the per-block attempt limit is hit, with blocks remaining", async () => {
    const threeCharRound: PuzzleRound = { ...round, sourceText: "abc", totalHideCount: 3, hiddenPositions: [0, 1, 2] };
    const { useCase, answerSessions } = build(
      makeSession({ attemptsPerBlockLimit: 1, wrongAnswerLimit: 5 }),
      threeCharRound,
    );

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "zz" });

    expect(reply).toContain("次を開示します");
    const session = await answerSessions.getById("session-1");
    expect(session?.revealedCount).toBe(2);
    expect(session?.currentStepAttempts).toBe(0);
    expect(session?.wrongAnswerCount).toBe(1);
  });

  it("ends as fully_revealed when the per-block limit is hit on the last block", async () => {
    const { useCase, answerSessions, playerStats } = build(
      makeSession({ attemptsPerBlockLimit: 1, wrongAnswerLimit: 5 }),
    );

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "zz" });

    expect(reply).toContain("全開示となりました");
    const session = await answerSessions.getById("session-1");
    expect(session?.status).toBe("fully_revealed");
    expect(session?.wrongAnswerCount).toBe(1);
    expect(playerStats.calls).toEqual([{ groupId: "g1", userId: "u1", scoreDelta: 0 }]);
  });

  it("ends the session when the wrong-answer limit is reached", async () => {
    const { useCase, playerStats } = build(
      makeSession({ wrongAnswerCount: 1, wrongAnswerLimit: 2, attemptsPerBlockLimit: 5 }),
    );

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "zz" });

    expect(reply).toContain("誤答上限");
    expect(playerStats.calls).toEqual([{ groupId: "g1", userId: "u1", scoreDelta: -1 }]);
  });
});
