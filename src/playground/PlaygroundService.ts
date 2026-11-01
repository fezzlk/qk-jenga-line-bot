import { randomBytes, randomInt } from "node:crypto";
import type { messagingApi, WebhookEvent } from "@line/bot-sdk";
import { handleEventsSafely } from "../routes/webhook.js";
import {
  PLAYGROUND_REPLY_TOKEN_PREFIX,
  type PlaygroundLineMessaging,
} from "./PlaygroundLineMessaging.js";
import type { PlaygroundStore, PlaygroundUser } from "./store.js";

export type PlaygroundAction =
  | { type: "text"; text: string }
  | { type: "image"; base64: string }
  | { type: "postback"; data: string; displayText?: string; params?: Record<string, string> }
  | { type: "memberJoined" };

export class PlaygroundError extends Error {
  constructor(
    readonly status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

type LineEventHandler = { handle(event: WebhookEvent): Promise<void> };

/** LINE accepts at most 5 message objects per push. */
const MAX_MESSAGES_PER_PUSH = 5;

function messageId(): string {
  return `${randomInt(1, 10)}${Array.from({ length: 17 }, () => randomInt(0, 10)).join("")}`;
}

function sourceOf(groupId: string, userId: string): WebhookEvent["source"] {
  if (groupId.startsWith("R")) return { type: "room", roomId: groupId, userId };
  return { type: "group", groupId, userId };
}

/** The fictional user's action in words, as it appears in the log. */
function actionText(action: PlaygroundAction): string {
  switch (action.type) {
    case "text":
      return action.text;
    case "image":
      return "［画像を送信］";
    case "postback":
      return action.displayText ?? "［ボタンを押した］";
    case "memberJoined":
      return "［グループに参加］";
  }
}

/** What the group sees for the fictional user's action, e.g. "🧪Bさん: 参加する". */
function echoText(user: PlaygroundUser, action: PlaygroundAction): string {
  if (action.type === "memberJoined") return `🧪${user.name}がグループに参加しました`;
  return `🧪${user.name}: ${actionText(action)}`;
}

/** How a real user's event reads in the log, or null for events not worth showing. */
function realEventText(event: WebhookEvent): string | null {
  if (event.type === "postback") return `［ボタン］${event.postback.data}`;
  if (event.type !== "message") return null;
  if (event.message.type === "text") return event.message.text;
  return `［${event.message.type}］`;
}

export class PlaygroundService {
  private recorded = new Set<string>();

  constructor(
    private readonly store: PlaygroundStore,
    private readonly line: PlaygroundLineMessaging,
    private readonly handler: LineEventHandler,
    private readonly allowedGroups: Set<string>,
  ) {}

  isAllowed(groupId: string): boolean {
    return this.allowedGroups.has(groupId);
  }

  async listGroups() {
    const groups = await this.store.listGroups();
    const known = new Set(groups.map((g) => g.groupId));
    // Allowed groups the bot hasn't heard from yet still show up, so a fresh test group is selectable.
    for (const groupId of this.allowedGroups) {
      if (!known.has(groupId)) groups.push({ groupId, name: null, realUserIds: [], lastSeenAt: 0 });
    }
    return groups.map((g) => ({ ...g, allowed: this.isAllowed(g.groupId) }));
  }

  /**
   * Called with every real webhook batch. Remembers groups and real members so
   * the controller can list them (one write per group/user pair per instance),
   * and in allowed groups logs what the real user did and what the bot answered.
   */
  async recordRealEvents(events: WebhookEvent[]): Promise<void> {
    for (const event of events) {
      const source = event.source;
      const groupId =
        source.type === "group" ? source.groupId : source.type === "room" ? source.roomId : null;
      if (!groupId) continue;

      const key = `${groupId}:${source.userId ?? ""}`;
      if (!this.recorded.has(key)) {
        this.recorded.add(key);
        try {
          const name = (await this.store.hasGroup(groupId))
            ? null
            : await this.line.getGroupName(groupId);
          await this.store.recordGroup(groupId, source.userId, name);
        } catch (error) {
          this.recorded.delete(key);
          console.warn("Failed to record playground group", error);
        }
      }

      if (!this.isAllowed(groupId) || !source.userId) continue;
      const text = realEventText(event);
      if (text === null) continue;
      try {
        await this.store.appendLog(groupId, {
          at: Date.now(),
          kind: "real",
          userId: source.userId,
          text,
        });
      } catch (error) {
        console.warn("Failed to log playground event", error);
      }
      if ("replyToken" in event && event.replyToken) {
        this.line.logRepliesTo(event.replyToken, groupId, source.userId);
      }
    }
  }

  async listLog(groupId: string, limit: number) {
    if (!this.isAllowed(groupId)) {
      throw new PlaygroundError(403, "This group is not in PLAYGROUND_ALLOWED_GROUPS");
    }
    return this.store.listLog(groupId, limit);
  }

  /**
   * Acts as a fictional user: builds the webhook event they would have caused,
   * runs it through the bot's normal handler, and pushes an echo of the action
   * plus the bot's replies to the group in as few pushes as possible (one, unless
   * there are more than five messages). Returns the replies with their buttons.
   */
  async send(groupId: string, userId: string, action: PlaygroundAction) {
    if (!this.isAllowed(groupId)) {
      throw new PlaygroundError(403, "This group is not in PLAYGROUND_ALLOWED_GROUPS");
    }
    const user = await this.store.getUser(userId);
    if (!user || user.groupId !== groupId)
      throw new PlaygroundError(404, "Unknown playground user for this group");

    const replyToken = PLAYGROUND_REPLY_TOKEN_PREFIX + randomBytes(16).toString("hex");
    const base = {
      mode: "active" as const,
      timestamp: Date.now(),
      webhookEventId: `playground-${randomBytes(8).toString("hex")}`,
      deliveryContext: { isRedelivery: false },
      replyToken,
      source: sourceOf(groupId, userId),
    };
    let event: WebhookEvent;
    let releaseImage = () => {};
    switch (action.type) {
      case "text":
        event = {
          ...base,
          type: "message",
          message: { id: messageId(), type: "text", text: action.text, quoteToken: "q" },
        };
        break;
      case "image": {
        const id = messageId();
        releaseImage = this.line.provideImage(id, Buffer.from(action.base64, "base64"));
        event = {
          ...base,
          type: "message",
          message: { id, type: "image", quoteToken: "q", contentProvider: { type: "line" } },
        };
        break;
      }
      case "postback":
        event = {
          ...base,
          type: "postback",
          postback: { data: action.data, ...(action.params ? { params: action.params } : {}) },
        } as WebhookEvent;
        break;
      case "memberJoined":
        event = {
          ...base,
          type: "memberJoined",
          source: groupId.startsWith("R")
            ? { type: "room", roomId: groupId }
            : { type: "group", groupId },
          joined: { members: [{ type: "user", userId }] },
        };
        break;
    }

    const echo = echoText(user, action);
    await this.store.appendLog(groupId, {
      at: Date.now(),
      kind: "fictional",
      userId,
      name: user.name,
      text: actionText(action),
    });
    const finish = this.line.capture(replyToken);
    try {
      await handleEventsSafely([event], this.handler);
    } finally {
      releaseImage();
    }
    const replies = finish();
    if (replies.length > 0) {
      await this.store.appendLog(groupId, {
        at: Date.now(),
        kind: "bot",
        replyTo: userId,
        messages: replies,
      });
    }

    const toPush: messagingApi.Message[] = [
      { type: "text", text: echo },
      // Quick replies stay: they're the group's buttons (e.g. 締め切る), and LINE only shows
      // them on the latest message, which after this push is the bot's reply.
      ...replies,
    ];
    for (let i = 0; i < toPush.length; i += MAX_MESSAGES_PER_PUSH) {
      await this.line.push(groupId, toPush.slice(i, i + MAX_MESSAGES_PER_PUSH));
    }
    return { replies, pushes: Math.ceil(toPush.length / MAX_MESSAGES_PER_PUSH) };
  }
}
