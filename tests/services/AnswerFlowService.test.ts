import { describe, expect, it } from "vitest";
import { AnswerFlowService } from "../../src/services/AnswerFlowService.js";
import {
  createFakeAnswerSessionRepository,
  createFakePlayerStatsRepository,
  createFakePuzzleRoundRepository,
  createFakeTransactor,
} from "../testUtils/fakeRepositories.js";
import type { AnswerSession, PuzzleRound } from "../../src/types.js";

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
  scoreCorrect: 1,
  scoreWrongLimit: -1,
  scoreFullyRevealed: 0,
  status: "active",
  startedAt: 0,
  endedAt: null,
};

describe("AnswerFlowService", () => {
  it("reveals the next block while more remain", async () => {
    const puzzleRounds = createFakePuzzleRoundRepository([round]);
    const answerSessions = createFakeAnswerSessionRepository([session]);
    const playerStats = createFakePlayerStatsRepository();
    const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

    const result = await service.revealNextBlock(session, round);

    expect(result.session.status).toBe("active");
    expect(result.session.revealedCount).toBe(1);
    expect(result.score).toBeNull();
    expect(playerStats.calls).toHaveLength(0);
  });

  it("ends the session as fully_revealed on the last block and records 0", async () => {
    const puzzleRounds = createFakePuzzleRoundRepository([round]);
    const answerSessions = createFakeAnswerSessionRepository([session]);
    const playerStats = createFakePlayerStatsRepository();
    const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

    const result = await service.revealNextBlock({ ...session, revealedCount: 1 }, round);

    expect(result.session.status).toBe("fully_revealed");
    expect(result.score).toBe(0);
    expect(playerStats.calls).toEqual([{ groupId: "g1", userId: "u1", scoreDelta: 0 }]);
    const closedRound = await puzzleRounds.getById("round-1");
    expect(closedRound?.phase).toBe("closed");
  });

  it("records +1 for every id in extraPatch.answererIds when a new participant just joined", async () => {
    const puzzleRounds = createFakePuzzleRoundRepository([round]);
    const answerSessions = createFakeAnswerSessionRepository([session]);
    const playerStats = createFakePlayerStatsRepository();
    const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

    const { score } = await service.endSession(session, round, "correct", { answererIds: ["u1", "u2"] });

    expect(score).toBe(1);
    expect(playerStats.calls).toEqual([
      { groupId: "g1", userId: "u1", scoreDelta: 1 },
      { groupId: "g1", userId: "u2", scoreDelta: 1 },
    ]);
  });
});
