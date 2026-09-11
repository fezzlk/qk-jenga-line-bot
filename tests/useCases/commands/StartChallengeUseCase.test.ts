import { describe, expect, it } from "vitest";
import { StartChallengeUseCase } from "../../../src/useCases/commands/StartChallengeUseCase.js";
import { AnswerFlowService } from "../../../src/services/AnswerFlowService.js";
import {
  createFakeAnswerSessionRepository,
  createFakePlayerStatsRepository,
  createFakePuzzleRoundRepository,
  createFakeTransactor,
} from "../../testUtils/fakeRepositories.js";
import type { PuzzleRound } from "../../../src/types.js";

function makeRound(overrides: Partial<PuzzleRound> = {}): PuzzleRound {
  return {
    id: "round-1",
    groupId: "g1",
    sourceType: "text",
    sourceText: "abc",
    totalHideCount: 3,
    participantIds: ["u1", "u2"],
    lastHiderId: "u2",
    hiddenPositions: [0, 1, 2],
    phase: "ready_to_challenge",
    createdAt: 0,
    ...overrides,
  };
}

describe("StartChallengeUseCase", () => {
  it("creates an active session and reveals the first block", async () => {
    const puzzleRounds = createFakePuzzleRoundRepository([makeRound()]);
    const answerSessions = createFakeAnswerSessionRepository();
    const playerStats = createFakePlayerStatsRepository();
    const answerFlow = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());
    const useCase = new StartChallengeUseCase(puzzleRounds, answerSessions, answerFlow);

    const reply = await useCase.execute({ groupId: "g1", userId: "u3", args: "" });

    expect(reply).toContain("挑戦を開始しました");
    const round = await puzzleRounds.getById("round-1");
    expect(round?.phase).toBe("in_challenge");
    const session = await answerSessions.getActiveByGroup("g1");
    expect(session?.answererId).toBe("u3");
    expect(session?.revealedCount).toBe(1);
  });

  it("refuses when no round is ready to challenge", async () => {
    const puzzleRounds = createFakePuzzleRoundRepository();
    const answerSessions = createFakeAnswerSessionRepository();
    const playerStats = createFakePlayerStatsRepository();
    const answerFlow = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, createFakeTransactor());
    const useCase = new StartChallengeUseCase(puzzleRounds, answerSessions, answerFlow);

    const reply = await useCase.execute({ groupId: "g1", userId: "u3", args: "" });

    expect(reply).toContain("挑戦できるパズルラウンドがありません");
  });
});
