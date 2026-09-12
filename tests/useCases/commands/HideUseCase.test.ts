import { describe, expect, it } from "vitest";
import { HideUseCase } from "../../../src/useCases/commands/HideUseCase.js";
import {
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
    participantIds: [],
    lastHiderId: null,
    hiddenPositions: [],
    phase: "creating",
    createdAt: 0,
    ...overrides,
  };
}

describe("HideUseCase", () => {
  it("hides a valid position and reports remaining count", async () => {
    const repo = createFakePuzzleRoundRepository([makeRound()]);
    const useCase = new HideUseCase(repo, createFakeTransactor());

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "1" });

    expect(reply).toContain("残り2箇所");
    const round = await repo.getById("round-1");
    expect(round?.hiddenPositions).toEqual([0]);
    expect(round?.lastHiderId).toBe("u1");
  });

  it("rejects the same user hiding twice in a row", async () => {
    const repo = createFakePuzzleRoundRepository([makeRound({ lastHiderId: "u1" })]);
    const useCase = new HideUseCase(repo, createFakeTransactor());

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "2" });

    expect(reply).toContain("連続で隠せません");
  });

  it("allows a different user to hide next", async () => {
    const repo = createFakePuzzleRoundRepository([
      makeRound({ lastHiderId: "u1", hiddenPositions: [0] }),
    ]);
    const useCase = new HideUseCase(repo, createFakeTransactor());

    const reply = await useCase.execute({ groupId: "g1", userId: "u2", args: "2" });

    expect(reply).toContain("残り1箇所");
  });

  it("rejects an out-of-range position", async () => {
    const repo = createFakePuzzleRoundRepository([makeRound()]);
    const useCase = new HideUseCase(repo, createFakeTransactor());

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "9" });

    expect(reply).toContain("1〜3の文字位置");
  });

  it("rejects a position already hidden", async () => {
    const repo = createFakePuzzleRoundRepository([
      makeRound({ hiddenPositions: [0], lastHiderId: "u1" }),
    ]);
    const useCase = new HideUseCase(repo, createFakeTransactor());

    const reply = await useCase.execute({ groupId: "g1", userId: "u2", args: "1" });

    expect(reply).toContain("すでに隠されています");
  });

  it("transitions to ready_to_challenge when the last position is hidden", async () => {
    const repo = createFakePuzzleRoundRepository([
      makeRound({ hiddenPositions: [0, 1], lastHiderId: "u1" }),
    ]);
    const useCase = new HideUseCase(repo, createFakeTransactor());

    const reply = await useCase.execute({ groupId: "g1", userId: "u2", args: "3" });

    expect(reply).toContain("作成完了");
    const round = await repo.getById("round-1");
    expect(round?.phase).toBe("ready_to_challenge");
  });
});
