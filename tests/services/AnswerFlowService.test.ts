import { describe, expect, it } from "vitest";
import { AnswerFlowService } from "../../src/services/AnswerFlowService.js";
import {
  createFakeAnswerSessionRepository,
  createFakePlayerStatsRepository,
  createFakePuzzleRoundRepository,
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
  answererId: "u1",
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
    const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats);

    const result = await service.revealNextBlock(session, round);

    expect(result.status).toBe("active");
    expect(result.revealedCount).toBe(1);
    expect(playerStats.calls).toHaveLength(0);
  });

  it("ends the session as fully_revealed on the last block and records -1", async () => {
    const puzzleRounds = createFakePuzzleRoundRepository([round]);
    const answerSessions = createFakeAnswerSessionRepository([session]);
    const playerStats = createFakePlayerStatsRepository();
    const service = new AnswerFlowService(answerSessions, puzzleRounds, playerStats);

    const result = await service.revealNextBlock({ ...session, revealedCount: 1 }, round);

    expect(result.status).toBe("fully_revealed");
    expect(playerStats.calls).toEqual([{ groupId: "g1", userId: "u1", scoreDelta: -1 }]);
    const closedRound = await puzzleRounds.getById("round-1");
    expect(closedRound?.phase).toBe("closed");
  });
});
