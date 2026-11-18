/**
 * Dexie-backed CacheStore for Field offline engine.
 * Sync API over an in-memory map; Dexie persists asynchronously.
 * Falls back to localStorage when IndexedDB is unavailable.
 */
import Dexie, { type Table } from "dexie";
import {
  LEGACY_SANITATION_QUEUE_KEY,
  OFFLINE_STORAGE_PREFIX,
  type CacheStore,
} from "./offline-keys";

const DB_NAME = "forge-field-offline";
const MIGRATION_FLAG = "forge.field.offline.dexie.migrated.v1";

type KvRow = { key: string; value: string };

class FieldOfflineDexie extends Dexie {
  kv!: Table<KvRow, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({ kv: "key" });
  }
}

export class MemoryCacheStore implements CacheStore {
  private readonly map = new Map<string, string>();

  get length() {
    return this.map.size;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) ?? null) : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  entries(): Array<[string, string]> {
    return [...this.map.entries()];
  }

  loadEntries(entries: Iterable<[string, string]>): void {
    for (const [key, value] of entries) {
      this.map.set(key, value);
    }
  }
}

/** Dexie-persisted store with sync CacheStore surface. */
export class DexieCacheStore extends MemoryCacheStore {
  constructor(private readonly db: FieldOfflineDexie) {
    super();
  }

  override setItem(key: string, value: string): void {
    super.setItem(key, value);
    void this.db.kv.put({ key, value }).catch(() => {
      // Best-effort persistence; memory remains source of truth for this session.
    });
  }

  override removeItem(key: string): void {
    super.removeItem(key);
    void this.db.kv.delete(key).catch(() => undefined);
  }
}

let sharedStore: CacheStore | null = null;
let initPromise: Promise<CacheStore | null> | null = null;

function localStorageStore(): CacheStore | null {
  if (typeof globalThis === "undefined") return null;
  return (globalThis as { localStorage?: CacheStore }).localStorage ?? null;
}

function listLocalOfflineKeys(ls: CacheStore): string[] {
  const keys: string[] = [];
  for (let i = 0; i < ls.length; i += 1) {
    const key = ls.key(i);
    if (!key) continue;
    if (
      key.startsWith(`${OFFLINE_STORAGE_PREFIX}:`) ||
      key === LEGACY_SANITATION_QUEUE_KEY ||
      key.startsWith("forge.field.sanitation.draft.")
    ) {
      keys.push(key);
    }
  }
  return keys;
}

/** Copy offline localStorage keys into Dexie, then remove migrated keys. */
export async function migrateLocalStorageToDexie(
  db: FieldOfflineDexie,
  ls: CacheStore | null = localStorageStore(),
): Promise<number> {
  if (!ls) return 0;
  if (ls.getItem(MIGRATION_FLAG) === "1") return 0;
  const keys = listLocalOfflineKeys(ls);
  let migrated = 0;
  for (const key of keys) {
    const value = ls.getItem(key);
    if (value == null) continue;
    await db.kv.put({ key, value });
    ls.removeItem(key);
    migrated += 1;
  }
  ls.setItem(MIGRATION_FLAG, "1");
  return migrated;
}

export async function openDexieOfflineStore(): Promise<CacheStore | null> {
  if (typeof indexedDB === "undefined") {
    return localStorageStore();
  }
  try {
    const db = new FieldOfflineDexie();
    await db.open();
    await migrateLocalStorageToDexie(db);
    const store = new DexieCacheStore(db);
    const rows = await db.kv.toArray();
    store.loadEntries(rows.map((row) => [row.key, row.value]));
    return store;
  } catch {
    return localStorageStore();
  }
}

/**
 * Initialize the shared offline store (Dexie preferred).
 * Safe to call multiple times; subsequent callers await the same promise.
 */
export function ensureOfflineStore(): Promise<CacheStore | null> {
  if (sharedStore) return Promise.resolve(sharedStore);
  if (!initPromise) {
    initPromise = openDexieOfflineStore().then((store) => {
      sharedStore = store;
      return store;
    });
  }
  return initPromise;
}

export function getOfflineStoreSync(): CacheStore | null {
  return sharedStore ?? localStorageStore();
}

/** Test helper — inject a memory store without touching IndexedDB. */
export function setOfflineStoreForTests(store: CacheStore | null): void {
  sharedStore = store;
  initPromise = Promise.resolve(store);
}
