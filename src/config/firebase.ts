import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Firebase Auth is provisioned by the project scaffold but has no current use case:
// the LINE webhook signature (see routes/webhook.ts) is the trust boundary for this
// bot, matching the pattern in sibling LINE bots (mahjong-manager-bot, Simple-Alert-LINE-Bot).
// Firestore is the only Firebase product actually used here.
function getOrInitApp() {
  const existing = getApps();
  return existing[0] ?? initializeApp();
}

let firestoreInstance: Firestore | undefined;

export function getDb(): Firestore {
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(getOrInitApp());
  }
  return firestoreInstance;
}
