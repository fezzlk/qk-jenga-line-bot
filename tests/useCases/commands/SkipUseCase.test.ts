import { describe, expect, it } from "vitest";
import { SkipUseCase } from "../../../src/useCases/commands/SkipUseCase.js";
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
    const { useCase, answerSessions, playerStats } = build(session);

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "" });

    expect(reply).toContain("スキップしました");
    expect((await answerSessions.getById("session-1"))?.revealedCount).toBe(1);
    expect(playerStats.calls).toHaveLength(0);
  });

  it("ends the session as fully_revealed when the last block is skipped", async () => {
    const session: AnswerSession = {
      id: "session-1",
      puzzleRoundId: "round-1",
      groupId: "g1",
      answererId: "u1",
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

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "" });

    expect(reply).toContain("全開示となりました");
    expect(playerStats.calls).toEqual([{ groupId: "g1", userId: "u1", scoreDelta: -1 }]);
  });
});
