/**
 * Membership status domain (FORGE-SAAS MK-S3).
 * Canonical storage statuses remain ADR-021 values — no schema rename.
 */

export const MEMBERSHIP_STATUSES = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "EXPIRED",
  "REVOKED",
  "ARCHIVED",
] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/**
 * SaaS vocabulary → Forge storage status.
 * pending → PENDING
 * active → ACTIVE
 * inactive → SUSPENDED
 * removed → REVOKED
 */
export const SAAS_MEMBERSHIP_STATUS_ALIASES = {
  pending: "PENDING",
  active: "ACTIVE",
  inactive: "SUSPENDED",
  removed: "REVOKED",
} as const satisfies Record<string, MembershipStatus>;

export type SaasMembershipStatusAlias = keyof typeof SAAS_MEMBERSHIP_STATUS_ALIASES;

export function isMembershipStatus(value: string): value is MembershipStatus {
  return (MEMBERSHIP_STATUSES as readonly string[]).includes(value);
}

export function resolveMembershipStatusAlias(value: string): MembershipStatus | null {
  const normalized = value.trim().toLowerCase();
  if (normalized in SAAS_MEMBERSHIP_STATUS_ALIASES) {
    return SAAS_MEMBERSHIP_STATUS_ALIASES[normalized as SaasMembershipStatusAlias];
  }
  const upper = value.trim().toUpperCase();
  return isMembershipStatus(upper) ? upper : null;
}

/** Only ACTIVE memberships may select / bind a tenant session. */
export function isMembershipStatusActive(status: string): boolean {
  return status === "ACTIVE";
}

export function membershipStatusBlocksTenantSelection(status: string): boolean {
  return !isMembershipStatusActive(status);
}
