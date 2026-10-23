import type { messagingApi } from "@line/bot-sdk";
import { renderNumberedText, renderRevealedText } from "../domain/services/textPuzzle.js";
import { requireReadyRound } from "../domain/services/puzzleRound.js";
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
 * on sourceType. Text rounds are a single text message; image rounds send the masked
 * image as its own message between the surrounding text. The creation view numbers
 * every position (characters or cells) so the hider can pick one; the challenge view
 * does not.
 */
export class PuzzlePreviewService {
  constructor(private readonly puzzleImages: PuzzleImageStore) {}

  async compose(
    round: PuzzleRound,
    revealedCount: number,
    view: PreviewView,
    { before, label, after }: PreviewText,
  ): Promise<messagingApi.Message[]> {
    const ready = requireReadyRound(round);
    if (ready.sourceType === "text") {
      const text =
        view === "creation"
          ? renderNumberedText(ready.sourceText, ready.hiddenPositions)
          : renderRevealedText(ready.sourceText, ready.hiddenPositions, revealedCount);
      // The numbered view spans several lines, so it starts on its own line.
      const state = view === "creation" ? `${label}:\n${text}` : `${label}: ${text}`;
      return [textMessage([before, state, after].filter(Boolean).join("\n"))];
    }

    const { originalContentUrl, previewImageUrl } = await this.puzzleImages.renderStep(
      ready,
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
