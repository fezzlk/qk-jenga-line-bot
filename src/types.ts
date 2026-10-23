export const DEFAULT_WRONG_ANSWER_LIMIT = 3;
export const DEFAULT_ATTEMPTS_PER_BLOCK_LIMIT = 1;
export const DEFAULT_SCORE_CORRECT = 1;
export const DEFAULT_SCORE_WRONG_LIMIT = -1;
export const DEFAULT_SCORE_FULLY_REVEALED = 0;

// Single categorical field (not separate booleans) so every Firestore lookup
// used by the use cases stays equality-only on (groupId, phase) and never
// needs a composite index or orderBy.
// "preparing" is only used by image rounds, while the creator is still supplying the
// image, grid size and answer (text rounds go straight to "creating").
export type PuzzleRoundPhase =
  "preparing" | "creating" | "ready_to_challenge" | "in_challenge" | "closed";

export const ACTIVE_PUZZLE_ROUND_PHASES: PuzzleRoundPhase[] = [
  "preparing",
  "creating",
  "ready_to_challenge",
  "in_challenge",
];

/** Grid side length for image rounds: 3x3 = 9, 4x4 = 16, 5x5 = 25 cells. */
export type ImageGridSize = 3 | 4 | 5;

export const IMAGE_GRID_SIZES: ImageGridSize[] = [3, 4, 5];

type PuzzleRoundCommon = {
  id: string;
  groupId: string;
  totalHideCount: number;
  // Not a pre-declared fixed order (SPECIFICATION.md's "事前に決めた順番" would need
  // resolving LINE display names to userIds via chat text, which is out of scope for v1).
  // Instead turn-taking is enforced live: whoever hides now must differ from lastHiderId.
  // participantIds records everyone who has taken a turn, for display purposes only.
  participantIds: string[];
  lastHiderId: string | null;
  hiddenPositions: number[];
  phase: PuzzleRoundPhase;
  createdAt: number;
};

/** sourceText is both the content progressively revealed and the exact-match answer. */
export type TextPuzzleRound = PuzzleRoundCommon & {
  sourceType: "text";
  sourceText: string;
};

/**
 * hiddenPositions are 0-based, row-major grid cell indices (same reveal semantics as the
 * text variant's character indices), so AnswerFlowService works unchanged for both.
 *
 * sourceImagePath / gridSize / answerText are filled in one by one during "preparing"
 * and are all non-null from "creating" onwards. sourceImagePath points at the original,
 * unmasked image in the private puzzle-images bucket and is never served directly.
 */
export type ImagePuzzleRound = PuzzleRoundCommon & {
  sourceType: "image";
  // Only the creator's messages are read as setup input (image, grid size, answer), so
  // other members chatting in the group can't accidentally become the answer.
  creatorId: string;
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
  // Grows dynamically as users send 回答/スキップ (first-come, no pre-registration).
  // wrongAnswerCount/currentStepAttempts below are already session-scoped, so they
  // are shared across every participant here without further change.
  answererIds: string[];
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
