import { buffer as streamToBuffer } from "node:stream/consumers";
import { messagingApi } from "@line/bot-sdk";
import { env } from "../config/env.js";

const { MessagingApiClient, MessagingApiBlobClient } = messagingApi;

export class LineMessagingService {
  private client: InstanceType<typeof MessagingApiClient>;
  private blobClient: InstanceType<typeof MessagingApiBlobClient>;

  constructor() {
    this.client = new MessagingApiClient({ channelAccessToken: env.lineChannelAccessToken });
    this.blobClient = new MessagingApiBlobClient({
      channelAccessToken: env.lineChannelAccessToken,
    });
  }

  async reply(replyToken: string, messages: messagingApi.Message[]): Promise<void> {
    if (messages.length === 0) return;
    await this.client.replyMessage({ replyToken, messages });
  }

  /** Downloads the binary content (e.g. an image) a user sent, by its LINE message ID. */
  async getMessageContent(messageId: string): Promise<Buffer> {
    const stream = await this.blobClient.getMessageContent(messageId);
    return streamToBuffer(stream);
  }

  /**
   * The user's LINE display name, or null if it can't be fetched (e.g. they haven't
   * added the bot as a friend in a 1:1 chat). groupId is a group ID ("C…"), a room ID
   * ("R…") or "user:<userId>" for 1:1 chats, as built by HandleLineEventUseCase.
   */
  async getDisplayName(groupId: string, userId: string): Promise<string | null> {
    try {
      if (groupId.startsWith("user:")) {
        return (await this.client.getProfile(userId)).displayName;
      }
      if (groupId.startsWith("R")) {
        return (await this.client.getRoomMemberProfile(groupId, userId)).displayName;
      }
      return (await this.client.getGroupMemberProfile(groupId, userId)).displayName;
    } catch (error) {
      console.warn("Failed to fetch LINE display name", error);
      return null;
    }
  }
}
