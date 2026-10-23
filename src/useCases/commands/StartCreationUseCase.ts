import type { messagingApi } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { findTemplateById, listTemplatesText } from "../../domain/services/puzzleTemplates.js";
import { textMessage } from "../../lineMessages.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

const TEMPLATE_PREFIX = "テンプレート:";

export class StartCreationUseCase implements CommandUseCase {
  constructor(private readonly puzzleRounds: PuzzleRoundRepository) {}

  async execute({ groupId, userId, args }: CommandInput): Promise<messagingApi.Message[]> {
    const existing = await this.puzzleRounds.getActiveByGroup(groupId);
    if (existing?.phase === "preparing") {
      // Nothing has been hidden yet, so a new start simply replaces an image round still
      // waiting for setup (e.g. "問題作成開始" sent without text by mistake).
      await this.puzzleRounds.update(existing.id, { phase: "closed" });
    } else if (existing) {
      return [
        textMessage(
          "すでに進行中のパズルラウンドがあります。「結果」または「作成状況」/「挑戦状況」で確認してください。",
        ),
      ];
    }

    const trimmed = args.trim();
    if (trimmed.length === 0) {
      return this.startImageRound(groupId, userId);
    }

    let sourceText = trimmed;
    if (trimmed.startsWith(TEMPLATE_PREFIX)) {
      const template = findTemplateById(trimmed.slice(TEMPLATE_PREFIX.length).trim());
      if (!template) {
        return [
          textMessage(
            "そのテンプレート番号はありません。番号一覧は「テンプレート一覧」で確認してください。",
          ),
        ];
      }
      sourceText = template.text;
    }

    const round = await this.puzzleRounds.create({
      groupId,
      sourceType: "text",
      sourceText,
      totalHideCount: Array.from(sourceText).length,
      participantIds: [],
      lastHiderId: null,
      hiddenPositions: [],
      phase: "creating",
      createdAt: Date.now(),
    });

    return [
      textMessage(
        `問題作成を開始しました（全${round.totalHideCount}箇所）。\n` +
          `「隠す <1始まりの文字位置>」で1箇所ずつ隠してください。同じ人が連続では隠せません。`,
      ),
    ];
  }

  private async startImageRound(groupId: string, userId: string): Promise<messagingApi.Message[]> {
    await this.puzzleRounds.create({
      groupId,
      sourceType: "image",
      creatorId: userId,
      sourceImagePath: null,
      gridSize: null,
      answerText: null,
      totalHideCount: 0,
      participantIds: [],
      lastHiderId: null,
      hiddenPositions: [],
      phase: "preparing",
      createdAt: Date.now(),
    });
    return [
      textMessage(
        "画像の問題を作成します。問題にする画像を送ってください。\n" +
          "（文章の問題にする場合は「問題作成開始 <問題文>」または「問題作成開始 テンプレート:<番号>」）",
      ),
    ];
  }
}

export function templateListReply(): string {
  return `利用可能なテンプレート:\n${listTemplatesText()}`;
}
