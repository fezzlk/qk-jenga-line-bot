import type { messagingApi } from "@line/bot-sdk";
import { isPlaygroundUserId, type PlaygroundStore } from "./store.js";

/** The LINE calls the bot makes; LineMessagingService implements all of them. */
export type LineGateway = {
  reply(replyToken: string, messages: messagingApi.Message[]): Promise<void>;
  push(to: string, messages: messagingApi.Message[]): Promise<void>;
  getDisplayName(groupId: string, userId: string): Promise<string | null>;
  getGroupName(groupId: string): Promise<string | null>;
  getMessageContent(messageId: string): Promise<Buffer>;
};

export const PLAYGROUND_REPLY_TOKEN_PREFIX = "playground:";

/**
 * Wraps the bot's LINE client so events from fictional users work end to end:
 * replies to their (made-up) reply tokens are captured instead of sent, their
 * profile lookups return the playground name, and images they "sent" are served
 * from memory. Calls for real users pass straight through.
 */
export class PlaygroundLineMessaging implements LineGateway {
  private captures = new Map<string, messagingApi.Message[]>();
  private images = new Map<string, Buffer>();

  constructor(
    private readonly inner: LineGateway,
    private readonly store: PlaygroundStore,
  ) {}

  /** Starts collecting replies sent with `replyToken`; call the returned function to stop and get them. */
  capture(replyToken: string): () => messagingApi.Message[] {
    this.captures.set(replyToken, []);
    return () => {
      const messages = this.captures.get(replyToken) ?? [];
      this.captures.delete(replyToken);
      return messages;
    };
  }

  /** Makes `getMessageContent(messageId)` return `data` until the returned function is called. */
  provideImage(messageId: string, data: Buffer): () => void {
    this.images.set(messageId, data);
    return () => {
      this.images.delete(messageId);
    };
  }

  async reply(replyToken: string, messages: messagingApi.Message[]): Promise<void> {
    if (!replyToken.startsWith(PLAYGROUND_REPLY_TOKEN_PREFIX)) {
      return this.inner.reply(replyToken, messages);
    }
    const captured = this.captures.get(replyToken);
    if (captured) captured.push(...messages);
    else console.warn("Dropped a reply to an expired playground reply token");
  }

  push(to: string, messages: messagingApi.Message[]): Promise<void> {
    return this.inner.push(to, messages);
  }

  async getDisplayName(groupId: string, userId: string): Promise<string | null> {
    if (isPlaygroundUserId(userId)) return (await this.store.getUser(userId))?.name ?? null;
    return this.inner.getDisplayName(groupId, userId);
  }

  getGroupName(groupId: string): Promise<string | null> {
    return this.inner.getGroupName(groupId);
  }

  async getMessageContent(messageId: string): Promise<Buffer> {
    return this.images.get(messageId) ?? this.inner.getMessageContent(messageId);
  }
}
