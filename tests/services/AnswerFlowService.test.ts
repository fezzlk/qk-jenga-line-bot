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

  describe("submitAnswer", () => {
    it("re-reads the session by id instead of trusting a caller-supplied snapshot", async () => {
      const puzzleRounds = createFakePuzzleRoundRepository([round]);
      const answerSessions = createFakeAnswerSessionRepository([session]);
      const playerStats = createFakePlayerStatsRepository();
      const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

      // Simulates another request's write landing between this caller obtaining
      // session.id and submitAnswer's transactional re-read.
      await answerSessions.update(session.id, { wrongAnswerCount: 2, wrongAnswerLimit: 3 });

      const result = await service.submitAnswer(session.id, round, "u1", "zz");

      expect(result.outcome).toBe("wrong_limit");
      if (result.outcome === "wrong_limit") {
        expect(result.session.wrongAnswerCount).toBe(3);
        expect(result.score).toBe(-1);
      }
    });

    it("ends the session as correct and records scoreCorrect", async () => {
      const puzzleRounds = createFakePuzzleRoundRepository([round]);
      const answerSessions = createFakeAnswerSessionRepository([session]);
      const playerStats = createFakePlayerStatsRepository();
      const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

      const result = await service.submitAnswer(session.id, round, "u1", "ab");

      expect(result.outcome).toBe("correct");
      if (result.outcome === "correct") {
        expect(result.score).toBe(1);
      }
      expect(playerStats.calls).toEqual([{ groupId: "g1", userId: "u1", scoreDelta: 1 }]);
      const closedRound = await puzzleRounds.getById("round-1");
      expect(closedRound?.phase).toBe("closed");
    });

    it("ends the session as wrong_limit and records scoreWrongLimit", async () => {
      const puzzleRounds = createFakePuzzleRoundRepository([round]);
      const answerSessions = createFakeAnswerSessionRepository([
        { ...session, wrongAnswerCount: 2, wrongAnswerLimit: 3 },
      ]);
      const playerStats = createFakePlayerStatsRepository();
      const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

      const result = await service.submitAnswer(session.id, round, "u1", "zz");

      expect(result.outcome).toBe("wrong_limit");
      if (result.outcome === "wrong_limit") {
        expect(result.score).toBe(-1);
      }
    });

    it("ends the session as fully_revealed when the per-block attempt limit is hit on the last block", async () => {
      const puzzleRounds = createFakePuzzleRoundRepository([round]);
      const answerSessions = createFakeAnswerSessionRepository([
        { ...session, revealedCount: 1, attemptsPerBlockLimit: 1 },
      ]);
      const playerStats = createFakePlayerStatsRepository();
      const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

      const result = await service.submitAnswer(session.id, round, "u1", "zz");

      expect(result.outcome).toBe("fully_revealed");
      if (result.outcome === "fully_revealed") {
        expect(result.score).toBe(0);
      }
    });

    it("reveals the next block and continues when the per-block limit is hit with blocks remaining", async () => {
      const threeCharRound: PuzzleRound = {
        ...round,
        sourceText: "abc",
        totalHideCount: 3,
        hiddenPositions: [0, 1, 2],
      };
      const puzzleRounds = createFakePuzzleRoundRepository([threeCharRound]);
      const answerSessions = createFakeAnswerSessionRepository([
        { ...session, attemptsPerBlockLimit: 1, wrongAnswerLimit: 5 },
      ]);
      const playerStats = createFakePlayerStatsRepository();
      const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

      const result = await service.submitAnswer(session.id, threeCharRound, "u1", "zz");

      expect(result.outcome).toBe("continue_revealed");
      if (result.outcome === "continue_revealed") {
        expect(result.session.revealedCount).toBe(1);
      }
      expect(playerStats.calls).toHaveLength(0);
    });

    it("continues without revealing when under the per-block attempt limit", async () => {
      const puzzleRounds = createFakePuzzleRoundRepository([round]);
      const answerSessions = createFakeAnswerSessionRepository([{ ...session, attemptsPerBlockLimit: 2 }]);
      const playerStats = createFakePlayerStatsRepository();
      const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

      const result = await service.submitAnswer(session.id, round, "u1", "zz");

      expect(result.outcome).toBe("continue");
      if (result.outcome === "continue") {
        expect(result.session.currentStepAttempts).toBe(1);
      }
      expect(playerStats.calls).toHaveLength(0);
    });
  });

  describe("submitSkip", () => {
    it("re-reads the session by id instead of trusting a caller-supplied snapshot", async () => {
      const puzzleRounds = createFakePuzzleRoundRepository([round]);
      const answerSessions = createFakeAnswerSessionRepository([session]);
      const playerStats = createFakePlayerStatsRepository();
      const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

      // Simulates a concurrent skip already having revealed the first (of two) blocks.
      await answerSessions.update(session.id, { revealedCount: 1 });

      const result = await service.submitSkip(session.id, round, "u2");

      expect(result.outcome).toBe("fully_revealed");
      if (result.outcome === "fully_revealed") {
        expect(result.session.revealedCount).toBe(2);
        expect(result.score).toBe(0);
      }
    });

    it("adds a first-time skipper to answererIds based on the re-read session and continues", async () => {
      const puzzleRounds = createFakePuzzleRoundRepository([round]);
      const answerSessions = createFakeAnswerSessionRepository([session]);
      const playerStats = createFakePlayerStatsRepository();
      const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

      const result = await service.submitSkip(session.id, round, "u2");

      expect(result.outcome).toBe("continue");
      if (result.outcome === "continue") {
        expect(result.session.revealedCount).toBe(1);
        expect(result.session.answererIds).toEqual(["u1", "u2"]);
      }
      expect(playerStats.calls).toHaveLength(0);
    });
  });
});
