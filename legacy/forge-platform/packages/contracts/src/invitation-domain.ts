/**
 * Invitation status domain (FORGE-SAAS MK-S6).
 * Canonical storage statuses remain ADR-020 values — no schema rename.
 */

export const INVITATION_STORAGE_STATUSES = [
  "DRAFT",
  "PENDING",
  "SENT",
  "ACCEPTED",
  "EXPIRED",
  "REVOKED",
  "FAILED",
] as const;

export type InvitationStorageStatus = (typeof INVITATION_STORAGE_STATUSES)[number];

/**
 * SaaS vocabulary → Forge storage status (primary mapping).
 * pending → PENDING (also covers SENT/DRAFT when listing “open” invites)
 * accepted → ACCEPTED
 * expired → EXPIRED
 * revoked → REVOKED
 */
export const SAAS_INVITATION_STATUS_ALIASES = {
  pending: "PENDING",
  accepted: "ACCEPTED",
  expired: "EXPIRED",
  revoked: "REVOKED",
} as const satisfies Record<string, InvitationStorageStatus>;

export type SaasInvitationStatusAlias = keyof typeof SAAS_INVITATION_STATUS_ALIASES;

export const TERMINAL_INVITATION_STORAGE_STATUSES = [
  "ACCEPTED",
  "EXPIRED",
  "REVOKED",
  "FAILED",
] as const satisfies readonly InvitationStorageStatus[];

export const ACTIVE_INVITATION_STORAGE_STATUSES = [
  "DRAFT",
  "PENDING",
  "SENT",
] as const satisfies readonly InvitationStorageStatus[];

export function isInvitationStorageStatus(value: string): value is InvitationStorageStatus {
  return (INVITATION_STORAGE_STATUSES as readonly string[]).includes(value);
}

export function resolveInvitationStatusAlias(value: string): InvitationStorageStatus | null {
  const normalized = value.trim().toLowerCase();
  if (normalized in SAAS_INVITATION_STATUS_ALIASES) {
    return SAAS_INVITATION_STATUS_ALIASES[normalized as SaasInvitationStatusAlias];
  }
  const upper = value.trim().toUpperCase();
  return isInvitationStorageStatus(upper) ? upper : null;
}

export function isTerminalInvitationStatus(status: string): boolean {
  return (TERMINAL_INVITATION_STORAGE_STATUSES as readonly string[]).includes(status);
}

export function isActiveInvitationStatus(status: string): boolean {
  return (ACTIVE_INVITATION_STORAGE_STATUSES as readonly string[]).includes(status);
}

/** Open SaaS “pending” invitations include DRAFT / PENDING / SENT. */
export function invitationStatusesForSaasPending(): readonly InvitationStorageStatus[] {
  return ACTIVE_INVITATION_STORAGE_STATUSES;
}

export function emailsMatchForInvitationAccept(inviteEmail: string, acceptEmail: string): boolean {
  return inviteEmail.trim().toLowerCase() === acceptEmail.trim().toLowerCase();
}

/** Default resend expiry extension (hours), aligned with createInvitation default. */
export const INVITATION_RESEND_EXTEND_HOURS = 168;
