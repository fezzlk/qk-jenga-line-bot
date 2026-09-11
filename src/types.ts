export const DEFAULT_WRONG_ANSWER_LIMIT = 3;
export const DEFAULT_ATTEMPTS_PER_BLOCK_LIMIT = 1;
export const OUT_SCORE_PENALTY = -1;

// Single categorical field (not separate booleans) so every Firestore lookup
// used by the use cases stays equality-only on (groupId, phase) and never
// needs a composite index or orderBy.
export type PuzzleRoundPhase = "creating" | "ready_to_challenge" | "in_challenge" | "closed";

export const ACTIVE_PUZZLE_ROUND_PHASES: PuzzleRoundPhase[] = [
  "creating",
  "ready_to_challenge",
  "in_challenge",
];

export type PuzzleRound = {
  id: string;
  groupId: string;
  sourceType: "text";
  sourceText: string;
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
