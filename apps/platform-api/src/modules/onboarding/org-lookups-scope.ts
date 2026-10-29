/**
 * Pure tenant-scope helpers for industrial org lookups created during onboarding.
 * Callers must always pass the session tenant id — never a foreign tenant.
 */

export type OrgLookupScopeFilter = {
  tenantId: string;
};

/** Build the tenant equality filter used when reading/writing org lookups. */
export function orgLookupTenantFilter(tenantId: string): OrgLookupScopeFilter {
  if (!tenantId || typeof tenantId !== "string") {
    throw new Error("tenantId is required for org lookup scope");
  }
  return { tenantId };
}

/** True when two tenant ids produce distinct lookup scopes (no shared filter). */
export function orgLookupScopesAreIsolated(tenantA: string, tenantB: string): boolean {
  const a = orgLookupTenantFilter(tenantA);
  const b = orgLookupTenantFilter(tenantB);
  return a.tenantId !== b.tenantId;
}
