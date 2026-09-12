import { messagingApi } from "@line/bot-sdk";
import { env } from "../config/env.js";

const { MessagingApiClient } = messagingApi;

export class LineMessagingService {
  private client: InstanceType<typeof MessagingApiClient>;

  constructor() {
    this.client = new MessagingApiClient({ channelAccessToken: env.lineChannelAccessToken });
  }

  async replyText(replyToken: string, text: string): Promise<void> {
    await this.client.replyMessage({
      replyToken,
      messages: [{ type: "text", text }],
    });
  }
}
