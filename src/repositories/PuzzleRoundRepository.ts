import { getDb } from "../config/firebase.js";
import {
  ACTIVE_PUZZLE_ROUND_PHASES,
  type NewPuzzleRound,
  type PuzzleRound,
  type PuzzleRoundPatch,
  type PuzzleRoundPhase,
} from "../types.js";

const COLLECTION = "puzzleRounds";

function toEntity(id: string, data: FirebaseFirestore.DocumentData): PuzzleRound {
  const common = {
    id,
    groupId: data.groupId,
    totalHideCount: data.totalHideCount,
    participantIds: data.participantIds,
    lastHiderId: data.lastHiderId,
    hiddenPositions: data.hiddenPositions,
    phase: data.phase,
    createdAt: data.createdAt,
  };
  if (data.sourceType === "image") {
    return {
      ...common,
      sourceType: "image",
      creatorId: data.creatorId,
      sourceImagePath: data.sourceImagePath ?? null,
      gridSize: data.gridSize ?? null,
      answerText: data.answerText ?? null,
    };
  }
  return { ...common, sourceType: "text", sourceText: data.sourceText };
}

export class PuzzleRoundRepository {
  async create(round: NewPuzzleRound): Promise<PuzzleRound> {
    const ref = await getDb().collection(COLLECTION).add(round);
    return { ...round, id: ref.id };
  }

  async getById(id: string): Promise<PuzzleRound | null> {
    const doc = await getDb().collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return toEntity(doc.id, doc.data()!);
  }

  async getByGroupAndPhase(groupId: string, phase: PuzzleRoundPhase): Promise<PuzzleRound | null> {
    const snapshot = await getDb()
      .collection(COLLECTION)
      .where("groupId", "==", groupId)
      .where("phase", "==", phase)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0]!;
    return toEntity(doc.id, doc.data());
  }

  /** Any round for the group that is not yet closed (creating / ready / in-challenge). */
  async getActiveByGroup(groupId: string): Promise<PuzzleRound | null> {
    for (const phase of ACTIVE_PUZZLE_ROUND_PHASES) {
      const round = await this.getByGroupAndPhase(groupId, phase);
      if (round) return round;
    }
    return null;
  }

  async update(id: string, patch: PuzzleRoundPatch): Promise<void> {
    await getDb().collection(COLLECTION).doc(id).update(patch);
  }

  /** Re-reads the round inside an in-flight Firestore transaction, for read-modify-write safety. */
  async getByIdInTransaction(
    txn: FirebaseFirestore.Transaction,
    id: string,
  ): Promise<PuzzleRound | null> {
    const doc = await txn.get(getDb().collection(COLLECTION).doc(id));
    if (!doc.exists) return null;
    return toEntity(doc.id, doc.data()!);
  }

  /** Same as update(), but queued on an in-flight Firestore transaction instead of writing immediately. */
  updateInTransaction(
    txn: FirebaseFirestore.Transaction,
    id: string,
    patch: PuzzleRoundPatch,
  ): void {
    txn.update(getDb().collection(COLLECTION).doc(id), patch);
  }
}
