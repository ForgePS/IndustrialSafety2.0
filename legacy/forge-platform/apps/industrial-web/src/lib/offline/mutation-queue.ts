/**
 * IND-10 offline mutation queue.
 *
 * Holds mutations authored while offline until connectivity returns. The queue
 * only stores what the server needs to re-evaluate authorization itself: it is
 * not a replication log, and replay never bypasses server-side permission or
 * conflict checks.
 */
import { acceptsQueuedMutations } from "./data-classification";
import { OFFLINE_CACHE_LIMITS, type CacheStore } from "./cache";

const QUEUE_KEY_PREFIX = `${OFFLINE_CACHE_LIMITS.storagePrefix}:mutations`;
const MAX_QUEUE_LENGTH = 50;
export const MAX_MUTATION_ATTEMPTS = 5;

export type QueuedMutationStatus = "PENDING" | "IN_FLIGHT" | "CONFLICT" | "FAILED" | "ABANDONED";

export type QueuedMutation = {
  id: string;
  tenantId: string;
  userId: string;
  domain: string;
  operation: "create" | "update" | "delete";
  /** Target record id. Null for creates. */
  targetId: string | null;
  payload: Record<string, unknown>;
  /** Server record version the mutation was authored against. */
  baseVersion: number | null;
  correlationId: string;
  queuedAt: number;
  attempts: number;
  status: QueuedMutationStatus;
  lastError: string | null;
};

export type EnqueueInput = {
  id: string;
  domain: string;
  operation: QueuedMutation["operation"];
  targetId?: string | null;
  payload: Record<string, unknown>;
  baseVersion?: number | null;
  correlationId: string;
};

export type EnqueueResult =
  | { ok: true; mutation: QueuedMutation }
  | {
      ok: false;
      code: "DOMAIN_NOT_QUEUEABLE" | "QUEUE_FULL" | "STORAGE_UNAVAILABLE";
      reason: string;
    };

function defaultStore(): CacheStore | null {
  if (typeof globalThis === "undefined") return null;
  return (globalThis as { localStorage?: CacheStore }).localStorage ?? null;
}

export class MutationQueue {
  private readonly storageKey: string;

  constructor(
    private readonly scope: { tenantId: string; userId: string },
    private readonly store: CacheStore | null = defaultStore(),
  ) {
    this.storageKey = `${QUEUE_KEY_PREFIX}:${scope.tenantId}:${scope.userId}`;
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

  enqueue(input: EnqueueInput, now: number = Date.now()): EnqueueResult {
    if (!this.store) {
      return { ok: false, code: "STORAGE_UNAVAILABLE", reason: "No device storage available." };
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
    if (existing.some((item) => item.id === input.id)) {
      const mutation = existing.find((item) => item.id === input.id)!;
      return { ok: true, mutation };
    }
    const mutation: QueuedMutation = {
      id: input.id,
      tenantId: this.scope.tenantId,
      userId: this.scope.userId,
      domain: input.domain,
      operation: input.operation,
      targetId: input.targetId ?? null,
      payload: input.payload,
      baseVersion: input.baseVersion ?? null,
      correlationId: input.correlationId,
      queuedAt: now,
      attempts: 0,
      status: "PENDING",
      lastError: null,
    };
    this.write([...existing, mutation]);
    return { ok: true, mutation };
  }

  /** Mutations eligible for a replay attempt, oldest first. */
  pending(): QueuedMutation[] {
    return this.list()
      .filter((item) => item.status === "PENDING" || item.status === "FAILED")
      .filter((item) => item.attempts < MAX_MUTATION_ATTEMPTS)
      .sort((left, right) => left.queuedAt - right.queuedAt);
  }

  markInFlight(id: string): void {
    this.update(id, (item) => ({ ...item, status: "IN_FLIGHT", attempts: item.attempts + 1 }));
  }

  markConflict(id: string, reason: string): void {
    this.update(id, (item) => ({ ...item, status: "CONFLICT", lastError: reason }));
  }

  /**
   * Records a replay failure. After MAX_MUTATION_ATTEMPTS the mutation is
   * ABANDONED rather than retried forever, and stays visible so the user knows
   * the work was not saved.
   */
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
      // Storage quota: keep the in-memory result and surface nothing here.
    }
  }
}
