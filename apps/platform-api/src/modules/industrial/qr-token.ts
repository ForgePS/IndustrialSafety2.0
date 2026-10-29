import { createHash, randomBytes } from "node:crypto";

export const QR_LINK_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "REPLACED",
  "LOST",
  "DAMAGED",
  "ARCHIVED",
] as const;

export type QrLinkStatus = (typeof QR_LINK_STATUSES)[number];

export const QR_ACCESS_MODES = [
  "AUTHENTICATED_ONLY",
  "AUTHENTICATED_RECORD",
  "PUBLIC_READ",
  "PUBLIC_ACTION",
  "PUBLIC_LIMITED",
  "PUBLIC_FORM_ONLY",
  "EMPLOYEE_NUMBER",
] as const;

export type QrAccessMode = (typeof QR_ACCESS_MODES)[number];

export const QR_AUDIT_EVENT_TYPES = [
  "CREATED",
  "UPDATED",
  "TOKEN_ISSUED",
  "TOKEN_REVOKED",
  "REPLACED",
  "DEACTIVATED",
  "REACTIVATED",
  "SCAN_RECORDED",
  "ACCESS_MODE_CHANGED",
  "ACTION_CONFIGURATION_CHANGED",
  "ASSIGNED",
  "PRINTED",
] as const;

export type QrAuditEventType = (typeof QR_AUDIT_EVENT_TYPES)[number];

/** Accept RFC 4122/9562 UUIDs including Forge createId() UUIDv7 values. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hashPublicToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generatePublicToken(): string {
  return randomBytes(24).toString("base64url");
}

export function isValidPublicToken(token: string): boolean {
  const raw = String(token ?? "").trim();
  return raw.length >= 16 && raw.length <= 256;
}

export function assertQrLinkStatus(status: string): QrLinkStatus {
  const normalized = String(status ?? "")
    .trim()
    .toUpperCase();
  if (!QR_LINK_STATUSES.includes(normalized as QrLinkStatus)) {
    throw new Error(`Invalid QR link status: ${status}`);
  }
  return normalized as QrLinkStatus;
}

export function normalizeQrAccessMode(mode: string | undefined | null): QrAccessMode {
  const normalized = String(mode ?? "AUTHENTICATED_ONLY")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
  if (QR_ACCESS_MODES.includes(normalized as QrAccessMode)) {
    return normalized as QrAccessMode;
  }
  if (normalized === "AUTHENTICATED") return "AUTHENTICATED_ONLY";
  return "AUTHENTICATED_ONLY";
}

/** Targets that must stay publicly scannable (no employee / sign-in gate). */
export function isPublicRequiredQrTarget(targetType: string | null | undefined): boolean {
  const type = String(targetType ?? "")
    .trim()
    .toUpperCase();
  return type === "LOTO_PROCEDURE" || type === "VEHICLE";
}

export function isPublicQrAccessMode(mode: string | null | undefined): boolean {
  const accessMode = normalizeQrAccessMode(mode);
  return (
    accessMode === "PUBLIC_READ" ||
    accessMode === "PUBLIC_LIMITED" ||
    accessMode === "PUBLIC_FORM_ONLY" ||
    accessMode === "PUBLIC_ACTION"
  );
}

/**
 * LOTO procedures and fleet vehicle check stickers are always PUBLIC_ACTION;
 * the Emergency SMS signup code is always PUBLIC_FORM_ONLY.
 * Callers may request another mode; the server still forces public for these targets.
 */
export function resolveQrAccessModeForTarget(
  targetType: string | null | undefined,
  requestedMode: string | null | undefined,
): QrAccessMode {
  if (
    String(targetType ?? "")
      .trim()
      .toUpperCase() === "EMERGENCY_SMS_SIGNUP"
  )
    return "PUBLIC_FORM_ONLY";
  if (isPublicRequiredQrTarget(targetType)) return "PUBLIC_ACTION";
  return normalizeQrAccessMode(requestedMode);
}

export function parseOptionalUuid(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!UUID_RE.test(raw)) return null;
  return raw.toLowerCase();
}

export function assertUuid(value: unknown, label: string): string {
  const parsed = parseOptionalUuid(value);
  if (!parsed) throw new Error(`${label} must be a valid UUID`);
  return parsed;
}

export function publicTokenHint(tokenHash: string | null | undefined): string | null {
  if (!tokenHash?.trim()) return null;
  return `${tokenHash.slice(0, 8)}…`;
}

export function generateDisplayCode(): string {
  return `QR-${randomBytes(3).toString("hex").toUpperCase()}`;
}
