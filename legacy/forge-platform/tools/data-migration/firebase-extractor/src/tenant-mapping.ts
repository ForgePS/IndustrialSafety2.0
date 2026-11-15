/** Tenant key classification for extraction metadata (no auto-normalization of aliases). */

export type TenantClass =
  "CUSTOMER" | "PLATFORM_DEFAULT" | "GLOBAL_TEMPLATE" | "LEGACY_ALIAS" | "UNKNOWN";

export type TenantMapping = {
  sourceTenantKey: string;
  classification: TenantClass;
  canonicalTenantKey: string | null;
  notes: string;
};

export const TENANT_MAPPINGS: Record<string, TenantMapping> = {
  "business-1782553339499": {
    sourceTenantKey: "business-1782553339499",
    classification: "CUSTOMER",
    canonicalTenantKey: "business-1782553339499",
    notes:
      "Primary Producers customer business; organizations/{id} and platformBusinesses/{id} match",
  },
  "business-forge-default": {
    sourceTenantKey: "business-forge-default",
    classification: "PLATFORM_DEFAULT",
    canonicalTenantKey: "business-forge-default",
    notes: "Platform default business registry entry",
  },
  GLOBAL: {
    sourceTenantKey: "GLOBAL",
    classification: "GLOBAL_TEMPLATE",
    canonicalTenantKey: null,
    notes: "Forge default EHS templates (isForgeDefault/allowTenantCopy); not a customer tenant",
  },
  "Producers Rice Mill": {
    sourceTenantKey: "Producers Rice Mill",
    classification: "LEGACY_ALIAS",
    canonicalTenantKey: null,
    notes:
      "Display-name string observed as businessId in DM-S0 auth_audit_logs scan; not a canonical organizations doc id. Do not auto-map without manual approval.",
  },
};

export function classifySourceTenantKey(raw: string | null | undefined): TenantMapping {
  if (!raw) {
    return {
      sourceTenantKey: "",
      classification: "UNKNOWN",
      canonicalTenantKey: null,
      notes: "Missing tenant key",
    };
  }
  const known = TENANT_MAPPINGS[raw];
  if (known) return known;
  if (raw.startsWith("business-")) {
    return {
      sourceTenantKey: raw,
      classification: "UNKNOWN",
      canonicalTenantKey: raw,
      notes: "business-* pattern but not in approved mapping table",
    };
  }
  return {
    sourceTenantKey: raw,
    classification: "LEGACY_ALIAS",
    canonicalTenantKey: null,
    notes: "Non-canonical tenant key string",
  };
}

export function pickSourceTenantKey(data: Record<string, unknown>): string | null {
  for (const key of ["businessId", "organizationId", "companyId", "tenantId"] as const) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}
