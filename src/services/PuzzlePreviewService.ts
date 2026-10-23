import type { messagingApi } from "@line/bot-sdk";
import { renderRevealedText } from "../domain/services/textPuzzle.js";
import { requireReadyImageRound } from "../domain/services/imagePuzzle.js";
import { imageMessage, textMessage } from "../lineMessages.js";
import type { PuzzleImageStore } from "./PuzzleImageService.js";
import type { PuzzleRound } from "../types.js";

export type PreviewView = "creation" | "challenge";

export type PreviewText = {
  /** Line(s) shown before the puzzle state. */
  before?: string;
  /** Label for the puzzle state, e.g. "現在の状態". */
  label: string;
  /** Line(s) shown after the puzzle state. */
  after?: string;
};

/**
 * Builds a reply that shows the puzzle at a given reveal step, so use cases don't branch
 * on sourceType. Text rounds keep the original single-message format
 * ("<before>\n<label>: <text>\n<after>"); image rounds send the masked image as its own
 * message between the surrounding text. The creation view numbers the visible cells so
 * creators can pick one to hide; the challenge view does not.
 */
export class PuzzlePreviewService {
  constructor(private readonly puzzleImages: PuzzleImageStore) {}

  async compose(
    round: PuzzleRound,
    revealedCount: number,
    view: PreviewView,
    { before, label, after }: PreviewText,
  ): Promise<messagingApi.Message[]> {
    if (round.sourceType === "text") {
      const state = `${label}: ${renderRevealedText(round.sourceText, round.hiddenPositions, revealedCount)}`;
      return [textMessage([before, state, after].filter(Boolean).join("\n"))];
    }

    const { originalContentUrl, previewImageUrl } = await this.puzzleImages.renderStep(
      requireReadyImageRound(round),
      revealedCount,
      { numbered: view === "creation" },
    );
    const messages = [
      textMessage([before, `${label}:`].filter(Boolean).join("\n")),
      imageMessage(originalContentUrl, previewImageUrl),
    ];
    if (after) messages.push(textMessage(after));
    return messages;
  }
}
