import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import type { messagingApi, WebhookEvent } from "@line/bot-sdk";
import { HandleLineEventUseCase } from "../../src/useCases/HandleLineEventUseCase.js";
import { RoundSetupUseCase } from "../../src/useCases/RoundSetupUseCase.js";
import { RecruitUseCase } from "../../src/useCases/RecruitUseCase.js";
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
  PlaygroundLineMessaging,
  type LineGateway,
} from "../../src/playground/PlaygroundLineMessaging.js";
import { PlaygroundService } from "../../src/playground/PlaygroundService.js";
import { createPlaygroundRouter } from "../../src/playground/router.js";
import { InMemoryPlaygroundStore } from "../../src/playground/store.js";
import {
  createFakeAnswerSessionRepository,
  createFakePlayerStatsRepository,
  createFakePuzzleImageStore,
  createFakePuzzleRoundRepository,
  createFakeTransactor,
} from "../testUtils/fakeRepositories.js";

const GROUP = "Ctestgroup";
const TOKEN = "playground-token";

/** A stand-in for LineMessagingService that records what would have gone to LINE. */
function fakeLine() {
  const replies: { token: string; messages: messagingApi.Message[] }[] = [];
  const pushes: { to: string; messages: messagingApi.Message[] }[] = [];
  const gateway: LineGateway = {
    async reply(token, messages) {
      replies.push({ token, messages });
    },
    async push(to, messages) {
      pushes.push({ to, messages });
    },
    async getDisplayName(_groupId, userId) {
      return userId === "Ualice" ? "アリス" : null;
    },
    async getGroupName() {
      return "テスト用グループ";
    },
    async getMessageContent() {
      throw new Error("real content download should not happen in these tests");
    },
  };
  return { gateway, replies, pushes };
}

async function setup() {
  const puzzleRounds = createFakePuzzleRoundRepository();
  const answerSessions = createFakeAnswerSessionRepository();
  const playerStats = createFakePlayerStatsRepository();
  const transactor = createFakeTransactor();
  const answerFlow = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, transactor);
  const preview = new PuzzlePreviewService(createFakePuzzleImageStore());
  const line = fakeLine();
  const store = new InMemoryPlaygroundStore();
  const playgroundLine = new PlaygroundLineMessaging(line.gateway, store);

  const handler = new HandleLineEventUseCase({
    commands: {
      問題作成開始: new StartCreationUseCase(puzzleRounds),
      作成状況: new CreationStatusUseCase(puzzleRounds, preview),
      挑戦開始: new StartChallengeUseCase(puzzleRounds, answerSessions, answerFlow, preview),
      スキップ: new SkipUseCase(puzzleRounds, answerSessions, answerFlow, preview),
      挑戦状況: new ChallengeStatusUseCase(puzzleRounds, answerSessions, preview),
      結果: new ResultUseCase(playerStats),
    },
    roundSetup: new RoundSetupUseCase(puzzleRounds, createFakePuzzleImageStore(), playgroundLine),
    recruit: new RecruitUseCase(puzzleRounds, transactor, preview, playgroundLine),
    hide: new HideUseCase(puzzleRounds, transactor, preview),
    answer: new AnswerUseCase(puzzleRounds, answerSessions, answerFlow, preview, transactor),
    puzzleRounds,
    answerSessions,
    lineMessaging: playgroundLine,
  });
  const service = new PlaygroundService(store, playgroundLine, handler, new Set([GROUP]));

  /** The real user acting in the LINE app (a real webhook, answered with a real reply). */
  async function aliceDoes(part: Pick<WebhookEvent, "type"> & Record<string, unknown>) {
    const event = {
      mode: "active",
      timestamp: 0,
      webhookEventId: "e",
      deliveryContext: { isRedelivery: false },
      replyToken: "real-reply-token",
      source: { type: "group", groupId: GROUP, userId: "Ualice" },
      ...part,
    } as WebhookEvent;
    await service.recordRealEvents([event]);
    await handler.handle(event);
    return line.replies.at(-1)!.messages;
  }
  const aliceSays = (text: string) =>
    aliceDoes({ type: "message", message: { id: "m", type: "text", text, quoteToken: "q" } });
  const aliceTaps = (messages: messagingApi.Message[], label: string) =>
    aliceDoes({ type: "postback", postback: { data: postbackOf(messages, label).data } });

  const postbackOf = (messages: messagingApi.Message[], label: string) => {
    const action = (messages.at(-1)?.quickReply?.items ?? [])
      .map((i) => i.action)
      .find((a) => a?.label === label);
    if (action?.type !== "postback") throw new Error(`no ${label} button`);
    return { type: "postback" as const, data: action.data ?? "", displayText: action.displayText };
  };

  return { store, service, line, aliceSays, aliceTaps, postbackOf };
}

describe("PlaygroundService", () => {
  it("plays the qk-jenga flow with fictional users, echoing each action and reply in one push", async () => {
    const t = await setup();
    const bob = await t.store.addUser(GROUP, "Bさん");
    const carol = await t.store.addUser(GROUP, "Cさん");

    const formats = await t.aliceSays("問題作成開始");
    await t.aliceTaps(formats, "文章で作る");
    const recruiting = await t.aliceSays("ab");

    const joined = await t.service.send(GROUP, bob.userId, t.postbackOf(recruiting, "参加する"));
    expect(joined.pushes).toBe(1);
    expect(textOf(joined.replies)).toContain("Bさん");
    expect(joined.replies.at(-1)?.quickReply).toBeDefined();
    const push = t.line.pushes.at(-1)!;
    expect(push.to).toBe(GROUP);
    expect(push.messages[0]).toEqual({ type: "text", text: "🧪Bさん: 参加する" });
    expect(push.messages.slice(1).every((m) => m.quickReply === undefined)).toBe(true);

    await t.service.send(GROUP, carol.userId, t.postbackOf(recruiting, "参加する"));
    const closed = await t.aliceTaps(recruiting, "締め切る");
    expect(textOf(closed)).toContain("最初はBさん");

    // Bob and Carol take turns hiding the two positions.
    let turn = closed;
    for (const [user, position] of [
      [bob, "1"],
      [carol, "2"],
    ] as const) {
      await t.service.send(GROUP, user.userId, t.postbackOf(turn, "隠す"));
      turn = (await t.service.send(GROUP, user.userId, { type: "text", text: position })).replies;
    }
    expect(textOf(turn)).toContain("作成完了");

    const started = await t.aliceTaps(turn, "挑戦開始");
    await t.service.send(GROUP, carol.userId, t.postbackOf(started, "回答する"));
    const answered = await t.service.send(GROUP, carol.userId, { type: "text", text: "ab" });
    expect(textOf(answered.replies)).toContain("正解");
    expect(t.line.pushes.at(-1)!.messages[0]).toEqual({ type: "text", text: "🧪Cさん: ab" });

    // Replies to fictional users only ever went out as pushes; real replies only to alice.
    expect(t.line.replies.every((r) => r.token === "real-reply-token")).toBe(true);
  });

  it("logs the real user's actions and the bot's replies to them, buttons included", async () => {
    const t = await setup();
    const bob = await t.store.addUser(GROUP, "Bさん");
    const formats = await t.aliceSays("問題作成開始");
    await t.aliceTaps(formats, "文章で作る");
    await t.aliceSays("ab");

    // The controller only sees the log: find the 参加する button the bot showed alice.
    const log = await t.service.listLog(GROUP, 30);
    expect(log.map((e) => e.kind)).toEqual(["real", "bot", "real", "bot", "real", "bot"]);
    const lastBot = log.at(-1);
    if (lastBot?.kind !== "bot") throw new Error("expected a bot entry");
    const joined = await t.service.send(
      GROUP,
      bob.userId,
      t.postbackOf(lastBot.messages, "参加する"),
    );
    expect(textOf(joined.replies)).toContain("Bさん");

    const after = await t.service.listLog(GROUP, 2);
    expect(after[0]).toMatchObject({
      kind: "fictional",
      userId: bob.userId,
      name: "Bさん",
      text: "参加する",
    });
    expect(after[1]).toMatchObject({ kind: "bot", replyTo: bob.userId });
    await expect(t.service.listLog("Cother", 10)).rejects.toMatchObject({ status: 403 });
  });

  it("refuses groups that aren't allowed and users from another group", async () => {
    const t = await setup();
    const other = await t.store.addUser("Cother", "Dさん");
    await expect(
      t.service.send("Cother", other.userId, { type: "text", text: "x" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      t.service.send(GROUP, other.userId, { type: "text", text: "x" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("records real groups with their name and lists allowed ones", async () => {
    const t = await setup();
    await t.aliceSays("結果");
    const groups = await t.service.listGroups();
    expect(groups).toEqual([
      expect.objectContaining({
        groupId: GROUP,
        name: "テスト用グループ",
        realUserIds: ["Ualice"],
        allowed: true,
      }),
    ]);
  });

  it("serves an image a fictional user sent to the bot's content download", async () => {
    const t = await setup();
    const bob = await t.store.addUser(GROUP, "Bさん");
    // The bot ignores stray images outside image setup, but the push still echoes the action.
    const result = await t.service.send(GROUP, bob.userId, {
      type: "image",
      base64: Buffer.from("png").toString("base64"),
    });
    expect(result.pushes).toBe(1);
    expect(t.line.pushes.at(-1)!.messages[0]).toEqual({
      type: "text",
      text: "🧪Bさん: ［画像を送信］",
    });
  });
});

describe("playground router", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  async function start() {
    const t = await setup();
    const app = express();
    app.use(
      "/playground",
      createPlaygroundRouter({ token: TOKEN, botName: "test", store: t.store, service: t.service }),
    );
    server = createServer(app);
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/playground`;
    const call = (path: string, init: RequestInit = {}, token = TOKEN) =>
      fetch(base + path, {
        ...init,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      });
    return { ...t, call };
  }

  it("rejects a wrong token", async () => {
    const { call } = await start();
    expect((await call("/info", {}, "wrong")).status).toBe(401);
    expect(await (await call("/info")).json()).toEqual({ protocol: 1, bot: "test" });
  });

  it("creates users only in allowed groups and sends as them", async () => {
    const { call, line } = await start();
    expect(
      (await call("/groups/Cother/users", { method: "POST", body: JSON.stringify({ name: "X" }) }))
        .status,
    ).toBe(403);
    const created = await call(`/groups/${GROUP}/users`, {
      method: "POST",
      body: JSON.stringify({ name: "Bさん" }),
    });
    const bob = (await created.json()) as { userId: string };
    expect(bob.userId).toMatch(/^Uplayground[0-9a-f]{22}$/);

    const sent = await call("/send", {
      method: "POST",
      body: JSON.stringify({
        groupId: GROUP,
        userId: bob.userId,
        action: { type: "text", text: "問題作成開始" },
      }),
    });
    expect(sent.status).toBe(200);
    const body = (await sent.json()) as { replies: messagingApi.Message[]; pushes: number };
    expect(textOf(body.replies)).toContain("どの形式");
    expect(line.pushes.at(-1)!.messages[0]).toEqual({
      type: "text",
      text: "🧪Bさん: 問題作成開始",
    });

    const bad = await call("/send", {
      method: "POST",
      body: JSON.stringify({ groupId: GROUP, userId: bob.userId, action: { type: "nope" } }),
    });
    expect(bad.status).toBe(400);
  });
});
