import type { WebhookEvent } from "@line/bot-sdk";
import { LineMessagingService } from "../services/LineMessagingService.js";
import { StartCreationUseCase, templateListReply } from "./commands/StartCreationUseCase.js";
import { HideUseCase } from "./commands/HideUseCase.js";
import { CreationStatusUseCase } from "./commands/CreationStatusUseCase.js";
import { StartChallengeUseCase } from "./commands/StartChallengeUseCase.js";
import { AnswerUseCase } from "./commands/AnswerUseCase.js";
import { SkipUseCase } from "./commands/SkipUseCase.js";
import { ChallengeStatusUseCase } from "./commands/ChallengeStatusUseCase.js";
import { ResultUseCase } from "./commands/ResultUseCase.js";
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
  return { keyword: normalized.slice(0, spaceIndex), args: normalized.slice(spaceIndex + 1).trim() };
}

export class HandleLineEventUseCase {
  constructor(
    private readonly commands: CommandRegistry,
    private readonly lineMessaging: LineMessagingService,
  ) {}

  async handle(event: WebhookEvent): Promise<void> {
    if (event.type !== "message" || event.message.type !== "text") return;
    const replyToken = event.replyToken;
    const groupId = extractGroupId(event);
    const userId = event.source.userId;
    if (!groupId || !userId) return;

    const { keyword, args } = parseCommand(event.message.text);

    if (keyword === "テンプレート一覧") {
      await this.lineMessaging.replyText(replyToken, templateListReply());
      return;
    }

    const useCase: CommandUseCase | undefined = (this.commands as Record<string, CommandUseCase>)[
      keyword
    ];
    if (!useCase) return; // not a recognized command; stay silent

    const replyText = await useCase.execute({ groupId, userId, args });
    await this.lineMessaging.replyText(replyToken, replyText);
  }
}
