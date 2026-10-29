/**
 * Forge-owned browser state cleanup for logout and tenant switch (RG-09 / FIS-H01).
 * Apps register handlers; AuthProvider invokes them before session mutation.
 */

export type ForgeBrowserCleanupReason = "logout" | "tenant-switch";

export type ForgeBrowserCleanupHandler = (
  reason: ForgeBrowserCleanupReason,
) => void | Promise<void>;

const handlers = new Set<ForgeBrowserCleanupHandler>();

/** Default budget so Android Chrome IDB/SW hangs cannot block Cognito logout redirect. */
export const FORGE_BROWSER_CLEANUP_TIMEOUT_MS = 3000;
const PER_OP_TIMEOUT_MS = 1500;

/** Resolve with `fallback` if `promise` does not settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, ms);
    void promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** Register a cleanup handler (idempotent by function identity). */
export function registerForgeBrowserCleanup(handler: ForgeBrowserCleanupHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/** Run all registered cleanups. Errors and hangs are bounded so auth flow continues. */
export async function runForgeBrowserCleanup(
  reason: ForgeBrowserCleanupReason,
  options?: { timeoutMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? FORGE_BROWSER_CLEANUP_TIMEOUT_MS;
  const pending = [...handlers].map(async (handler) => {
    try {
      await handler(reason);
    } catch {
      // Best-effort — never block logout / tenant switch.
    }
  });
  await withTimeout(
    Promise.all(pending).then(() => undefined),
    timeoutMs,
    undefined,
  );
}

/** Test helper: drop all handlers. */
export function resetForgeBrowserCleanupHandlersForTests(): void {
  handlers.clear();
}

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/**
 * Remove keys whose name starts with any of the given prefixes.
 * Snapshot keys first so removals do not skip indices.
 */
export function removeStorageKeysByPrefix(
  store: StorageLike | null | undefined,
  prefixes: readonly string[],
): number {
  if (!store || prefixes.length === 0) return 0;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (!key) continue;
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    store.removeItem(key);
  }
  return keys.length;
}

/** Delete IndexedDB databases by exact name (best-effort, time-bounded). */
export async function deleteIndexedDatabases(names: readonly string[]): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  let deleted = 0;
  for (const name of names) {
    try {
      const ok = await withTimeout(
        new Promise<boolean>((resolve) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
          // Android often fires blocked and never succeeds while a tab holds the DB open.
          req.onblocked = () => resolve(false);
        }),
        PER_OP_TIMEOUT_MS,
        false,
      );
      if (ok) deleted += 1;
    } catch {
      // ignore
    }
  }
  return deleted;
}

/** Delete Cache Storage entries whose names start with any prefix (or exact match list). */
export async function deleteCacheNamesByPrefix(prefixes: readonly string[]): Promise<number> {
  if (typeof caches === "undefined") return 0;
  try {
    const keys = await withTimeout(caches.keys(), PER_OP_TIMEOUT_MS, [] as string[]);
    const targets = keys.filter((key) => prefixes.some((prefix) => key.startsWith(prefix)));
    await withTimeout(
      Promise.all(targets.map((key) => caches.delete(key))).then(() => undefined),
      PER_OP_TIMEOUT_MS,
      undefined,
    );
    return targets.length;
  } catch {
    return 0;
  }
}

/**
 * Unregister service workers whose script URL path includes any of the markers
 * (e.g. "/sw.js" for Field). Does not touch unrelated registrations.
 */
export async function unregisterServiceWorkersByScriptMatch(
  markers: readonly string[],
): Promise<number> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.getRegistrations) {
    return 0;
  }
  try {
    const registrations = await withTimeout(
      navigator.serviceWorker.getRegistrations(),
      PER_OP_TIMEOUT_MS,
      [] as ReadonlyArray<ServiceWorkerRegistration>,
    );
    let count = 0;
    for (const registration of registrations) {
      const scriptUrl =
        registration.active?.scriptURL ??
        registration.waiting?.scriptURL ??
        registration.installing?.scriptURL ??
        "";
      if (markers.some((marker) => scriptUrl.includes(marker))) {
        const ok = await withTimeout(registration.unregister(), PER_OP_TIMEOUT_MS, false);
        if (ok) count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}
