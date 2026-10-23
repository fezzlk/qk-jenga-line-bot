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
}
