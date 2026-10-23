import type { messagingApi, WebhookEvent } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../repositories/PuzzleRoundRepository.js";
import { AnswerSessionRepository } from "../repositories/AnswerSessionRepository.js";
import { StartCreationUseCase } from "./commands/StartCreationUseCase.js";
import { HideUseCase } from "./commands/HideUseCase.js";
import { CreationStatusUseCase } from "./commands/CreationStatusUseCase.js";
import { StartChallengeUseCase } from "./commands/StartChallengeUseCase.js";
import { AnswerUseCase } from "./commands/AnswerUseCase.js";
import { SkipUseCase } from "./commands/SkipUseCase.js";
import { ChallengeStatusUseCase } from "./commands/ChallengeStatusUseCase.js";
import { ResultUseCase } from "./commands/ResultUseCase.js";
import { RoundSetupUseCase } from "./RoundSetupUseCase.js";
import { RecruitUseCase } from "./RecruitUseCase.js";
import { decodePostback, type PostbackAction } from "../postback.js";
import { textMessage } from "../lineMessages.js";
import { STALE_BUTTON_REPLY } from "./replies.js";
import type { CommandUseCase } from "./commandTypes.js";

/** Argument-free keywords that also work when typed (SPECIFICATION.md 操作方式). */
export type CommandRegistry = {
  問題作成開始: StartCreationUseCase;
  作成状況: CreationStatusUseCase;
  挑戦開始: StartChallengeUseCase;
  スキップ: SkipUseCase;
  挑戦状況: ChallengeStatusUseCase;
  結果: ResultUseCase;
};

export type LineReplier = {
  reply(replyToken: string, messages: messagingApi.Message[]): Promise<void>;
};

export type HandlerDeps = {
  commands: CommandRegistry;
  roundSetup: RoundSetupUseCase;
  recruit: RecruitUseCase;
  hide: HideUseCase;
  answer: AnswerUseCase;
  puzzleRounds: PuzzleRoundRepository;
  answerSessions: AnswerSessionRepository;
  lineMessaging: LineReplier;
};

function extractGroupId(event: WebhookEvent): string | undefined {
  const { source } = event;
  if (source.type === "group") return source.groupId;
  if (source.type === "room") return source.roomId;
  if (source.type === "user") return `user:${source.userId}`;
  return undefined;
}

export class HandleLineEventUseCase {
  constructor(private readonly deps: HandlerDeps) {}

  async handle(event: WebhookEvent): Promise<void> {
    if (event.type !== "message" && event.type !== "postback") return;
    const replyToken = event.replyToken;
    const groupId = extractGroupId(event);
    const userId = event.source.userId;
    if (!groupId || !userId) return;

    let messages: messagingApi.Message[] = [];
    if (event.type === "postback") {
      const postback = decodePostback(event.postback.data);
      messages = postback
        ? await this.handlePostback(groupId, userId, postback)
        : [textMessage(STALE_BUTTON_REPLY)];
    } else if (event.message.type === "image") {
      messages = await this.deps.roundSetup.receiveImage(groupId, userId, event.message.id);
    } else if (event.message.type === "text") {
      messages = await this.handleText(groupId, userId, event.message.text);
    }
    await this.deps.lineMessaging.reply(replyToken, messages);
  }

  private handlePostback(
    groupId: string,
    userId: string,
    postback: PostbackAction,
  ): Promise<messagingApi.Message[]> {
    const { roundSetup, recruit, hide, answer, commands } = this.deps;
    switch (postback.action) {
      case "type":
        return roundSetup.chooseType(groupId, userId, postback.sourceType);
      case "template":
        return roundSetup.chooseTemplate(groupId, userId, postback.templateId);
      case "grid":
        return roundSetup.selectGrid(groupId, userId, postback.roundId, postback.gridSize);
      case "join":
        return recruit.join(groupId, userId, postback.roundId);
      case "close":
        return recruit.close(groupId, userId, postback.roundId);
      case "hide":
        return hide.requestHide(groupId, userId, postback.roundId);
      case "challenge":
        return commands.挑戦開始.execute({ groupId, userId });
      case "answer":
        return answer.enterAnswerMode(groupId, userId, postback.sessionId);
      case "skip":
        return commands.スキップ.skip(groupId, userId, postback.sessionId);
    }
  }

  /**
   * A user who entered a mode via a button has their next message read as that value,
   * before it's checked as a command; otherwise only exact command keywords respond and
   * everything else (normal group chat) stays silent.
   */
  private async handleText(
    groupId: string,
    userId: string,
    text: string,
  ): Promise<messagingApi.Message[]> {
    const { puzzleRounds, answerSessions, roundSetup, hide, answer } = this.deps;

    const round = await puzzleRounds.getActiveByGroup(groupId);
    if (round?.pendingInput?.userId === userId) {
      switch (round.pendingInput.kind) {
        case "source_text":
          return roundSetup.receiveSourceText(round, text);
        case "image_answer":
          return roundSetup.registerAnswer(round, text);
        case "hide_position":
          return hide.submitPosition(round, userId, text);
      }
    }

    if (round?.phase === "in_challenge") {
      const session = await answerSessions.getActiveByGroup(groupId);
      if (session?.answerModeUserIds.includes(userId)) {
        return answer.submitAnswer(session, userId, text);
      }
    }

    const keyword = text.trim();
    // hasOwn so text like "toString" doesn't resolve to an Object.prototype member.
    if (Object.hasOwn(this.deps.commands, keyword)) {
      const useCase = (this.deps.commands as unknown as Record<string, CommandUseCase>)[keyword]!;
      return useCase.execute({ groupId, userId });
    }
    return [];
  }
}
