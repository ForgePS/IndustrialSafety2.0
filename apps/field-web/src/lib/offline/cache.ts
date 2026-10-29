/**
 * Field offline cache (Phase 10 / Dexie upgrade).
 * Bounded keyed cache (Dexie-backed CacheStore when available).
 */
import { classifyDomain, domainMaxAgeMs, isCacheable } from "./data-classification";
import {
  defaultStore,
  OFFLINE_STORAGE_PREFIX,
  type CacheStore,
  type OfflineScope,
} from "./mutation-queue";

const MAX_ENTRIES = 64;
const MAX_ENTRY_BYTES = 256 * 1024;

export type CacheScope = OfflineScope;

export type CacheEntry<T = unknown> = {
  key: string;
  domain: string;
  tenantId: string;
  userId: string;
  storedAt: number;
  expiresAt: number;
  value: T;
};

function entryKey(scope: CacheScope, domain: string, key: string): string {
  return `${OFFLINE_STORAGE_PREFIX}:${scope.tenantId}:${scope.userId}:${domain}:${key}`;
}

function scopePrefix(scope: CacheScope): string {
  return `${OFFLINE_STORAGE_PREFIX}:${scope.tenantId}:${scope.userId}:`;
}

export class FieldOfflineCache {
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

  set<T>(domain: string, key: string, value: T, ttlMs?: number, now = Date.now()): boolean {
    if (!this.store || !isCacheable(domain)) return false;
    const maxAge = ttlMs ?? domainMaxAgeMs(domain);
    if (!(maxAge > 0)) return false;
    const entry: CacheEntry<T> = {
      key,
      domain,
      tenantId: this.scope.tenantId,
      userId: this.scope.userId,
      storedAt: now,
      expiresAt: now + maxAge,
      value,
    };
    const serialized = JSON.stringify(entry);
    if (serialized.length > MAX_ENTRY_BYTES) return false;
    try {
      this.store.setItem(entryKey(this.scope, domain, key), serialized);
      this.trim();
      return true;
    } catch {
      return false;
    }
  }

  get<T>(domain: string, key: string, now = Date.now()): T | null {
    if (!this.store) return null;
    const raw = this.store.getItem(entryKey(this.scope, domain, key));
    if (!raw) return null;
    try {
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (entry.expiresAt < now) {
        this.store.removeItem(entryKey(this.scope, domain, key));
        return null;
      }
      return entry.value;
    } catch {
      return null;
    }
  }

  peekMeta(domain: string, key: string): { storedAt: number; expiresAt: number } | null {
    if (!this.store) return null;
    const raw = this.store.getItem(entryKey(this.scope, domain, key));
    if (!raw) return null;
    try {
      const entry = JSON.parse(raw) as CacheEntry;
      return { storedAt: entry.storedAt, expiresAt: entry.expiresAt };
    } catch {
      return null;
    }
  }

  remove(domain: string, key: string): void {
    this.store?.removeItem(entryKey(this.scope, domain, key));
  }

  private trim(): void {
    if (!this.store) return;
    const prefix = scopePrefix(this.scope);
    const keys: string[] = [];
    for (let i = 0; i < this.store.length; i += 1) {
      const key = this.store.key(i);
      if (key?.startsWith(prefix) && !key.includes(":mutations:")) keys.push(key);
    }
    if (keys.length <= MAX_ENTRIES) return;
    const overflow = keys.length - MAX_ENTRIES;
    for (let i = 0; i < overflow; i += 1) {
      this.store.removeItem(keys[i]!);
    }
  }
}

export function clearAllOfflineData(store: CacheStore | null = defaultStore()): number {
  if (!store) return 0;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key?.startsWith(`${OFFLINE_STORAGE_PREFIX}:`)) keys.push(key);
  }
  for (const key of keys) store.removeItem(key);
  return keys.length;
}

export function policyAllowsCache(domain: string): boolean {
  return isCacheable(domain) && classifyDomain(domain).maxAgeMs > 0;
}

/** @deprecated Use pendingOfflineCount from sync.ts — kept for shell import compatibility during migrate. */
export function readOfflineQueue(): unknown[] {
  return [];
}

/** @deprecated Use pendingOfflineCount from sync.ts */
export function pendingSyncCount(): number {
  return 0;
}
