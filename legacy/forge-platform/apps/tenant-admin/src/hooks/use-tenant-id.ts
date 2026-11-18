"use client";

import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

/** Prefer session tenant when URL tenantId is stale for non-platform admins (MK-S17). */
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

export function syncTenantIdInUrl(tenantId: string): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("tenantId")) return;
    if (url.searchParams.get("tenantId") === tenantId) return;
    url.searchParams.set("tenantId", tenantId);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // ignore
  }
}

export function useTenantId(): string | null {
  const searchParams = useSearchParams();
  const { me } = useAuth();
  return resolveActiveTenantId({
    sessionTenantId: me?.tenantId,
    queryTenantId: searchParams.get("tenantId"),
    ...(me?.isPlatformAdmin ? { isPlatformAdmin: true } : {}),
  });
}

export function tenantQuery(tenantId: string): string {
  return `?tenantId=${encodeURIComponent(tenantId)}`;
}
