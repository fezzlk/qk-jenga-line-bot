import { describe, expect, it } from "vitest";
import type { messagingApi, WebhookEvent } from "@line/bot-sdk";
import { HandleLineEventUseCase } from "../../src/useCases/HandleLineEventUseCase.js";
import { ImageRoundSetupUseCase } from "../../src/useCases/ImageRoundSetupUseCase.js";
import { StartCreationUseCase } from "../../src/useCases/commands/StartCreationUseCase.js";
import { HideUseCase } from "../../src/useCases/commands/HideUseCase.js";
import { CreationStatusUseCase } from "../../src/useCases/commands/CreationStatusUseCase.js";
import { StartChallengeUseCase } from "../../src/useCases/commands/StartChallengeUseCase.js";
import { AnswerUseCase } from "../../src/useCases/commands/AnswerUseCase.js";
import { SkipUseCase } from "../../src/useCases/commands/SkipUseCase.js";
import { ChallengeStatusUseCase } from "../../src/useCases/commands/ChallengeStatusUseCase.js";
import { ResultUseCase } from "../../src/useCases/commands/ResultUseCase.js";
import { AnswerFlowService } from "../../src/services/AnswerFlowService.js";
import { PuzzlePreviewService } from "../../src/services/PuzzlePreviewService.js";
import { textOf } from "../../src/lineMessages.js";
import {
  createFakeAnswerSessionRepository,
  createFakePlayerStatsRepository,
  createFakePuzzleImageStore,
  createFakePuzzleRoundRepository,
  createFakeTransactor,
} from "../testUtils/fakeRepositories.js";

function setup() {
  const puzzleRounds = createFakePuzzleRoundRepository();
  const answerSessions = createFakeAnswerSessionRepository();
  const playerStats = createFakePlayerStatsRepository();
  const transactor = createFakeTransactor();
  const answerFlow = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, transactor);
  const images = createFakePuzzleImageStore();
  const preview = new PuzzlePreviewService(images);
  const replies: messagingApi.Message[][] = [];
  const downloaded: string[] = [];

  const handler = new HandleLineEventUseCase(
    {
      問題作成開始: new StartCreationUseCase(puzzleRounds),
      隠す: new HideUseCase(puzzleRounds, transactor, preview),
      作成状況: new CreationStatusUseCase(puzzleRounds, preview),
      挑戦開始: new StartChallengeUseCase(puzzleRounds, answerSessions, answerFlow, preview),
      回答: new AnswerUseCase(puzzleRounds, answerSessions, answerFlow, preview),
      スキップ: new SkipUseCase(puzzleRounds, answerSessions, answerFlow, preview),
      挑戦状況: new ChallengeStatusUseCase(puzzleRounds, answerSessions, preview),
      結果: new ResultUseCase(playerStats),
    },
    new ImageRoundSetupUseCase(puzzleRounds, images, preview, {
      async getMessageContent(messageId) {
        downloaded.push(messageId);
        return Buffer.from(`image-${messageId}`);
      },
    }),
    {
      async reply(_token, messages) {
        replies.push(messages);
      },
    },
  );

  const base = {
    mode: "active" as const,
    timestamp: 0,
    webhookEventId: "e",
    deliveryContext: { isRedelivery: false },
    replyToken: "r",
  };
  async function sendText(userId: string, text: string): Promise<messagingApi.Message[]> {
    await handler.handle({
      ...base,
      type: "message",
      source: { type: "group", groupId: "g1", userId },
      message: { id: "m", type: "text", text, quoteToken: "q" },
    } as WebhookEvent);
    return replies.at(-1)!;
  }
  async function sendImage(userId: string, messageId: string): Promise<messagingApi.Message[]> {
    await handler.handle({
      ...base,
      type: "message",
      source: { type: "group", groupId: "g1", userId },
      message: { id: messageId, type: "image", quoteToken: "q", contentProvider: { type: "line" } },
    } as WebhookEvent);
    return replies.at(-1)!;
  }

  return { puzzleRounds, playerStats, images, downloaded, sendText, sendImage };
}

const imagesIn = (messages: messagingApi.Message[]) =>
  messages.filter((m): m is messagingApi.ImageMessage => m.type === "image");

describe("image round flow", () => {
  it("creates, hides and solves an image puzzle end to end", async () => {
    const t = setup();

    expect(textOf(await t.sendText("creator", "問題作成開始"))).toContain("画像を送ってください");

    const afterImage = await t.sendImage("creator", "img-1");
    expect(t.downloaded).toEqual(["img-1"]);
    const quickReplyLabels = afterImage
      .at(-1)
      ?.quickReply?.items?.map((item) => item.action?.label);
    expect(quickReplyLabels).toEqual(["9マス", "16マス", "25マス"]);

    expect(textOf(await t.sendText("creator", "9マス"))).toContain("正解を送ってください");

    const afterAnswer = await t.sendText("creator", "東京タワー");
    expect(textOf(afterAnswer)).toContain("全9箇所");
    expect(imagesIn(afterAnswer)).toHaveLength(1);
    expect(t.images.renders.at(-1)).toMatchObject({ revealedCount: 0, numbered: true });
    const created = await t.puzzleRounds.getByGroupAndPhase("g1", "creating");
    expect(created).toMatchObject({
      sourceType: "image",
      answerText: "東京タワー",
      totalHideCount: 9,
    });

    for (let cell = 1; cell <= 9; cell++) {
      const hider = cell % 2 === 0 ? "a" : "b";
      const reply = await t.sendText(hider, `隠す ${cell}`);
      if (cell < 9) expect(textOf(reply)).toContain(`残り${9 - cell}箇所`);
      else expect(textOf(reply)).toContain("作成完了");
    }

    const started = await t.sendText("solver", "挑戦開始");
    expect(imagesIn(started)).toHaveLength(1);
    expect(t.images.renders.at(-1)).toMatchObject({ revealedCount: 1, numbered: false });

    expect(textOf(await t.sendText("solver", "回答 スカイツリー"))).toContain("不正解");
    const solved = await t.sendText("solver", "回答 東京タワー");
    expect(textOf(solved)).toContain("正解です！");
    expect(textOf(solved)).toContain("正解: 東京タワー");
    expect(t.images.renders.at(-1)).toMatchObject({ revealedCount: 9, numbered: false });
    expect(await t.playerStats.get("g1", "solver")).toMatchObject({ totalScore: 1 });
  });

  it("offers 16 and 25 cells too", async () => {
    const t = setup();
    await t.sendText("creator", "問題作成開始");
    await t.sendImage("creator", "img-1");
    await t.sendText("creator", "25マス");
    await t.sendText("creator", "答え");

    const round = await t.puzzleRounds.getByGroupAndPhase("g1", "creating");
    expect(round).toMatchObject({ gridSize: 5, totalHideCount: 25 });
    expect(textOf(await t.sendText("a", "隠す 26"))).toContain("1〜25のマス番号");
  });

  it("ignores images when no image round is preparing", async () => {
    const t = setup();
    expect(await t.sendImage("someone", "holiday-photo")).toEqual([]);
    expect(t.downloaded).toEqual([]);
  });

  it("only reads setup input from the round's creator", async () => {
    const t = setup();
    await t.sendText("creator", "問題作成開始");

    expect(await t.sendImage("other", "img-x")).toEqual([]);
    await t.sendImage("creator", "img-1");
    expect(await t.sendText("other", "9マス")).toEqual([]);
    await t.sendText("creator", "9マス");
    // Ordinary chat from someone else must not become the answer.
    expect(await t.sendText("other", "お腹すいた")).toEqual([]);

    const round = await t.puzzleRounds.getByGroupAndPhase("g1", "preparing");
    expect(round).toMatchObject({ answerText: null, gridSize: 3 });
    expect(t.downloaded).toEqual(["img-1"]);
  });

  it("treats command keywords as commands, not as the answer", async () => {
    const t = setup();
    await t.sendText("creator", "問題作成開始");
    await t.sendImage("creator", "img-1");
    await t.sendText("creator", "9マス");

    expect(textOf(await t.sendText("creator", "作成状況"))).toContain("正解の登録を待っています");
    expect(textOf(await t.sendText("creator", "toString"))).toContain("正解を登録しました");
  });

  it("stays silent on unrelated chat", async () => {
    const t = setup();
    expect(await t.sendText("someone", "こんにちは")).toEqual([]);
    expect(await t.sendText("someone", "constructor")).toEqual([]);
    expect(await t.sendText("someone", "9マス")).toEqual([]);
  });
});
