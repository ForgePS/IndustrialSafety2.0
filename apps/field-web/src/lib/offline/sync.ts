/**
 * Field offline sync orchestrator (Phase 10).
 * Flush order-preserving HTTP mutations; remap offlineClientId like sanitation.
 */
import { ApiError, apiSend } from "@forge/web-kit";
import {
  FieldMutationQueue,
  migrateLegacySanitationQueue,
  type EnqueueMutationInput,
  type OfflineScope,
  type QueuedMutation,
} from "./mutation-queue";
import { FieldOfflineCache } from "./cache";
import { acceptsQueuedMutations } from "./data-classification";

let activeScope: OfflineScope | null = null;
const listeners = new Set<() => void>();

export function setOfflineScope(scope: OfflineScope | null): void {
  activeScope = scope?.tenantId && scope.userId ? scope : null;
  notifyOfflineListeners();
}

export function getOfflineScope(): OfflineScope | null {
  return activeScope;
}

export function subscribeOfflinePending(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyOfflineListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

export function getMutationQueue(
  scope: OfflineScope | null = activeScope,
): FieldMutationQueue | null {
  if (!scope?.tenantId || !scope.userId) return null;
  return new FieldMutationQueue(scope);
}

export function getOfflineCache(
  scope: OfflineScope | null = activeScope,
): FieldOfflineCache | null {
  if (!scope?.tenantId || !scope.userId) return null;
  return new FieldOfflineCache(scope);
}

export function pendingOfflineCount(scope: OfflineScope | null = activeScope): number {
  const queue = getMutationQueue(scope);
  if (!queue) return 0;
  migrateLegacySanitationQueue(queue);
  return queue.pendingCount();
}

export function enqueueOfflineMutation(
  input: EnqueueMutationInput,
  scope: OfflineScope | null = activeScope,
): ReturnType<FieldMutationQueue["enqueue"]> {
  const queue = getMutationQueue(scope);
  if (!queue) {
    return {
      ok: false,
      code: "SCOPE_REQUIRED",
      reason: "Sign in and select a company before queuing offline work.",
    };
  }
  migrateLegacySanitationQueue(queue);
  const result = queue.enqueue(input);
  notifyOfflineListeners();
  return result;
}

function isDuplicateOfflineSuccess(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status === 409 || err.status === 412) return true;
  const msg = (err.message ?? "").toLowerCase();
  const code = (err.code ?? "").toLowerCase();
  return (
    msg.includes("offlineclientid") ||
    msg.includes("duplicate") ||
    msg.includes("already exists") ||
    code.includes("conflict") ||
    code.includes("duplicate")
  );
}

function rewritePath(path: string, idMap: Map<string, string>): string {
  let next = path;
  for (const [offlineId, serverId] of idMap) {
    if (next.includes(offlineId)) next = next.split(offlineId).join(serverId);
  }
  return next;
}

function rewriteBody(
  body: Record<string, unknown>,
  idMap: Map<string, string>,
): Record<string, unknown> {
  const raw = JSON.stringify(body);
  let next = raw;
  for (const [offlineId, serverId] of idMap) {
    if (next.includes(offlineId)) next = next.split(offlineId).join(serverId);
  }
  try {
    return JSON.parse(next) as Record<string, unknown>;
  } catch {
    return body;
  }
}

export type FlushResult = {
  flushed: number;
  remaining: number;
  conflicts: number;
  failed: number;
};

/**
 * Flush queued mutations in order. Stops on first hard failure so dependent
 * path remaps stay consistent (sanitation create → patch).
 */
export async function flushOfflineQueue(
  scope: OfflineScope | null = activeScope,
): Promise<FlushResult> {
  const queue = getMutationQueue(scope);
  if (!queue) return { flushed: 0, remaining: 0, conflicts: 0, failed: 0 };
  migrateLegacySanitationQueue(queue);

  const pending = queue.pending();
  if (!pending.length) return { flushed: 0, remaining: 0, conflicts: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { flushed: 0, remaining: pending.length, conflicts: 0, failed: 0 };
  }

  const idMap = new Map<string, string>();
  const remaining: QueuedMutation[] = [];
  let flushed = 0;
  let conflicts = 0;
  let failed = 0;
  let stopped = false;

  for (const item of pending) {
    if (stopped) {
      remaining.push(item);
      continue;
    }
    queue.markInFlight(item.id);
    const path = rewritePath(item.path, idMap);
    const body = rewriteBody(item.body, idMap);
    try {
      const result = await apiSend<Record<string, unknown>>(path, item.method, body, {
        idempotencyKey: item.id,
      });
      const offlineClientId =
        item.offlineClientId ||
        (typeof body.offlineClientId === "string" ? body.offlineClientId : undefined);
      const serverId = typeof result?.id === "string" ? result.id : undefined;
      if (offlineClientId && serverId) {
        idMap.set(offlineClientId, serverId);
        try {
          const { loadSanitationDraft, clearSanitationDraft, saveSanitationDraft } =
            await import("@/lib/sanitation-offline");
          const draft = loadSanitationDraft(offlineClientId);
          if (draft && serverId !== offlineClientId) {
            clearSanitationDraft(offlineClientId);
            saveSanitationDraft({ ...draft, inspectionId: serverId });
          }
        } catch {
          // draft remap is best-effort
        }
      }
      queue.remove(item.id);
      flushed += 1;
    } catch (err) {
      if (isDuplicateOfflineSuccess(err)) {
        queue.remove(item.id);
        flushed += 1;
        continue;
      }
      const message = err instanceof Error ? err.message : "Sync failed";
      if (err instanceof ApiError && (err.status === 409 || err.status === 412)) {
        queue.markConflict(item.id, message);
        conflicts += 1;
        remaining.push(...pending.slice(pending.indexOf(item) + 1));
        stopped = true;
        continue;
      }
      queue.markFailed(item.id, message);
      failed += 1;
      // Network failures: keep item + rest in queue and stop.
      const latest = queue.list().find((row) => row.id === item.id);
      if (latest) remaining.push(latest);
      remaining.push(...pending.slice(pending.indexOf(item) + 1));
      stopped = true;
    }
  }

  // Rebuild remaining queue: keep CONFLICT/FAILED/ABANDONED + unprocessed pending
  const keptStatuses = new Set(["CONFLICT", "FAILED", "ABANDONED", "PENDING", "IN_FLIGHT"]);
  const survivors = queue
    .list()
    .filter((item) => keptStatuses.has(item.status) && item.status !== "IN_FLIGHT");
  const byId = new Map(survivors.map((item) => [item.id, item]));
  for (const item of remaining) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  queue.replaceAll([...byId.values()].sort((a, b) => a.queuedAt - b.queuedAt));

  notifyOfflineListeners();
  return {
    flushed,
    remaining: queue.pendingCount(),
    conflicts,
    failed,
  };
}

export type { QueuedMutation } from "./mutation-queue";

/**
 * Send immediately when online; otherwise enqueue when the domain allows it.
 */
export async function offlineSend<T = Record<string, unknown>>(
  domain: string,
  path: string,
  method: QueuedMutation["method"],
  body: Record<string, unknown>,
  opts?: {
    offlineClientId?: string;
    forceQueue?: boolean;
    operation?: QueuedMutation["operation"];
    targetId?: string | null;
  },
): Promise<{ queued: boolean; data?: T }> {
  const offline = opts?.forceQueue || (typeof navigator !== "undefined" && !navigator.onLine);

  if (offline) {
    if (!acceptsQueuedMutations(domain)) {
      throw new Error("This action requires a network connection.");
    }
    const result = enqueueOfflineMutation({
      domain,
      method,
      path,
      body,
      ...(opts?.offlineClientId ? { offlineClientId: opts.offlineClientId } : {}),
      ...(opts?.operation ? { operation: opts.operation } : {}),
      ...(opts?.targetId !== undefined ? { targetId: opts.targetId } : {}),
    });
    if (!result.ok) throw new Error(result.reason);
    return { queued: true };
  }

  try {
    const data = await apiSend<T>(path, method, body);
    return { queued: false, data };
  } catch (err) {
    if (isDuplicateOfflineSuccess(err)) return { queued: false };
    const shouldQueue =
      acceptsQueuedMutations(domain) &&
      ((err instanceof ApiError && err.status === 0) || err instanceof TypeError);
    if (shouldQueue) {
      const result = enqueueOfflineMutation({
        domain,
        method,
        path,
        body,
        ...(opts?.offlineClientId ? { offlineClientId: opts.offlineClientId } : {}),
        ...(opts?.operation ? { operation: opts.operation } : {}),
        ...(opts?.targetId !== undefined ? { targetId: opts.targetId } : {}),
      });
      if (result.ok) return { queued: true };
    }
    throw err;
  }
}
