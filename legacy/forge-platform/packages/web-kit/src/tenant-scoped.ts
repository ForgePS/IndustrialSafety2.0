import { useEffect, useRef } from "react";

/**
 * Runs an async effect scoped to a tenant id (MK-S17).
 * Aborts in-flight work on tenant change/unmount and ignores late results that would
 * paint authorization-sensitive data from a previous tenant.
 */
export function useTenantScopedEffect(
  tenantId: string | null | undefined,
  effect: (ctx: {
    tenantId: string;
    signal: AbortSignal;
    isCurrent: () => boolean;
  }) => void | Promise<void>,
  deps: unknown[] = [],
): void {
  const generation = useRef(0);

  useEffect(() => {
    if (!tenantId) {
      return;
    }
    const gen = ++generation.current;
    const controller = new AbortController();
    const isCurrent = () => gen === generation.current && !controller.signal.aborted;

    void (async () => {
      try {
        await effect({ tenantId, signal: controller.signal, isCurrent });
      } catch (err) {
        if (controller.signal.aborted) return;
        throw err;
      }
    })();

    return () => {
      controller.abort();
    };
  }, [tenantId, ...deps]);
}

/** Prefer session tenant over a stale URL override for non-platform admins. */
export function resolveActiveTenantId(input: {
  sessionTenantId: string | null | undefined;
  queryTenantId: string | null | undefined;
  isPlatformAdmin?: boolean;
}): string | null {
  const session = input.sessionTenantId ?? null;
  const query = input.queryTenantId ?? null;
  if (query && session && query !== session && !input.isPlatformAdmin) {
    return session;
  }
  return query ?? session;
}

/** Keep ?tenantId= synchronized with the active session after a switch (no auth leak via stale links). */
export function syncTenantIdInUrl(tenantId: string): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("tenantId")) return;
    if (url.searchParams.get("tenantId") === tenantId) return;
    url.searchParams.set("tenantId", tenantId);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // ignore malformed URL edge cases
  }
}
