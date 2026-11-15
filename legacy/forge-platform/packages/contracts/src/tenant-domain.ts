import { z } from "zod";

/**
 * Canonical Forge tenant lifecycle statuses (FORGE-SAAS MK-S1).
 * Do not invent parallel status enums in product modules — import these.
 */
export const TENANT_STATUSES = [
  "PROVISIONING",
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
  "ARCHIVED",
  "CANCELED",
] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** Legacy alias still treated as inactive by authorization. */
export const LEGACY_INACTIVE_TENANT_STATUSES = ["DECOMMISSIONED"] as const;

export function isTenantStatus(value: string): value is TenantStatus {
  return (TENANT_STATUSES as readonly string[]).includes(value);
}

/**
 * Allowed status transitions. Unknown / missing edges are rejected.
 * Terminal states: ARCHIVED, CANCELED.
 */
export const TENANT_STATUS_TRANSITIONS: Record<TenantStatus, readonly TenantStatus[]> = {
  PROVISIONING: ["TRIAL", "ACTIVE", "ARCHIVED", "CANCELED"],
  TRIAL: ["ACTIVE", "SUSPENDED", "ARCHIVED", "CANCELED"],
  ACTIVE: ["SUSPENDED", "ARCHIVED", "CANCELED"],
  SUSPENDED: ["ACTIVE", "TRIAL", "ARCHIVED", "CANCELED"],
  ARCHIVED: [],
  CANCELED: [],
};

export function canTransitionTenantStatus(from: string, to: string): boolean {
  if (!isTenantStatus(from) || !isTenantStatus(to)) {
    return false;
  }
  if (from === to) {
    return true;
  }
  return TENANT_STATUS_TRANSITIONS[from].includes(to);
}

export function assertTenantStatusTransition(from: string, to: string): void {
  if (!isTenantStatus(to)) {
    throw new Error(`Invalid tenant status: ${to}`);
  }
  if (!isTenantStatus(from)) {
    throw new Error(`Invalid current tenant status: ${from}`);
  }
  if (!canTransitionTenantStatus(from, to)) {
    throw new Error(`Cannot transition tenant from ${from} to ${to}`);
  }
}

/** Pure ownership check — caller maps false → FORBIDDEN / VALIDATION_ERROR. */
export function facilityBelongsToTenant(
  facilityTenantId: string,
  expectedTenantId: string,
): boolean {
  return facilityTenantId === expectedTenantId;
}

export const createFacilityInputSchema = z.object({
  facilityKey: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i),
  name: z.string().min(1).max(200),
  facilityType: z.string().min(1).max(64).default("SITE"),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  organizationId: z.string().uuid().optional(),
  addressLine1: z.string().max(300).optional(),
  addressLine2: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  stateProvince: z.string().max(120).optional(),
  postalCode: z.string().max(32).optional(),
  countryCode: z.string().length(2).optional(),
  timezone: z.string().max(64).optional(),
});

export type CreateFacilityInput = z.infer<typeof createFacilityInputSchema>;

export const patchFacilityInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  facilityType: z.string().min(1).max(64).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  organizationId: z.string().uuid().nullable().optional(),
  addressLine1: z.string().max(300).nullable().optional(),
  addressLine2: z.string().max(300).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  stateProvince: z.string().max(120).nullable().optional(),
  postalCode: z.string().max(32).nullable().optional(),
  countryCode: z.string().length(2).nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
});

export type PatchFacilityInput = z.infer<typeof patchFacilityInputSchema>;
