import { describe, expect, it } from "vitest";
import { StartCreationUseCase } from "../../../src/useCases/commands/StartCreationUseCase.js";
import { createFakePuzzleRoundRepository } from "../../testUtils/fakeRepositories.js";

describe("StartCreationUseCase", () => {
  it("starts a round from directly supplied text", async () => {
    const repo = createFakePuzzleRoundRepository();
    const useCase = new StartCreationUseCase(repo);

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "石の上にも三年" });

    expect(reply).toContain("全7箇所");
    const round = await repo.getByGroupAndPhase("g1", "creating");
    expect(round?.sourceText).toBe("石の上にも三年");
    expect(round?.totalHideCount).toBe(7);
  });

  it("starts a round from a template", async () => {
    const repo = createFakePuzzleRoundRepository();
    const useCase = new StartCreationUseCase(repo);

    await useCase.execute({ groupId: "g1", userId: "u1", args: "テンプレート:1" });

    const round = await repo.getByGroupAndPhase("g1", "creating");
    expect(round?.sourceText).toBe("石の上にも三年");
  });

  it("rejects starting a second round while one is active", async () => {
    const repo = createFakePuzzleRoundRepository();
    const useCase = new StartCreationUseCase(repo);
    await useCase.execute({ groupId: "g1", userId: "u1", args: "問題A" });

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "問題B" });

    expect(reply).toContain("すでに進行中");
  });

  it("asks for text when args are empty", async () => {
    const repo = createFakePuzzleRoundRepository();
    const useCase = new StartCreationUseCase(repo);

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "" });

    expect(reply).toContain("問題文が指定されていません");
  });
});
