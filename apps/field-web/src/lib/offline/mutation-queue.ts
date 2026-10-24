/**
 * Field offline mutation queue (Phase 10).
 * Extends the sanitation outbox pattern with domain policy, scope, and status.
 */
import { acceptsQueuedMutations } from "./data-classification";
import { getOfflineStoreSync } from "./dexie-store";
import {
  LEGACY_SANITATION_QUEUE_KEY,
  MAX_MUTATION_ATTEMPTS,
  MAX_QUEUE_LENGTH,
  OFFLINE_STORAGE_PREFIX,
  type CacheStore,
} from "./offline-keys";

export {
  LEGACY_SANITATION_QUEUE_KEY,
  MAX_MUTATION_ATTEMPTS,
  MAX_QUEUE_LENGTH,
  OFFLINE_STORAGE_PREFIX,
  type CacheStore,
};

export type OfflineScope = {
  tenantId: string;
  userId: string;
};

export type QueuedMutationStatus = "PENDING" | "IN_FLIGHT" | "CONFLICT" | "FAILED" | "ABANDONED";

export type QueuedMutation = {
  id: string;
  tenantId: string;
  userId: string;
  domain: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body: Record<string, unknown>;
  operation: "create" | "update" | "delete";
  targetId: string | null;
  offlineClientId?: string;
  baseVersion: number | null;
  queuedAt: number;
  attempts: number;
  status: QueuedMutationStatus;
  lastError: string | null;
};

export type EnqueueMutationInput = {
  id?: string;
  domain: string;
  method: QueuedMutation["method"];
  path: string;
  body: Record<string, unknown>;
  operation?: QueuedMutation["operation"];
  targetId?: string | null;
  offlineClientId?: string;
  baseVersion?: number | null;
};

export type EnqueueMutationResult =
  | { ok: true; mutation: QueuedMutation }
  | {
      ok: false;
      code: "DOMAIN_NOT_QUEUEABLE" | "QUEUE_FULL" | "STORAGE_UNAVAILABLE" | "SCOPE_REQUIRED";
      reason: string;
    };

/** Prefer Dexie-backed store once initialized; otherwise localStorage. */
export function defaultStore(): CacheStore | null {
  return getOfflineStoreSync();
}

function queueKey(scope: OfflineScope): string {
  return `${OFFLINE_STORAGE_PREFIX}:mutations:${scope.tenantId}:${scope.userId}`;
}

function inferOperation(
  method: QueuedMutation["method"],
  path: string,
): QueuedMutation["operation"] {
  if (method === "DELETE") return "delete";
  if (method === "POST" && !/\/[0-9a-f-]{36}(\/|$)/i.test(path)) return "create";
  return "update";
}

export class FieldMutationQueue {
  private readonly storageKey: string;

  constructor(
    private readonly scope: OfflineScope,
    private readonly store: CacheStore | null = defaultStore(),
  ) {
    this.storageKey = queueKey(scope);
  }

  list(): QueuedMutation[] {
    if (!this.store) return [];
    const raw = this.store.getItem(this.storageKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as QueuedMutation[];
      return Array.isArray(parsed)
        ? parsed.filter(
            (item) => item.tenantId === this.scope.tenantId && item.userId === this.scope.userId,
          )
        : [];
    } catch {
      this.store.removeItem(this.storageKey);
      return [];
    }
  }

  enqueue(input: EnqueueMutationInput, now = Date.now()): EnqueueMutationResult {
    if (!this.store) {
      return { ok: false, code: "STORAGE_UNAVAILABLE", reason: "No device storage available." };
    }
    if (!this.scope.tenantId || !this.scope.userId) {
      return { ok: false, code: "SCOPE_REQUIRED", reason: "Tenant and user scope are required." };
    }
    if (!acceptsQueuedMutations(input.domain)) {
      return {
        ok: false,
        code: "DOMAIN_NOT_QUEUEABLE",
        reason: `${input.domain} does not accept offline mutations.`,
      };
    }
    const existing = this.list();
    if (existing.length >= MAX_QUEUE_LENGTH) {
      return {
        ok: false,
        code: "QUEUE_FULL",
        reason: "The offline queue is full. Reconnect and sync before capturing more work.",
      };
    }
    const id = input.id?.trim() || cryptoRandomId();
    const found = existing.find((item) => item.id === id);
    if (found) return { ok: true, mutation: found };

    const mutation: QueuedMutation = {
      id,
      tenantId: this.scope.tenantId,
      userId: this.scope.userId,
      domain: input.domain,
      method: input.method,
      path: input.path,
      body: input.body,
      operation: input.operation ?? inferOperation(input.method, input.path),
      targetId: input.targetId ?? null,
      ...(input.offlineClientId ? { offlineClientId: input.offlineClientId } : {}),
      baseVersion: input.baseVersion ?? null,
      queuedAt: now,
      attempts: 0,
      status: "PENDING",
      lastError: null,
    };
    this.write([...existing, mutation]);
    return { ok: true, mutation };
  }

  pending(): QueuedMutation[] {
    return this.list()
      .filter((item) => item.status === "PENDING" || item.status === "FAILED")
      .filter((item) => item.attempts < MAX_MUTATION_ATTEMPTS)
      .sort((left, right) => left.queuedAt - right.queuedAt);
  }

  pendingCount(): number {
    return this.pending().length;
  }

  markInFlight(id: string): void {
    this.update(id, (item) => ({ ...item, status: "IN_FLIGHT", attempts: item.attempts + 1 }));
  }

  markConflict(id: string, reason: string): void {
    this.update(id, (item) => ({ ...item, status: "CONFLICT", lastError: reason }));
  }

  markFailed(id: string, reason: string): void {
    this.update(id, (item) => ({
      ...item,
      status: item.attempts >= MAX_MUTATION_ATTEMPTS ? "ABANDONED" : "FAILED",
      lastError: reason,
    }));
  }

  remove(id: string): void {
    this.write(this.list().filter((item) => item.id !== id));
  }

  /** Replace remaining queue after a partial flush (order-preserving). */
  replaceAll(items: QueuedMutation[]): void {
    this.write(items);
  }

  clear(): void {
    this.store?.removeItem(this.storageKey);
  }

  private update(id: string, apply: (item: QueuedMutation) => QueuedMutation): void {
    this.write(this.list().map((item) => (item.id === id ? apply(item) : item)));
  }

  private write(items: QueuedMutation[]): void {
    if (!this.store) return;
    try {
      this.store.setItem(this.storageKey, JSON.stringify(items));
    } catch {
      // quota — caller still has return value
    }
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type LegacySanitationQueueItem = {
  id: string;
  method: "POST" | "PATCH" | "PUT";
  path: string;
  body: Record<string, unknown>;
  createdAt: string;
  offlineClientId?: string;
};

/** Import legacy sanitation queue items into the unified queue once. */
export function migrateLegacySanitationQueue(
  queue: FieldMutationQueue,
  store: CacheStore | null = defaultStore(),
): number {
  if (!store) return 0;
  const raw = store.getItem(LEGACY_SANITATION_QUEUE_KEY);
  if (!raw) return 0;
  let parsed: LegacySanitationQueueItem[] = [];
  try {
    parsed = JSON.parse(raw) as LegacySanitationQueueItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      store.removeItem(LEGACY_SANITATION_QUEUE_KEY);
      return 0;
    }
  } catch {
    store.removeItem(LEGACY_SANITATION_QUEUE_KEY);
    return 0;
  }

  let migrated = 0;
  for (const item of parsed) {
    const result = queue.enqueue({
      id: item.id,
      domain: "industrial.sanitation",
      method: item.method,
      path: item.path,
      body: item.body,
      ...(item.offlineClientId ? { offlineClientId: item.offlineClientId } : {}),
      operation: item.method === "POST" ? "create" : "update",
    });
    if (result.ok) migrated += 1;
  }
  store.removeItem(LEGACY_SANITATION_QUEUE_KEY);
  return migrated;
}
