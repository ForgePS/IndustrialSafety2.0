import type { ForgePrincipal } from "@forge/tenant-context";

export type AuthProfileRole = {
  roleCode: string;
  roleName: string;
};

export type AuthProfile = {
  userId: string;
  tenantId: string;
  username: string | null;
  accountEmail: string;
  status: string;
  lastLoginAt: string | null;
  personId: string | null;
  personnelId: string | null;
  /** Linked industrial personnel signature (data URL or https), when on file. */
  signatureUrl: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  preferredName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  recordVersion: number;
  roles: AuthProfileRole[];
  isPlatformAdmin: boolean;
  canEdit: boolean;
};

type PrincipalLike = Pick<
  ForgePrincipal,
  "userId" | "isPlatformAdmin" | "permissions" | "activeProducts"
>;

/**
 * Own profile is always editable by the signed-in user. Privileged operators
 * (Super Admin, Creator, Tenant Admin) may also edit another user's profile.
 */
export function canEditAuthProfile(principal: PrincipalLike, targetUserId: string): boolean {
  if (principal.userId === targetUserId) return true;
  if (principal.isPlatformAdmin) return true;
  if (principal.activeProducts.has("FORGE_CREATOR")) return true;
  if (principal.permissions.has("industrial.admin")) return true;
  if (principal.permissions.has("platform.membership.manage")) return true;
  const industrialManage = [...principal.permissions].filter(
    (code) => code.startsWith("industrial.") && code.endsWith(".manage"),
  ).length;
  return industrialManage >= 4;
}

export function buildAuthProfileDisplayName(input: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
  preferredName?: string | null;
}): string {
  if (input.preferredName?.trim()) return input.preferredName.trim();
  const parts = [input.firstName, input.middleName, input.lastName]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  const base = parts.join(" ");
  const suffix = input.suffix?.trim();
  return suffix ? `${base} ${suffix}`.trim() : base;
}

export function dateOnly(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return text || null;
}
