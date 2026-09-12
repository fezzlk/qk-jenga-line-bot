import { getDb } from "../config/firebase.js";

/**
 * Abstraction over Firestore's runTransaction so services/use cases that need
 * cross-document atomicity stay testable without a real Firestore instance.
 * tests/testUtils/fakeRepositories.ts provides an in-memory stand-in.
 */
export interface Transactor {
  run<T>(fn: (txn: FirebaseFirestore.Transaction) => Promise<T>): Promise<T>;
}

export class FirestoreTransactor implements Transactor {
  run<T>(fn: (txn: FirebaseFirestore.Transaction) => Promise<T>): Promise<T> {
    return getDb().runTransaction(fn);
  }
}
