"use client";

import { useSearchParams } from "next/navigation";
import { resolveActiveTenantId } from "@forge/web-kit";
import { useAuth } from "@/hooks/use-auth";

/** Active tenant for data fetching (session wins over stale URL for non-admins). */
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

export function tenantDetailHref(tenantId: string): string {
  return `/customers/detail/?tenantId=${encodeURIComponent(tenantId)}`;
}

export function personDetailHref(personId: string, tenantId: string): string {
  return `/person-detail?personId=${encodeURIComponent(personId)}&tenantId=${encodeURIComponent(tenantId)}`;
}
