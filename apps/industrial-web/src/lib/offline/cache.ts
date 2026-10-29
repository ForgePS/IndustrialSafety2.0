/**
 * IND-10 bounded offline cache.
 *
 * Entries are keyed by tenant and user so a shared device cannot leak one
 * tenant's data into another session, bounded in count so a large list cannot
 * fill device storage, and expired against the domain classification policy.
 * Storage is localStorage-backed: it is deliberately small and synchronous so
 * the cache stays auditable. IndexedDB is a later step, not a prerequisite.
 */
import { classifyDomain, isCacheable } from "./data-classification";

const STORAGE_PREFIX = "forge.ind.offline.v1";
const MAX_ENTRIES = 64;
const MAX_ENTRY_BYTES = 256 * 1024;

export type CacheScope = {
  tenantId: string;
  userId: string;
};

export type CacheEntry<T = unknown> = {
  key: string;
  domain: string;
  tenantId: string;
  userId: string;
  storedAt: number;
  expiresAt: number;
  value: T;
};

export type CacheStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

function defaultStore(): CacheStore | null {
  if (typeof globalThis === "undefined") return null;
  const candidate = (globalThis as { localStorage?: CacheStore }).localStorage;
  return candidate ?? null;
}

function entryKey(scope: CacheScope, domain: string, key: string): string {
  return `${STORAGE_PREFIX}:${scope.tenantId}:${scope.userId}:${domain}:${key}`;
}

function scopePrefix(scope: CacheScope): string {
  return `${STORAGE_PREFIX}:${scope.tenantId}:${scope.userId}:`;
}

function allKeys(store: CacheStore): string[] {
  const keys: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key && key.startsWith(`${STORAGE_PREFIX}:`)) keys.push(key);
  }
  return keys;
}

export class OfflineCache {
  private readonly store: CacheStore | null;

  constructor(
    private readonly scope: CacheScope,
    store: CacheStore | null = defaultStore(),
  ) {
    this.store = store;
  }

  get available(): boolean {
    return this.store !== null;
  }

  /**
   * Writes a cache entry when the domain policy allows it. Returns false when
   * the domain is not cacheable or the payload exceeds the per-entry bound —
   * callers treat that as "no cache", never as an error.
   */
  set<T>(domain: string, key: string, value: T, now: number = Date.now()): boolean {
    if (!this.store || !isCacheable(domain)) return false;
    const policy = classifyDomain(domain);
    const entry: CacheEntry<T> = {
      key,
      domain,
      tenantId: this.scope.tenantId,
      userId: this.scope.userId,
      storedAt: now,
      expiresAt: now + policy.maxAgeMs,
      value,
    };
    const serialized = JSON.stringify(entry);
    if (serialized.length > MAX_ENTRY_BYTES) return false;
    this.evictIfNeeded(now);
    try {
      this.store.setItem(entryKey(this.scope, domain, key), serialized);
      return true;
    } catch {
      // Quota exhaustion is not a failure of the workflow: drop the cache write.
      return false;
    }
  }

  get<T>(domain: string, key: string, now: number = Date.now()): T | null {
    if (!this.store || !isCacheable(domain)) return null;
    const storageKey = entryKey(this.scope, domain, key);
    const raw = this.store.getItem(storageKey);
    if (!raw) return null;
    let entry: CacheEntry<T>;
    try {
      entry = JSON.parse(raw) as CacheEntry<T>;
    } catch {
      this.store.removeItem(storageKey);
      return null;
    }
    const wrongScope = entry.tenantId !== this.scope.tenantId || entry.userId !== this.scope.userId;
    if (wrongScope || entry.expiresAt <= now) {
      this.store.removeItem(storageKey);
      return null;
    }
    return entry.value;
  }

  remove(domain: string, key: string): void {
    this.store?.removeItem(entryKey(this.scope, domain, key));
  }

  /** Drops expired entries across every scope on the device. */
  purgeExpired(now: number = Date.now()): number {
    if (!this.store) return 0;
    let removed = 0;
    for (const key of allKeys(this.store)) {
      const raw = this.store.getItem(key);
      if (!raw) continue;
      try {
        const entry = JSON.parse(raw) as CacheEntry;
        if (entry.expiresAt <= now) {
          this.store.removeItem(key);
          removed += 1;
        }
      } catch {
        this.store.removeItem(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Clears this tenant+user scope only. */
  clearScope(): number {
    if (!this.store) return 0;
    const prefix = scopePrefix(this.scope);
    let removed = 0;
    for (const key of allKeys(this.store)) {
      if (key.startsWith(prefix)) {
        this.store.removeItem(key);
        removed += 1;
      }
    }
    return removed;
  }

  private evictIfNeeded(now: number): void {
    if (!this.store) return;
    this.purgeExpired(now);
    const keys = allKeys(this.store);
    if (keys.length < MAX_ENTRIES) return;
    const dated = keys
      .map((key) => {
        const raw = this.store?.getItem(key);
        let storedAt = 0;
        if (raw) {
          try {
            storedAt = (JSON.parse(raw) as CacheEntry).storedAt ?? 0;
          } catch {
            storedAt = 0;
          }
        }
        return { key, storedAt };
      })
      .sort((left, right) => left.storedAt - right.storedAt);
    const overflow = dated.length - MAX_ENTRIES + 1;
    for (const item of dated.slice(0, Math.max(overflow, 0))) {
      this.store.removeItem(item.key);
    }
  }
}

/**
 * Logout hook: removes every cached entry and queued mutation for the device.
 * Called on sign out and on tenant switch, because permissions and entitlements
 * are re-evaluated for the new session.
 */
export function clearAllOfflineData(store: CacheStore | null = defaultStore()): number {
  if (!store) return 0;
  let removed = 0;
  for (const key of allKeys(store)) {
    store.removeItem(key);
    removed += 1;
  }
  return removed;
}

export const OFFLINE_CACHE_LIMITS = {
  storagePrefix: STORAGE_PREFIX,
  maxEntries: MAX_ENTRIES,
  maxEntryBytes: MAX_ENTRY_BYTES,
} as const;
