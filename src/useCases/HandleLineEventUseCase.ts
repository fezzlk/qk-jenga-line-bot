import type { messagingApi, WebhookEvent } from "@line/bot-sdk";
import { StartCreationUseCase, templateListReply } from "./commands/StartCreationUseCase.js";
import { HideUseCase } from "./commands/HideUseCase.js";
import { CreationStatusUseCase } from "./commands/CreationStatusUseCase.js";
import { StartChallengeUseCase } from "./commands/StartChallengeUseCase.js";
import { AnswerUseCase } from "./commands/AnswerUseCase.js";
import { SkipUseCase } from "./commands/SkipUseCase.js";
import { ChallengeStatusUseCase } from "./commands/ChallengeStatusUseCase.js";
import { ResultUseCase } from "./commands/ResultUseCase.js";
import { GRID_CHOICES, ImageRoundSetupUseCase } from "./ImageRoundSetupUseCase.js";
import { textMessage } from "../lineMessages.js";
import type { CommandUseCase } from "./commandTypes.js";

export type CommandRegistry = {
  問題作成開始: StartCreationUseCase;
  隠す: HideUseCase;
  作成状況: CreationStatusUseCase;
  挑戦開始: StartChallengeUseCase;
  回答: AnswerUseCase;
  スキップ: SkipUseCase;
  挑戦状況: ChallengeStatusUseCase;
  結果: ResultUseCase;
};

export type LineReplier = {
  reply(replyToken: string, messages: messagingApi.Message[]): Promise<void>;
};

function extractGroupId(event: WebhookEvent): string | undefined {
  const { source } = event;
  if (source.type === "group") return source.groupId;
  if (source.type === "room") return source.roomId;
  if (source.type === "user") return `user:${source.userId}`;
  return undefined;
}

function parseCommand(text: string): { keyword: string; args: string } {
  const normalized = text.trim().replace(/　/g, " ");
  const spaceIndex = normalized.indexOf(" ");
  if (spaceIndex === -1) return { keyword: normalized, args: "" };
  return {
    keyword: normalized.slice(0, spaceIndex),
    args: normalized.slice(spaceIndex + 1).trim(),
  };
}

export class HandleLineEventUseCase {
  constructor(
    private readonly commands: CommandRegistry,
    private readonly imageRoundSetup: ImageRoundSetupUseCase,
    private readonly lineMessaging: LineReplier,
  ) {}

  async handle(event: WebhookEvent): Promise<void> {
    if (event.type !== "message") return;
    const replyToken = event.replyToken;
    const groupId = extractGroupId(event);
    const userId = event.source.userId;
    if (!groupId || !userId) return;

    let messages: messagingApi.Message[] = [];
    if (event.message.type === "image") {
      messages = await this.imageRoundSetup.receiveImage(groupId, userId, event.message.id);
    } else if (event.message.type === "text") {
      messages = await this.handleText(groupId, userId, event.message.text);
    }
    await this.lineMessaging.reply(replyToken, messages);
  }

  private async handleText(
    groupId: string,
    userId: string,
    text: string,
  ): Promise<messagingApi.Message[]> {
    const { keyword, args } = parseCommand(text);

    if (keyword === "テンプレート一覧") {
      return [textMessage(templateListReply())];
    }
    if (GRID_CHOICES.has(keyword) && args === "") {
      return this.imageRoundSetup.selectGrid(groupId, userId, keyword);
    }

    // hasOwn so text like "toString" doesn't resolve to an Object.prototype member.
    if (Object.hasOwn(this.commands, keyword)) {
      const useCase = (this.commands as Record<string, CommandUseCase>)[keyword]!;
      return useCase.execute({ groupId, userId, args });
    }

    // Mode gate: right after choosing the grid, the creator's next non-command message
    // is the answer. Any other unrecognized text stays silent.
    if (await this.imageRoundSetup.isAwaitingAnswer(groupId, userId)) {
      return this.imageRoundSetup.registerAnswer(groupId, userId, text);
    }
    return [];
  }
}
