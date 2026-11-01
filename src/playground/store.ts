import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "../config/firebase.js";

export type PlaygroundGroup = {
  groupId: string;
  name: string | null;
  /** IDs of real LINE users seen sending to this group. */
  realUserIds: string[];
  lastSeenAt: number;
};

export type PlaygroundUser = { userId: string; groupId: string; name: string };

/** Fictional users' IDs are LINE-shaped ("U" + 32 chars) and always contain "playground". */
export const PLAYGROUND_USER_PREFIX = "Uplayground";

export function isPlaygroundUserId(userId: string): boolean {
  return userId.startsWith(PLAYGROUND_USER_PREFIX);
}

export function newPlaygroundUserId(): string {
  return PLAYGROUND_USER_PREFIX + randomBytes(11).toString("hex");
}

export interface PlaygroundStore {
  /** Notes that a real user sent something to this group; `name` is set only when known. */
  recordGroup(groupId: string, realUserId: string | undefined, name: string | null): Promise<void>;
  hasGroup(groupId: string): Promise<boolean>;
  listGroups(): Promise<PlaygroundGroup[]>;
  listUsers(groupId: string): Promise<PlaygroundUser[]>;
  addUser(groupId: string, name: string): Promise<PlaygroundUser>;
  renameUser(userId: string, name: string): Promise<PlaygroundUser | null>;
  getUser(userId: string): Promise<PlaygroundUser | null>;
}

const GROUPS = "playgroundGroups";
const USERS = "playgroundUsers";

// Persisted because Cloud Run instances come and go; an in-memory registry would
// forget fictional users between requests.
export class FirestorePlaygroundStore implements PlaygroundStore {
  async recordGroup(groupId: string, realUserId: string | undefined, name: string | null) {
    await getDb()
      .collection(GROUPS)
      .doc(groupId)
      .set(
        {
          groupId,
          lastSeenAt: Date.now(),
          ...(name ? { name } : {}),
          ...(realUserId ? { realUserIds: FieldValue.arrayUnion(realUserId) } : {}),
        },
        { merge: true },
      );
  }

  async hasGroup(groupId: string) {
    return (await getDb().collection(GROUPS).doc(groupId).get()).exists;
  }

  async listGroups() {
    const snapshot = await getDb().collection(GROUPS).get();
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        groupId: doc.id,
        name: data.name ?? null,
        realUserIds: data.realUserIds ?? [],
        lastSeenAt: data.lastSeenAt ?? 0,
      };
    });
  }

  async listUsers(groupId: string) {
    const snapshot = await getDb().collection(USERS).where("groupId", "==", groupId).get();
    return snapshot.docs.map((doc) => doc.data() as PlaygroundUser);
  }

  async addUser(groupId: string, name: string) {
    const user = { userId: newPlaygroundUserId(), groupId, name };
    await getDb()
      .collection(USERS)
      .doc(user.userId)
      .set({ ...user, createdAt: Date.now() });
    return user;
  }

  async renameUser(userId: string, name: string) {
    const ref = getDb().collection(USERS).doc(userId);
    const doc = await ref.get();
    if (!doc.exists) return null;
    await ref.update({ name });
    return { ...(doc.data() as PlaygroundUser), name };
  }

  async getUser(userId: string) {
    const doc = await getDb().collection(USERS).doc(userId).get();
    return doc.exists ? (doc.data() as PlaygroundUser) : null;
  }
}

export class InMemoryPlaygroundStore implements PlaygroundStore {
  groups = new Map<string, PlaygroundGroup>();
  users = new Map<string, PlaygroundUser>();

  async recordGroup(groupId: string, realUserId: string | undefined, name: string | null) {
    const group = this.groups.get(groupId) ?? {
      groupId,
      name: null,
      realUserIds: [],
      lastSeenAt: 0,
    };
    group.lastSeenAt = Date.now();
    if (name) group.name = name;
    if (realUserId && !group.realUserIds.includes(realUserId)) group.realUserIds.push(realUserId);
    this.groups.set(groupId, group);
  }

  async hasGroup(groupId: string) {
    return this.groups.has(groupId);
  }

  async listGroups() {
    return [...this.groups.values()];
  }

  async listUsers(groupId: string) {
    return [...this.users.values()].filter((u) => u.groupId === groupId);
  }

  async addUser(groupId: string, name: string) {
    const user = { userId: newPlaygroundUserId(), groupId, name };
    this.users.set(user.userId, user);
    return user;
  }

  async renameUser(userId: string, name: string) {
    const user = this.users.get(userId);
    if (!user) return null;
    user.name = name;
    return user;
  }

  async getUser(userId: string) {
    return this.users.get(userId) ?? null;
  }
}
