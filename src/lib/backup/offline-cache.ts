"use client";

import { openDB } from "idb";

const DATABASE_NAME = "nour-admin-backup";
const STORE_NAME = "snapshots";
const SCHEMA_VERSION = 3;
const ACTIVE_ADMIN_KEY = "__active_admin__";
type CacheEntry<T> = { key: string; scope: string; savedAt: string; schemaVersion: number; data: T };

async function database() {
  return openDB(DATABASE_NAME, SCHEMA_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "key" });
    },
  });
}

export async function readBackupCache<T>(key: string, scope: string): Promise<CacheEntry<T> | null> {
  const db = await database();
  try {
    const entry = await db.get(STORE_NAME, key) as CacheEntry<T> | undefined;
    if (!entry || entry.schemaVersion !== SCHEMA_VERSION || entry.scope !== scope ||
      typeof entry.savedAt !== "string" || Number.isNaN(Date.parse(entry.savedAt)) ||
      typeof entry.data !== "object" || entry.data === null) return null;
    return entry;
  } finally {
    db.close();
  }
}

export async function writeBackupCache<T>(key: string, scope: string, data: T): Promise<string> {
  const db = await database();
  try {
    const savedAt = new Date().toISOString();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    await Promise.all([
      transaction.store.put({ key, scope, savedAt, schemaVersion: SCHEMA_VERSION, data } satisfies CacheEntry<T>),
      transaction.store.put({ key: ACTIVE_ADMIN_KEY, scope, savedAt, schemaVersion: SCHEMA_VERSION, data: null } satisfies CacheEntry<null>),
    ]);
    await transaction.done;
    return savedAt;
  } finally {
    db.close();
  }
}

export async function clearAllBackupCache(): Promise<void> {
  const db = await database();
  try {
    await db.clear(STORE_NAME);
  } finally {
    db.close();
  }
}

export async function clearBackupCache(key: string): Promise<void> {
  const db = await database();
  try {
    await db.delete(STORE_NAME, key);
  } finally {
    db.close();
  }
}
