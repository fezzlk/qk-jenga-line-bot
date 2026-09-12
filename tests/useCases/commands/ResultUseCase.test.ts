import { describe, expect, it } from "vitest";
import { ResultUseCase } from "../../../src/useCases/commands/ResultUseCase.js";
import { createFakePlayerStatsRepository } from "../../testUtils/fakeRepositories.js";

describe("ResultUseCase", () => {
  it("reports no record when the player has never played", async () => {
    const stats = createFakePlayerStatsRepository();
    const useCase = new ResultUseCase(stats);

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "" });

    expect(reply).toContain("まだありません");
  });

  it("reports totals after a recorded result", async () => {
    const stats = createFakePlayerStatsRepository();
    await stats.recordResult("g1", "u1", -1);
    const useCase = new ResultUseCase(stats);

    const reply = await useCase.execute({ groupId: "g1", userId: "u1", args: "" });

    expect(reply).toContain("通算プレイ回数: 1回");
    expect(reply).toContain("通算スコア: -1点");
  });
});
