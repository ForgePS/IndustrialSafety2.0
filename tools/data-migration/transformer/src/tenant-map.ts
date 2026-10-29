/**
 * Tenant resolution for customer migration.
 * One authoritative AWS tenant for Producers customer records.
 */

export type TenantClass =
  "CUSTOMER" | "PLATFORM_DEFAULT" | "GLOBAL_TEMPLATE" | "LEGACY_ALIAS" | "UNKNOWN";

export type AwsTenantBinding = {
  sourceTenantKey: string;
  classification: TenantClass;
  awsTenantId: string | null;
  awsTenantKey: string | null;
  notes: string;
};

/** Production twin for Producers Rice Mill (IND-11 / DM-S1). */
export const AUTHORITATIVE_CUSTOMER_AWS_TENANT = {
  awsTenantId: "5da680d3-50f5-46ac-8b85-6cf454b6a0da",
  awsTenantKey: "producers-rice-mill",
  sourceBusinessId: "business-1782553339499",
} as const;

/**
 * Approved legacy alias remap for transform (explicit DM-S2 policy).
 * Display-name strings that mean the customer tenant — never invent new aliases here.
 */
export const APPROVED_LEGACY_ALIAS_TO_CUSTOMER: Record<string, string> = {
  "Producers Rice Mill": "business-1782553339499",
};

export const TENANT_BINDINGS: Record<string, AwsTenantBinding> = {
  "business-1782553339499": {
    sourceTenantKey: "business-1782553339499",
    classification: "CUSTOMER",
    awsTenantId: AUTHORITATIVE_CUSTOMER_AWS_TENANT.awsTenantId,
    awsTenantKey: AUTHORITATIVE_CUSTOMER_AWS_TENANT.awsTenantKey,
    notes: "Primary customer → production twin tenants.id",
  },
  "business-forge-default": {
    sourceTenantKey: "business-forge-default",
    classification: "PLATFORM_DEFAULT",
    awsTenantId: null,
    awsTenantKey: "platform-default",
    notes: "Platform default — not customer import",
  },
  GLOBAL: {
    sourceTenantKey: "GLOBAL",
    classification: "GLOBAL_TEMPLATE",
    awsTenantId: null,
    awsTenantKey: "GLOBAL",
    notes: "Platform EHS templates",
  },
  "Producers Rice Mill": {
    sourceTenantKey: "Producers Rice Mill",
    classification: "LEGACY_ALIAS",
    awsTenantId: AUTHORITATIVE_CUSTOMER_AWS_TENANT.awsTenantId,
    awsTenantKey: AUTHORITATIVE_CUSTOMER_AWS_TENANT.awsTenantKey,
    notes: "DM-S2 approved legacy alias → same AWS customer tenant (idempotent)",
  },
};

export function resolveAwsTenant(sourceTenantKey: string | null | undefined): {
  binding: AwsTenantBinding | null;
  resolvedSourceKey: string | null;
  unknown: boolean;
} {
  if (!sourceTenantKey) {
    return { binding: null, resolvedSourceKey: null, unknown: true };
  }
  const viaAlias = APPROVED_LEGACY_ALIAS_TO_CUSTOMER[sourceTenantKey] ?? sourceTenantKey;
  const binding = TENANT_BINDINGS[viaAlias] ?? TENANT_BINDINGS[sourceTenantKey] ?? null;
  if (!binding) {
    return {
      binding: {
        sourceTenantKey,
        classification: "UNKNOWN",
        awsTenantId: null,
        awsTenantKey: null,
        notes: "Not in approved tenant map",
      },
      resolvedSourceKey: sourceTenantKey,
      unknown: true,
    };
  }
  return { binding, resolvedSourceKey: viaAlias, unknown: false };
}

export function isCustomerImportTenant(binding: AwsTenantBinding | null): boolean {
  return binding?.classification === "CUSTOMER" || binding?.classification === "LEGACY_ALIAS";
}
