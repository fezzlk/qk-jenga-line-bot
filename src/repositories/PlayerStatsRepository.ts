import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "../config/firebase.js";
import type { PlayerStats } from "../types.js";

const COLLECTION = "playerStats";

function docId(groupId: string, userId: string): string {
  return `${groupId}_${userId}`;
}

export class PlayerStatsRepository {
  async get(groupId: string, userId: string): Promise<PlayerStats | null> {
    const doc = await getDb().collection(COLLECTION).doc(docId(groupId, userId)).get();
    if (!doc.exists) return null;
    const data = doc.data()!;
    return {
      groupId: data.groupId,
      userId: data.userId,
      totalPlays: data.totalPlays,
      totalScore: data.totalScore,
    };
  }

  /** Increments totalPlays by 1 and totalScore by scoreDelta, creating the record if needed. */
  async recordResult(groupId: string, userId: string, scoreDelta: number): Promise<void> {
    const ref = getDb().collection(COLLECTION).doc(docId(groupId, userId));
    await ref.set(
      {
        groupId,
        userId,
        totalPlays: FieldValue.increment(1),
        totalScore: FieldValue.increment(scoreDelta),
      },
      { merge: true },
    );
  }

  /** Same as recordResult(), but queued on an in-flight Firestore transaction instead of writing immediately. */
  recordResultInTransaction(
    txn: FirebaseFirestore.Transaction,
    groupId: string,
    userId: string,
    scoreDelta: number,
  ): void {
    const ref = getDb().collection(COLLECTION).doc(docId(groupId, userId));
    txn.set(
      ref,
      {
        groupId,
        userId,
        totalPlays: FieldValue.increment(1),
        totalScore: FieldValue.increment(scoreDelta),
      },
      { merge: true },
    );
  }
}
