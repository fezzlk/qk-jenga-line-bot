import { describe, expect, it } from "vitest";
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
import { encodePostback } from "../../src/postback.js";
import {
  createFakeAnswerSessionRepository,
  createFakePlayerStatsRepository,
  createFakePuzzleImageStore,
  createFakePuzzleRoundRepository,
  createFakeTransactor,
} from "../testUtils/fakeRepositories.js";

const NAMES: Record<string, string> = { alice: "アリス", bob: "ボブ", carol: "キャロル" };

function setup() {
  const puzzleRounds = createFakePuzzleRoundRepository();
  const answerSessions = createFakeAnswerSessionRepository();
  const playerStats = createFakePlayerStatsRepository();
  const transactor = createFakeTransactor();
  const answerFlow = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, transactor);
  const images = createFakePuzzleImageStore();
  const preview = new PuzzlePreviewService(images);
  const replies: messagingApi.Message[][] = [];

  const handler = new HandleLineEventUseCase({
    commands: {
      問題作成開始: new StartCreationUseCase(puzzleRounds),
      作成状況: new CreationStatusUseCase(puzzleRounds, preview),
      挑戦開始: new StartChallengeUseCase(puzzleRounds, answerSessions, answerFlow, preview),
      スキップ: new SkipUseCase(puzzleRounds, answerSessions, answerFlow, preview),
      挑戦状況: new ChallengeStatusUseCase(puzzleRounds, answerSessions, preview),
      結果: new ResultUseCase(playerStats),
    },
    roundSetup: new RoundSetupUseCase(puzzleRounds, images, {
      async getMessageContent(messageId) {
        return Buffer.from(`image-${messageId}`);
      },
    }),
    recruit: new RecruitUseCase(puzzleRounds, transactor, preview, {
      async getDisplayName(_groupId, userId) {
        return NAMES[userId] ?? null;
      },
    }),
    hide: new HideUseCase(puzzleRounds, transactor, preview),
    answer: new AnswerUseCase(puzzleRounds, answerSessions, answerFlow, preview, transactor),
    puzzleRounds,
    answerSessions,
    lineMessaging: {
      async reply(_token, messages) {
        replies.push(messages);
      },
    },
  });

  const base = {
    mode: "active" as const,
    timestamp: 0,
    webhookEventId: "e",
    deliveryContext: { isRedelivery: false },
    replyToken: "r",
  };
  const source = (userId: string) => ({ type: "group" as const, groupId: "g1", userId });
  const last = () => replies.at(-1)!;

  async function say(userId: string, text: string) {
    await handler.handle({
      ...base,
      type: "message",
      source: source(userId),
      message: { id: "m", type: "text", text, quoteToken: "q" },
    } as WebhookEvent);
    return last();
  }
  async function sendImage(userId: string, messageId: string) {
    await handler.handle({
      ...base,
      type: "message",
      source: source(userId),
      message: { id: messageId, type: "image", quoteToken: "q", contentProvider: { type: "line" } },
    } as WebhookEvent);
    return last();
  }
  async function postback(userId: string, data: string) {
    await handler.handle({
      ...base,
      type: "postback",
      source: source(userId),
      postback: { data },
    } as WebhookEvent);
    return last();
  }
  /** Taps the Quick Reply button labelled `label` on the given (default: latest) reply. */
  async function tap(userId: string, label: string, reply = last()) {
    const items = reply.at(-1)?.quickReply?.items ?? [];
    const action = items.map((item) => item.action).find((a) => a?.label === label);
    if (action?.type !== "postback" || !action.data) {
      throw new Error(`No "${label}" button; have: ${items.map((i) => i.action?.label)}`);
    }
    return postback(userId, action.data);
  }
  const buttonsOf = (reply: messagingApi.Message[]) =>
    (reply.at(-1)?.quickReply?.items ?? []).map((item) => item.action?.label);

  return { puzzleRounds, playerStats, images, say, sendImage, postback, tap, buttonsOf };
}

/** Starts a text round "abcd" with alice and bob joined and entry closed. */
async function textRoundReadyToHide(t: ReturnType<typeof setup>) {
  await t.say("alice", "問題作成開始");
  await t.tap("alice", "文章で作る");
  const recruiting = await t.say("alice", "abcd");
  await t.tap("alice", "参加する", recruiting);
  await t.tap("bob", "参加する", recruiting);
  return t.tap("alice", "締め切る", recruiting);
}

describe("button-driven flow", () => {
  it("plays a text round end to end without typing any arguments", async () => {
    const t = setup();

    expect(t.buttonsOf(await t.say("alice", "問題作成開始"))).toEqual([
      "文章で作る",
      "画像で作る",
      "テンプレートから",
    ]);
    expect(textOf(await t.tap("alice", "文章で作る"))).toContain("問題文を送ってください");

    const recruiting = await t.say("alice", "abcd");
    expect(textOf(recruiting)).toContain("全4箇所");
    expect(t.buttonsOf(recruiting)).toEqual(["参加する", "締め切る"]);

    expect(textOf(await t.tap("alice", "参加する", recruiting))).toContain("1. アリス");
    expect(textOf(await t.tap("bob", "参加する", recruiting))).toContain("2. ボブ");

    const closed = await t.tap("alice", "締め切る", recruiting);
    expect(textOf(closed)).toContain("1:a 2:b 3:c 4:d");
    expect(textOf(closed)).toContain("最初はアリスさんの番です");

    // Turns alternate alice → bob → alice → bob.
    const order = ["alice", "bob", "alice", "bob"];
    const positions = ["2", "4", "1", "3"];
    let reply = closed;
    for (let i = 0; i < 4; i++) {
      expect(textOf(await t.tap(order[i]!, "隠す", reply))).toContain("番号を送ってください");
      reply = await t.say(order[i]!, positions[i]!);
    }
    expect(textOf(reply)).toContain("作成完了");

    const started = await t.tap("carol", "挑戦開始", reply);
    expect(textOf(started)).toContain("現在の状態: ＿＿c＿");
    expect(t.buttonsOf(started)).toEqual(["回答する", "スキップ"]);

    expect(textOf(await t.tap("carol", "回答する", started))).toContain("回答を送ってください");
    const solved = await t.say("carol", "abcd");
    expect(textOf(solved)).toContain("正解です");
    expect(await t.playerStats.get("g1", "carol")).toMatchObject({ totalScore: 1 });
  });

  it("plays an image round with grid choice and a registered answer", async () => {
    const t = setup();
    await t.say("alice", "問題作成開始");
    await t.tap("alice", "画像で作る");
    const grid = await t.sendImage("alice", "img-1");
    expect(t.buttonsOf(grid)).toEqual(["9マス", "16マス", "25マス"]);
    expect(textOf(await t.tap("alice", "9マス", grid))).toContain("正解を送ってください");

    const recruiting = await t.say("alice", "東京タワー");
    expect(textOf(recruiting)).toContain("全9箇所");
    await t.tap("alice", "参加する", recruiting);
    await t.tap("bob", "参加する", recruiting);
    let reply = await t.tap("alice", "締め切る", recruiting);
    expect(t.images.renders.at(-1)).toMatchObject({ revealedCount: 0, numbered: true });

    for (let cell = 1; cell <= 9; cell++) {
      const hider = cell % 2 === 1 ? "alice" : "bob";
      await t.tap(hider, "隠す", reply);
      reply = await t.say(hider, String(cell));
    }
    expect(textOf(reply)).toContain("作成完了");

    const started = await t.tap("carol", "挑戦開始", reply);
    expect(t.images.renders.at(-1)).toMatchObject({ revealedCount: 1, numbered: false });
    await t.tap("carol", "回答する", started);
    const solved = await t.say("carol", "東京タワー");
    expect(textOf(solved)).toContain("正解: 東京タワー");
  });

  it("creates a round from a template", async () => {
    const t = setup();
    await t.say("alice", "問題作成開始");
    const templates = await t.tap("alice", "テンプレートから");
    expect(t.buttonsOf(templates)).toContain("四字熟語");

    const recruiting = await t.tap("alice", "四字熟語", templates);
    expect(textOf(recruiting)).toContain("全4箇所");
    expect(t.buttonsOf(recruiting)).toEqual(["参加する", "締め切る"]);
  });

  describe("recruiting", () => {
    it("lets only the creator close entry, and needs two participants", async () => {
      const t = setup();
      await t.say("alice", "問題作成開始");
      await t.tap("alice", "文章で作る");
      const recruiting = await t.say("alice", "abcd");
      await t.tap("alice", "参加する", recruiting);

      expect(textOf(await t.tap("bob", "締め切る", recruiting))).toContain("作成者だけ");
      expect(textOf(await t.tap("alice", "締め切る", recruiting))).toContain("2人以上必要");
      expect(textOf(await t.tap("alice", "参加する", recruiting))).toContain("すでに参加");
    });
  });

  describe("hiding", () => {
    it("refuses 隠す from someone whose turn it isn't", async () => {
      const t = setup();
      const closed = await textRoundReadyToHide(t);
      expect(textOf(await t.tap("bob", "隠す", closed))).toContain("アリスさんの番です");
    });

    it("keeps waiting for a valid number after an invalid one", async () => {
      const t = setup();
      const closed = await textRoundReadyToHide(t);
      await t.tap("alice", "隠す", closed);

      expect(textOf(await t.say("alice", "9"))).toContain("1〜4の番号");
      expect(textOf(await t.say("alice", "abc"))).toContain("1〜4の番号");
      // Full-width digits from a Japanese keyboard work.
      expect(textOf(await t.say("alice", "２"))).toContain("残り3箇所");
    });

    it("refuses a position that is already hidden", async () => {
      const t = setup();
      const closed = await textRoundReadyToHide(t);
      await t.tap("alice", "隠す", closed);
      const afterFirst = await t.say("alice", "1");
      await t.tap("bob", "隠す", afterFirst);
      expect(textOf(await t.say("bob", "1"))).toContain("すでに隠されています");
    });

    it("ignores other members' chat while someone is choosing a position", async () => {
      const t = setup();
      const closed = await textRoundReadyToHide(t);
      await t.tap("alice", "隠す", closed);
      expect(await t.say("bob", "3")).toEqual([]);
    });
  });

  describe("answering", () => {
    async function inChallenge(t: ReturnType<typeof setup>) {
      let reply = await textRoundReadyToHide(t);
      for (const [hider, pos] of [
        ["alice", "1"],
        ["bob", "2"],
        ["alice", "3"],
        ["bob", "4"],
      ] as const) {
        await t.tap(hider, "隠す", reply);
        reply = await t.say(hider, pos);
      }
      return t.tap("carol", "挑戦開始", reply);
    }

    it("only reads answers from users who tapped 回答する", async () => {
      const t = setup();
      const started = await inChallenge(t);
      await t.tap("carol", "回答する", started);

      // dave never tapped 回答する: his chat is ignored, even if it's the answer.
      expect(await t.say("dave", "abcd")).toEqual([]);
      expect(textOf(await t.say("carol", "abcd"))).toContain("正解です");
    });

    it("consumes 回答する after one answer", async () => {
      const t = setup();
      const started = await inChallenge(t);
      await t.tap("carol", "回答する", started);
      const wrong = await t.say("carol", "zzzz");
      expect(textOf(wrong)).toContain("不正解");
      expect(t.buttonsOf(wrong)).toEqual(["回答する", "スキップ"]);
      // Without tapping again, the next message is just chat.
      expect(await t.say("carol", "abcd")).toEqual([]);
    });

    it("skips via the button", async () => {
      const t = setup();
      const started = await inChallenge(t);
      const skipped = await t.tap("carol", "スキップ", started);
      expect(textOf(skipped)).toContain("スキップしました");
      expect(textOf(skipped)).toContain("現在の状態: ＿＿cd");
    });
  });

  describe("stale and unknown input", () => {
    it("rejects buttons from an earlier round", async () => {
      const t = setup();
      await t.say("alice", "問題作成開始");
      await t.tap("alice", "文章で作る");
      await t.say("alice", "abcd");

      // A 参加する button left over from some earlier round in this group.
      const reply = await t.postback("bob", encodePostback({ action: "join", roundId: "old" }));
      expect(textOf(reply)).toContain("古くなっています");
      expect((await t.puzzleRounds.getByGroupAndPhase("g1", "recruiting"))?.participantIds).toEqual(
        [],
      );
    });

    it("rejects malformed postback data", async () => {
      const t = setup();
      expect(textOf(await t.postback("alice", "a=bogus"))).toContain("古くなっています");
    });

    it("no longer accepts typed arguments", async () => {
      const t = setup();
      expect(await t.say("alice", "問題作成開始 石の上にも三年")).toEqual([]);
      expect(await t.say("alice", "隠す 3")).toEqual([]);
      expect(await t.say("alice", "回答 abc")).toEqual([]);
    });

    it("stays silent on ordinary chat and prototype keys", async () => {
      const t = setup();
      expect(await t.say("alice", "こんにちは")).toEqual([]);
      expect(await t.say("alice", "toString")).toEqual([]);
      expect(await t.sendImage("alice", "holiday")).toEqual([]);
    });
  });
});
