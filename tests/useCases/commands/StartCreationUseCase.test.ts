import { textOf } from "../../../src/lineMessages.js";
import { describe, expect, it } from "vitest";
import { StartCreationUseCase } from "../../../src/useCases/commands/StartCreationUseCase.js";
import { createFakePuzzleRoundRepository } from "../../testUtils/fakeRepositories.js";

describe("StartCreationUseCase", () => {
  it("starts a round from directly supplied text", async () => {
    const repo = createFakePuzzleRoundRepository();
    const useCase = new StartCreationUseCase(repo);

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "石の上にも三年" });

    expect(textOf(reply)).toContain("全7箇所");
    const round = await repo.getByGroupAndPhase("g1", "creating");
    expect(round?.sourceType === "text" && round.sourceText).toBe("石の上にも三年");
    expect(round?.totalHideCount).toBe(7);
  });

  it("starts a round from a template", async () => {
    const repo = createFakePuzzleRoundRepository();
    const useCase = new StartCreationUseCase(repo);

    await useCase.execute({ groupId: "g1", userId: "u1", args: "テンプレート:1" });

    const round = await repo.getByGroupAndPhase("g1", "creating");
    expect(round?.sourceType === "text" && round.sourceText).toBe("石の上にも三年");
  });

  it("rejects an unknown template number", async () => {
    const repo = createFakePuzzleRoundRepository();
    const useCase = new StartCreationUseCase(repo);

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "テンプレート:999" });

    expect(textOf(reply)).toContain("テンプレート番号はありません");
    expect(await repo.getActiveByGroup("g1")).toBeNull();
  });

  it("rejects starting a second round while one is active", async () => {
    const repo = createFakePuzzleRoundRepository();
    const useCase = new StartCreationUseCase(repo);
    await useCase.execute({ groupId: "g1", userId: "u1", args: "問題A" });

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "問題B" });

    expect(textOf(reply)).toContain("すでに進行中");
  });

  it("starts an image round waiting for the creator's image when args are empty", async () => {
    const repo = createFakePuzzleRoundRepository();
    const useCase = new StartCreationUseCase(repo);

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "" });

    expect(textOf(reply)).toContain("画像を送ってください");
    const round = await repo.getByGroupAndPhase("g1", "preparing");
    expect(round).toMatchObject({
      sourceType: "image",
      creatorId: "u1",
      sourceImagePath: null,
      gridSize: null,
      answerText: null,
    });
  });

  it("replaces an image round that is still preparing", async () => {
    const repo = createFakePuzzleRoundRepository();
    const useCase = new StartCreationUseCase(repo);
    await useCase.execute({ groupId: "g1", userId: "u1", args: "" });

    const reply = await useCase.execute({ groupId: "g1", userId: "u2", args: "猿も木から落ちる" });

    expect(textOf(reply)).toContain("問題作成を開始しました");
    expect(await repo.getByGroupAndPhase("g1", "preparing")).toBeNull();
    expect((await repo.getByGroupAndPhase("g1", "creating"))?.sourceType).toBe("text");
  });
});
