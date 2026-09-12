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

    expect(result.status).toBe("active");
    expect(result.revealedCount).toBe(1);
    expect(playerStats.calls).toHaveLength(0);
  });

  it("ends the session as fully_revealed on the last block and records -1", async () => {
    const puzzleRounds = createFakePuzzleRoundRepository([round]);
    const answerSessions = createFakeAnswerSessionRepository([session]);
    const playerStats = createFakePlayerStatsRepository();
    const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

    const result = await service.revealNextBlock({ ...session, revealedCount: 1 }, round);

    expect(result.status).toBe("fully_revealed");
    expect(playerStats.calls).toEqual([{ groupId: "g1", userId: "u1", scoreDelta: -1 }]);
    const closedRound = await puzzleRounds.getById("round-1");
    expect(closedRound?.phase).toBe("closed");
  });

  it("records -1 for every id in extraPatch.answererIds when a new participant just joined", async () => {
    const puzzleRounds = createFakePuzzleRoundRepository([round]);
    const answerSessions = createFakeAnswerSessionRepository([session]);
    const playerStats = createFakePlayerStatsRepository();
    const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

    await service.endSession(session, round, "correct", { answererIds: ["u1", "u2"] });

    expect(playerStats.calls).toEqual([
      { groupId: "g1", userId: "u1", scoreDelta: -1 },
      { groupId: "g1", userId: "u2", scoreDelta: -1 },
    ]);
  });

  describe("submitAnswer", () => {
    it("returns no_session when the session is no longer active by the time it re-reads", async () => {
      const puzzleRounds = createFakePuzzleRoundRepository([round]);
      const answerSessions = createFakeAnswerSessionRepository([{ ...session, status: "correct" }]);
      const playerStats = createFakePlayerStatsRepository();
      const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

      const result = await service.submitAnswer(session.id, round, "u1", "ab");

      expect(result).toEqual({ kind: "no_session" });
    });

    it("re-reads the session by id instead of trusting a caller-supplied snapshot", async () => {
      const puzzleRounds = createFakePuzzleRoundRepository([round]);
      const answerSessions = createFakeAnswerSessionRepository([session]);
      const playerStats = createFakePlayerStatsRepository();
      const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

      // Simulates another request's write landing between this caller obtaining
      // session.id and submitAnswer's transactional re-read.
      await answerSessions.update(session.id, { wrongAnswerCount: 2, wrongAnswerLimit: 3 });

      const result = await service.submitAnswer(session.id, round, "u1", "zz");

      expect(result.kind).toBe("ended");
      if (result.kind === "ended") {
        expect(result.reason).toBe("wrong_limit");
        expect(result.session.wrongAnswerCount).toBe(3);
      }
    });
  });

  describe("submitSkip", () => {
    it("returns no_session when the session is no longer active by the time it re-reads", async () => {
      const puzzleRounds = createFakePuzzleRoundRepository([round]);
      const answerSessions = createFakeAnswerSessionRepository([{ ...session, status: "fully_revealed" }]);
      const playerStats = createFakePlayerStatsRepository();
      const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

      const result = await service.submitSkip(session.id, round, "u1");

      expect(result).toEqual({ kind: "no_session" });
    });

    it("adds a first-time skipper to answererIds based on the re-read session", async () => {
      const puzzleRounds = createFakePuzzleRoundRepository([round]);
      const answerSessions = createFakeAnswerSessionRepository([session]);
      const playerStats = createFakePlayerStatsRepository();
      const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());

      const result = await service.submitSkip(session.id, round, "u2");

      expect(result.kind).toBe("revealed");
      if (result.kind === "revealed") {
        expect(result.session.answererIds).toEqual(["u1", "u2"]);
      }
    });
  });
});
