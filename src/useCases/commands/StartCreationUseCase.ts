import { PuzzleRoundRepository } from "../../repositories/PuzzleRoundRepository.js";
import { findTemplateById, listTemplatesText } from "../../domain/services/puzzleTemplates.js";
import type { CommandInput, CommandUseCase } from "../commandTypes.js";

const TEMPLATE_PREFIX = "テンプレート:";

export class StartCreationUseCase implements CommandUseCase {
  constructor(private readonly puzzleRounds: PuzzleRoundRepository) {}

  async execute({ groupId, args }: CommandInput): Promise<string> {
    const existing = await this.puzzleRounds.getActiveByGroup(groupId);
    if (existing) {
      return "すでに進行中のパズルラウンドがあります。「結果」または「作成状況」/「挑戦状況」で確認してください。";
    }

    const sourceText = await this.resolveSourceText(args);
    if (sourceText === undefined) {
      return (
        "問題文が指定されていません。次のいずれかの形式で送ってください。\n" +
        "「問題作成開始 <問題文>」\n" +
        "「問題作成開始 テンプレート:<番号>」（番号一覧は「テンプレート一覧」で確認）"
      );
    }
    if (sourceText.length === 0) {
      return "問題文が空です。1文字以上の問題文を指定してください。";
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

    return (
      `問題作成を開始しました（全${round.totalHideCount}箇所）。\n` +
      `「隠す <1始まりの文字位置>」で1箇所ずつ隠してください。同じ人が連続では隠せません。`
    );
  }

  private async resolveSourceText(args: string): Promise<string | undefined> {
    const trimmed = args.trim();
    if (trimmed.startsWith(TEMPLATE_PREFIX)) {
      const id = trimmed.slice(TEMPLATE_PREFIX.length).trim();
      const template = findTemplateById(id);
      return template?.text;
    }
    if (trimmed.length > 0) return trimmed;
    return undefined;
  }
}

export function templateListReply(): string {
  return `利用可能なテンプレート:\n${listTemplatesText()}`;
}
