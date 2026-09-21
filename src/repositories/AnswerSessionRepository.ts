import { getDb } from "../config/firebase.js";
import type { AnswerSession } from "../types.js";

const COLLECTION = "answerSessions";

function toEntity(id: string, data: FirebaseFirestore.DocumentData): AnswerSession {
  return {
    id,
    puzzleRoundId: data.puzzleRoundId,
    groupId: data.groupId,
    answererIds: data.answererIds,
    revealedCount: data.revealedCount,
    wrongAnswerCount: data.wrongAnswerCount,
    currentStepAttempts: data.currentStepAttempts,
    wrongAnswerLimit: data.wrongAnswerLimit,
    attemptsPerBlockLimit: data.attemptsPerBlockLimit,
    scoreCorrect: data.scoreCorrect,
    scoreWrongLimit: data.scoreWrongLimit,
    scoreFullyRevealed: data.scoreFullyRevealed,
    status: data.status,
    startedAt: data.startedAt,
    endedAt: data.endedAt,
  };
}

export class AnswerSessionRepository {
  async create(session: Omit<AnswerSession, "id">): Promise<AnswerSession> {
    const ref = await getDb().collection(COLLECTION).add(session);
    return { ...session, id: ref.id };
  }

  async getById(id: string): Promise<AnswerSession | null> {
    const doc = await getDb().collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return toEntity(doc.id, doc.data()!);
  }

  async getActiveByGroup(groupId: string): Promise<AnswerSession | null> {
    const snapshot = await getDb()
      .collection(COLLECTION)
      .where("groupId", "==", groupId)
      .where("status", "==", "active")
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0]!;
    return toEntity(doc.id, doc.data());
  }

  async update(id: string, patch: Partial<Omit<AnswerSession, "id">>): Promise<void> {
    await getDb().collection(COLLECTION).doc(id).update(patch);
  }

  /** Re-reads the session inside an in-flight Firestore transaction, for read-modify-write safety. */
  async getByIdInTransaction(
    txn: FirebaseFirestore.Transaction,
    id: string,
  ): Promise<AnswerSession | null> {
    const doc = await txn.get(getDb().collection(COLLECTION).doc(id));
    if (!doc.exists) return null;
    return toEntity(doc.id, doc.data()!);
  }

  /** Same as update(), but queued on an in-flight Firestore transaction instead of writing immediately. */
  updateInTransaction(
    txn: FirebaseFirestore.Transaction,
    id: string,
    patch: Partial<Omit<AnswerSession, "id">>,
  ): void {
    txn.update(getDb().collection(COLLECTION).doc(id), patch);
  }
}
