import type { messagingApi } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../repositories/PuzzleRoundRepository.js";
import type { PuzzleImageStore } from "../services/PuzzleImageService.js";
import { PuzzlePreviewService } from "../services/PuzzlePreviewService.js";
import { cellCount } from "../domain/services/imagePuzzle.js";
import { textMessage, withQuickReplies } from "../lineMessages.js";
import { IMAGE_GRID_SIZES, type ImageGridSize, type ImagePuzzleRound } from "../types.js";

export type MessageContentFetcher = { getMessageContent(messageId: string): Promise<Buffer> };

/** Quick Reply labels, which double as the text keywords they send back. */
export const GRID_CHOICES: ReadonlyMap<string, ImageGridSize> = new Map(
  IMAGE_GRID_SIZES.map((size) => [`${cellCount(size)}マス`, size]),
);

/**
 * Walks an image round through "preparing": image → grid size → answer, then moves it to
 * "creating". Each step only reacts to the round's creator and to the step it is waiting
 * for; anything else returns no messages so the bot stays silent in normal group chat.
 */
export class ImageRoundSetupUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly puzzleImages: PuzzleImageStore,
    private readonly puzzlePreview: PuzzlePreviewService,
    private readonly messageContent: MessageContentFetcher,
  ) {}

  /** An image sent while the creator's round is preparing becomes (or replaces) the source image. */
  async receiveImage(
    groupId: string,
    userId: string,
    messageId: string,
  ): Promise<messagingApi.Message[]> {
    const round = await this.preparingRoundOf(groupId, userId);
    if (!round) return [];

    const raw = await this.messageContent.getMessageContent(messageId);
    const sourceImagePath = await this.puzzleImages.storeSourceImage(raw);
    await this.puzzleRounds.update(round.id, { sourceImagePath, gridSize: null });

    return [
      withQuickReplies(textMessage("画像を受け取りました。何マスに分けて隠すか選んでください。"), [
        ...GRID_CHOICES.keys(),
      ]),
    ];
  }

  async selectGrid(
    groupId: string,
    userId: string,
    choice: string,
  ): Promise<messagingApi.Message[]> {
    const gridSize = GRID_CHOICES.get(choice);
    const round = await this.preparingRoundOf(groupId, userId);
    if (!round || gridSize === undefined || round.sourceImagePath === null) return [];

    await this.puzzleRounds.update(round.id, { gridSize, totalHideCount: cellCount(gridSize) });
    return [
      textMessage(
        `${cellCount(gridSize)}マスにします。次に正解を送ってください。\n` +
          "次に送ったメッセージがそのまま正解として登録されます（解答者の「回答」と完全一致で判定）。",
      ),
    ];
  }

  /** Whether `text` from this user should be read as the answer (the mode-gate step). */
  async isAwaitingAnswer(groupId: string, userId: string): Promise<boolean> {
    const round = await this.preparingRoundOf(groupId, userId);
    return round !== null && round.sourceImagePath !== null && round.gridSize !== null;
  }

  async registerAnswer(
    groupId: string,
    userId: string,
    text: string,
  ): Promise<messagingApi.Message[]> {
    const round = await this.preparingRoundOf(groupId, userId);
    if (!round || round.sourceImagePath === null || round.gridSize === null) return [];

    const answerText = text.trim();
    if (answerText.length === 0) {
      return [textMessage("正解が空です。1文字以上で送ってください。")];
    }

    const patch = { answerText, phase: "creating" as const };
    await this.puzzleRounds.update(round.id, patch);
    return this.puzzlePreview.compose({ ...round, ...patch }, 0, "creation", {
      before: `正解を登録しました。問題作成を開始します（全${round.totalHideCount}箇所）。`,
      label: "現在の状態",
      after:
        "画像の番号を使い「隠す <番号>」で1マスずつ隠してください。同じ人が連続では隠せません。",
    });
  }

  private async preparingRoundOf(
    groupId: string,
    userId: string,
  ): Promise<ImagePuzzleRound | null> {
    const round = await this.puzzleRounds.getByGroupAndPhase(groupId, "preparing");
    if (!round || round.sourceType !== "image" || round.creatorId !== userId) return null;
    return round;
  }
}
