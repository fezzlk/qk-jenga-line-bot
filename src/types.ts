export const DEFAULT_WRONG_ANSWER_LIMIT = 3;
export const DEFAULT_ATTEMPTS_PER_BLOCK_LIMIT = 1;
export const DEFAULT_SCORE_CORRECT = 1;
export const DEFAULT_SCORE_WRONG_LIMIT = -1;
export const DEFAULT_SCORE_FULLY_REVEALED = 0;

// Single categorical field (not separate booleans) so every Firestore lookup
// used by the use cases stays equality-only on (groupId, phase) and never
// needs a composite index or orderBy.
//   preparing  → the creator is registering the problem (text, or image/grid/answer)
//   recruiting → members tap 参加する; the creator closes entry, fixing the turn order
//   creating   → participants take turns hiding one position each
export type PuzzleRoundPhase =
  "preparing" | "recruiting" | "creating" | "ready_to_challenge" | "in_challenge" | "closed";

export const ACTIVE_PUZZLE_ROUND_PHASES: PuzzleRoundPhase[] = [
  "preparing",
  "recruiting",
  "creating",
  "ready_to_challenge",
  "in_challenge",
];

/** Grid side length for image rounds: 3x3 = 9, 4x4 = 16, 5x5 = 25 cells. */
export type ImageGridSize = 3 | 4 | 5;

export const IMAGE_GRID_SIZES: ImageGridSize[] = [3, 4, 5];

/** Minimum participants before entry can close: nobody may hide twice in a row. */
export const MIN_PARTICIPANTS = 2;

/**
 * Mode gate: after a button puts this user into `kind`, their next plain-text message
 * in the group is read as that value instead of as a command.
 */
export type PendingRoundInput = {
  userId: string;
  kind: "source_text" | "image_answer" | "hide_position";
};

type PuzzleRoundCommon = {
  id: string;
  groupId: string;
  // Only the creator's input is read during setup, and only they can close entry.
  creatorId: string;
  totalHideCount: number;
  // Turn order, fixed when entry closes: the order members tapped 参加する.
  participantIds: string[];
  // Display names captured at entry, so turn prompts don't need a profile lookup.
  participantNames: Record<string, string>;
  // Index into participantIds of whoever hides next; advances round-robin.
  turnIndex: number;
  pendingInput: PendingRoundInput | null;
  hiddenPositions: number[];
  phase: PuzzleRoundPhase;
  createdAt: number;
};

/**
 * sourceText is both the content progressively revealed and the exact-match answer.
 * It is null only while "preparing" (waiting for the creator to send it).
 */
export type TextPuzzleRound = PuzzleRoundCommon & {
  sourceType: "text";
  sourceText: string | null;
};

/**
 * hiddenPositions are 0-based, row-major grid cell indices (same reveal semantics as the
 * text variant's character indices), so AnswerFlowService works unchanged for both.
 *
 * sourceImagePath / gridSize / answerText are filled in one by one during "preparing"
 * and are all non-null afterwards. sourceImagePath points at the original, unmasked
 * image in the private puzzle-images bucket and is never served directly.
 */
export type ImagePuzzleRound = PuzzleRoundCommon & {
  sourceType: "image";
  sourceImagePath: string | null;
  gridSize: ImageGridSize | null;
  answerText: string | null;
};

export type PuzzleRound = TextPuzzleRound | ImagePuzzleRound;

// Omit/Partial applied per variant: a plain Omit<PuzzleRound, "id"> would keep only the
// keys common to both variants and reject e.g. an image round's gridSize.
export type NewPuzzleRound = PuzzleRound extends infer R
  ? R extends PuzzleRound
    ? Omit<R, "id">
    : never
  : never;
export type PuzzleRoundPatch = PuzzleRound extends infer R
  ? R extends PuzzleRound
    ? Partial<Omit<R, "id">>
    : never
  : never;

export type AnswerSessionStatus = "active" | "correct" | "wrong_limit" | "fully_revealed";

export type AnswerSession = {
  id: string;
  puzzleRoundId: string;
  groupId: string;
  // Grows dynamically as users answer/skip (first-come, no pre-registration).
  // wrongAnswerCount/currentStepAttempts below are already session-scoped, so they
  // are shared across every participant here without further change.
  answererIds: string[];
  // Users who tapped 回答する; each one's next plain-text message is their answer.
  answerModeUserIds: string[];
  revealedCount: number;
  wrongAnswerCount: number;
  currentStepAttempts: number;
  wrongAnswerLimit: number;
  attemptsPerBlockLimit: number;
  scoreCorrect: number;
  scoreWrongLimit: number;
  scoreFullyRevealed: number;
  status: AnswerSessionStatus;
  startedAt: number;
  endedAt: number | null;
};

export type PlayerStats = {
  groupId: string;
  userId: string;
  totalPlays: number;
  totalScore: number;
};
