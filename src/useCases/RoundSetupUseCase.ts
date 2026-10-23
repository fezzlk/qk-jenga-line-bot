import type { messagingApi } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../repositories/PuzzleRoundRepository.js";
import type { PuzzleImageStore } from "../services/PuzzleImageService.js";
import { cellCount } from "../domain/services/imagePuzzle.js";
import { findTemplateById, PUZZLE_TEMPLATES } from "../domain/services/puzzleTemplates.js";
import { textMessage, withButtons, type Button } from "../lineMessages.js";
import { IMAGE_GRID_SIZES, type ImageGridSize, type PuzzleRound } from "../types.js";
import { STALE_BUTTON_REPLY } from "./replies.js";
import { recruitButtons } from "./buttons.js";

export type MessageContentFetcher = { getMessageContent(messageId: string): Promise<Buffer> };

const ACTIVE_ROUND_REPLY =
  "すでに進行中のパズルラウンドがあります。「作成状況」または「挑戦状況」で確認してください。";

// LINE allows at most 13 Quick Reply buttons.
const MAX_QUICK_REPLY_ITEMS = 13;

function newRoundBase() {
  return {
    totalHideCount: 0,
    participantIds: [] as string[],
    participantNames: {} as Record<string, string>,
    turnIndex: 0,
    hiddenPositions: [] as number[],
  };
}

/**
 * Walks a round through "preparing" — choosing a source type, then registering the
 * problem (text, template, or image → grid size → answer) — and opens entry
 * ("recruiting"). Only the creator's input is read while preparing.
 */
export class RoundSetupUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly puzzleImages: PuzzleImageStore,
    private readonly messageContent: MessageContentFetcher,
  ) {}

  async chooseType(
    groupId: string,
    userId: string,
    sourceType: "text" | "image" | "template",
  ): Promise<messagingApi.Message[]> {
    if (!(await this.clearPreparingRound(groupId))) return [textMessage(ACTIVE_ROUND_REPLY)];

    if (sourceType === "template") {
      const buttons: Button[] = PUZZLE_TEMPLATES.slice(0, MAX_QUICK_REPLY_ITEMS).map((t) => ({
        label: t.label,
        postback: { action: "template", templateId: t.id },
      }));
      return [withButtons(textMessage("テンプレートを選んでください。"), buttons)];
    }

    if (sourceType === "text") {
      await this.puzzleRounds.create({
        ...newRoundBase(),
        groupId,
        creatorId: userId,
        sourceType: "text",
        sourceText: null,
        pendingInput: { userId, kind: "source_text" },
        phase: "preparing",
        createdAt: Date.now(),
      });
      return [
        textMessage("問題文を送ってください。次に送ったメッセージがそのまま問題文になります。"),
      ];
    }

    await this.puzzleRounds.create({
      ...newRoundBase(),
      groupId,
      creatorId: userId,
      sourceType: "image",
      sourceImagePath: null,
      gridSize: null,
      answerText: null,
      pendingInput: null,
      phase: "preparing",
      createdAt: Date.now(),
    });
    return [textMessage("問題にする画像を送ってください。")];
  }

  async chooseTemplate(
    groupId: string,
    userId: string,
    templateId: string,
  ): Promise<messagingApi.Message[]> {
    const template = findTemplateById(templateId);
    if (!template) return [textMessage(STALE_BUTTON_REPLY)];
    if (!(await this.clearPreparingRound(groupId))) return [textMessage(ACTIVE_ROUND_REPLY)];

    const sourceText = template.text;
    const round = await this.puzzleRounds.create({
      ...newRoundBase(),
      groupId,
      creatorId: userId,
      sourceType: "text",
      sourceText,
      totalHideCount: Array.from(sourceText).length,
      pendingInput: null,
      phase: "recruiting",
      createdAt: Date.now(),
    });
    return recruitingReply(round, `テンプレート「${template.label}」で作成します`);
  }

  /** Mode-gate value for a text round's problem text. */
  async receiveSourceText(round: PuzzleRound, text: string): Promise<messagingApi.Message[]> {
    if (round.sourceType !== "text" || round.phase !== "preparing") return [];
    const sourceText = text.trim();
    if (sourceText.length === 0) {
      return [textMessage("問題文が空です。1文字以上で送ってください。")];
    }
    const patch = {
      sourceText,
      totalHideCount: Array.from(sourceText).length,
      pendingInput: null,
      phase: "recruiting" as const,
    };
    await this.puzzleRounds.update(round.id, patch);
    return recruitingReply({ ...round, ...patch }, "問題文を登録しました");
  }

  /** An image sent while the creator's image round is preparing becomes (or replaces) the source. */
  async receiveImage(
    groupId: string,
    userId: string,
    messageId: string,
  ): Promise<messagingApi.Message[]> {
    const round = await this.puzzleRounds.getByGroupAndPhase(groupId, "preparing");
    if (!round || round.sourceType !== "image" || round.creatorId !== userId) return [];

    const raw = await this.messageContent.getMessageContent(messageId);
    const sourceImagePath = await this.puzzleImages.storeSourceImage(raw);
    await this.puzzleRounds.update(round.id, {
      sourceImagePath,
      gridSize: null,
      pendingInput: null,
    });

    const buttons: Button[] = IMAGE_GRID_SIZES.map((gridSize) => ({
      label: `${cellCount(gridSize)}マス`,
      postback: { action: "grid", roundId: round.id, gridSize },
    }));
    return [
      withButtons(
        textMessage("画像を受け取りました。何マスに分けて隠すか選んでください。"),
        buttons,
      ),
    ];
  }

  async selectGrid(
    groupId: string,
    userId: string,
    roundId: string,
    gridSize: ImageGridSize,
  ): Promise<messagingApi.Message[]> {
    const round = await this.puzzleRounds.getByGroupAndPhase(groupId, "preparing");
    if (!round || round.id !== roundId || round.sourceType !== "image" || !round.sourceImagePath) {
      return [textMessage(STALE_BUTTON_REPLY)];
    }
    if (round.creatorId !== userId) return [textMessage("マス数を選べるのは作成者だけです。")];

    await this.puzzleRounds.update(round.id, {
      gridSize,
      totalHideCount: cellCount(gridSize),
      pendingInput: { userId, kind: "image_answer" },
    });
    return [
      textMessage(
        `${cellCount(gridSize)}マスにします。次に正解を送ってください。\n` +
          "次に送ったメッセージがそのまま正解として登録されます（解答者の回答と完全一致で判定）。",
      ),
    ];
  }

  /** Mode-gate value for an image round's answer. */
  async registerAnswer(round: PuzzleRound, text: string): Promise<messagingApi.Message[]> {
    if (round.sourceType !== "image" || round.phase !== "preparing") return [];
    const answerText = text.trim();
    if (answerText.length === 0) {
      return [textMessage("正解が空です。1文字以上で送ってください。")];
    }
    const patch = { answerText, pendingInput: null, phase: "recruiting" as const };
    await this.puzzleRounds.update(round.id, patch);
    return recruitingReply({ ...round, ...patch }, "正解を登録しました");
  }

  /**
   * Returns false if the group already has a round past "preparing". A round still
   * preparing has nothing hidden yet, so starting over simply replaces it.
   */
  private async clearPreparingRound(groupId: string): Promise<boolean> {
    const existing = await this.puzzleRounds.getActiveByGroup(groupId);
    if (!existing) return true;
    if (existing.phase !== "preparing") return false;
    await this.puzzleRounds.update(existing.id, { phase: "closed", pendingInput: null });
    return true;
  }
}

export function recruitingReply(
  round: Pick<PuzzleRound, "id" | "totalHideCount">,
  lead: string,
): messagingApi.Message[] {
  return [
    withButtons(
      textMessage(
        `${lead}（全${round.totalHideCount}箇所）。\n` +
          "隠す人は「参加する」を押してください。押した順が手番になります。\n" +
          "そろったら作成者が「締め切る」を押してください。",
      ),
      recruitButtons(round.id),
    ),
  ];
}
