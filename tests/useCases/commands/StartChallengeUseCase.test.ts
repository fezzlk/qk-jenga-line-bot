import { textOf } from "../../../src/lineMessages.js";
import { describe, expect, it } from "vitest";
import { StartChallengeUseCase } from "../../../src/useCases/commands/StartChallengeUseCase.js";
import { AnswerFlowService } from "../../../src/services/AnswerFlowService.js";
import {
  createFakePuzzlePreview,
  createFakeAnswerSessionRepository,
  createFakePlayerStatsRepository,
  createFakePuzzleRoundRepository,
  createFakeTransactor,
} from "../../testUtils/fakeRepositories.js";
import type { TextPuzzleRound } from "../../../src/types.js";

function makeRound(overrides: Partial<TextPuzzleRound> = {}): TextPuzzleRound {
  return {
    id: "round-1",
    groupId: "g1",
    sourceType: "text",
    sourceText: "abc",
    totalHideCount: 3,
    participantIds: ["u1", "u2"],
    creatorId: "creator",
    participantNames: {},
    turnIndex: 0,
    pendingInput: null,
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
    const answerFlow = new AnswerFlowService(
      answerSessions,
      puzzleRounds,
      playerStats,
      createFakeTransactor(),
    );
    const useCase = new StartChallengeUseCase(
      puzzleRounds,
      answerSessions,
      answerFlow,
      createFakePuzzlePreview(),
    );

    const reply = await useCase.execute({ groupId: "g1", userId: "u3" });

    expect(textOf(reply)).toContain("挑戦を開始しました");
    const round = await puzzleRounds.getById("round-1");
    expect(round?.phase).toBe("in_challenge");
    const session = await answerSessions.getActiveByGroup("g1");
    expect(session?.answererIds).toEqual(["u3"]);
    expect(session?.revealedCount).toBe(1);
  });

  it("refuses when no round is ready to challenge", async () => {
    const puzzleRounds = createFakePuzzleRoundRepository();
    const answerSessions = createFakeAnswerSessionRepository();
    const playerStats = createFakePlayerStatsRepository();
    const answerFlow = new AnswerFlowService(
      answerSessions,
      puzzleRounds,
      playerStats,
      createFakeTransactor(),
    );
    const useCase = new StartChallengeUseCase(
      puzzleRounds,
      answerSessions,
      answerFlow,
      createFakePuzzlePreview(),
    );

    const reply = await useCase.execute({ groupId: "g1", userId: "u3" });

    expect(textOf(reply)).toContain("挑戦できるパズルラウンドがありません");
  });
});
