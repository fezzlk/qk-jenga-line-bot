import type { PuzzleRound, TextPuzzleRound } from "../../types.js";
import { isReadyImageRound, type ReadyImagePuzzleRound } from "./imagePuzzle.js";

/** A text round whose problem text has been registered. */
export type ReadyTextPuzzleRound = TextPuzzleRound & { sourceText: string };

/** A round past "preparing": its problem (and, for images, grid and answer) is set. */
export type ReadyPuzzleRound = ReadyTextPuzzleRound | ReadyImagePuzzleRound;

export function isReadyRound(round: PuzzleRound): round is ReadyPuzzleRound {
  if (round.sourceType === "text") return round.sourceText !== null;
  return isReadyImageRound(round);
}

export function requireReadyRound(round: PuzzleRound): ReadyPuzzleRound {
  if (!isReadyRound(round)) {
    throw new Error(`Round setup is incomplete: ${round.id}`);
  }
  return round;
}

/** The string an answer must exactly match: the text itself, or the image round's registered answer. */
export function correctAnswerOf(round: PuzzleRound): string {
  const ready = requireReadyRound(round);
  return ready.sourceType === "text" ? ready.sourceText : ready.answerText;
}

/** Whose turn it is to hide, or null before entry has closed. */
export function currentTurnUserId(round: PuzzleRound): string | null {
  if (round.participantIds.length === 0) return null;
  return round.participantIds[round.turnIndex % round.participantIds.length] ?? null;
}

export function nextTurnIndex(round: PuzzleRound): number {
  return (round.turnIndex + 1) % Math.max(1, round.participantIds.length);
}

export function displayNameOf(round: PuzzleRound, userId: string): string {
  return round.participantNames[userId] ?? "参加者";
}
