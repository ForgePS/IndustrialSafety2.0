/**
 * Settings → User management: Admin, Super Admin, and Creator only.
 * Authorize on existing Forge permissions (ADR-015), not display-name checks.
 */

import { matchesSearchTokens, matchesSearchTokensAnywhere } from "@/lib/search-text";
import { rosterInitials } from "@/lib/personnel-directory";

export const USER_MANAGEMENT_PAGE_SIZES = [7, 10, 25, 50] as const;
export const DEFAULT_USER_PAGE_SIZE = 7;

const AVATAR_TONES = [
  "primary",
  "success",
  "info",
  "warning",
  "danger",
  "secondary",
] as const;

export type UserManagementRole = {
  roleCode: string;
  roleName: string;
};

export type TenantRoleOption = {
  code: string;
  name: string;
  status?: string;
};

export type PlatformMembershipRow = {
  id: string;
  tenantId?: string;
  userId: string;
  status: string;
  userStatus?: string | null;
  email?: string | null;
  username?: string | null;
  personId?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  lastLoginAt?: string | Date | null;
  recordVersion?: number;
  roles?: UserManagementRole[];
};

export type PlatformUserRow = {
  id: string;
  primaryEmail?: string | null;
  username?: string | null;
  personId?: string | null;
  status?: string | null;
  lastLoginAt?: string | Date | null;
  recordVersion?: number;
};

export type DirectoryUser = {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  username: string;
  personId: string;
  membershipStatus: string;
  userStatus: string;
  verified: boolean;
  pending: boolean;
  roles: UserManagementRole[];
  lastLoginAt: string | null;
  recordVersion: number;
  initials: string;
  avatarTone: (typeof AVATAR_TONES)[number];
};

export type UserManagementStats = {
  total: number;
  verified: number;
  duplicates: number;
  pending: number;
};

type AuthLike = {
  isPlatformAdmin?: boolean;
  permissions?: readonly string[];
  activeProducts?: readonly string[];
} | null | undefined;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function emailLocalPart(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local.replace(/[._-]+/g, " ").trim();
}

/**
 * Super Admin (`isPlatformAdmin`), Creator (`FORGE_CREATOR`), and Tenant Admin
 * (`platform.membership.manage` or the industrial admin role). Operators stay out:
 * they are view-only on industrial modules.
 */
export function canAccessUserManagement(me: AuthLike): boolean {
  if (!me) return false;
  if (me.isPlatformAdmin) return true;
  const permissions = new Set(me.permissions ?? []);
  if (permissions.has("platform.membership.manage")) return true;
  if (permissions.has("industrial.admin")) return true;
  if ((me.activeProducts ?? []).includes("FORGE_CREATOR")) return true;
  const industrialManage = [...permissions].filter(
    (code) => code.startsWith("industrial.") && code.endsWith(".manage"),
  ).length;
  return industrialManage >= 4;
}

export function canManageUserManagement(me: AuthLike): boolean {
  if (!me) return false;
  if (me.isPlatformAdmin) return true;
  return (me.permissions ?? []).includes("platform.membership.manage");
}

export function canInviteUsers(me: AuthLike): boolean {
  if (!me) return false;
  if (me.isPlatformAdmin) return true;
  const permissions = new Set(me.permissions ?? []);
  return (
    permissions.has("platform.invitation.manage") || permissions.has("platform.user.invite")
  );
}

export function canSendPasswordReset(me: AuthLike): boolean {
  return canInviteUsers(me) || canManageUserManagement(me);
}

export function userDisplayName(row: {
  displayName?: string | null | undefined;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  username?: string | null | undefined;
  email?: string | null | undefined;
}): string {
  const fromPerson = [str(row.firstName), str(row.lastName)].filter(Boolean).join(" ");
  const fromEmail = emailLocalPart(str(row.email));
  return str(row.displayName) || fromPerson || str(row.username) || fromEmail || "User";
}

export function isVerifiedUser(row: {
  userStatus?: string | null;
  status?: string | null;
  membershipStatus?: string | null;
}): boolean {
  const membership = str(row.membershipStatus || row.status).toUpperCase();
  const user = str(row.userStatus).toUpperCase();
  return membership === "ACTIVE" && (user === "ACTIVE" || user === "");
}

export function isPendingUser(row: {
  userStatus?: string | null;
  status?: string | null;
  membershipStatus?: string | null;
}): boolean {
  const membership = str(row.membershipStatus || row.status).toUpperCase();
  const user = str(row.userStatus).toUpperCase();
  return (
    membership === "PENDING" ||
    user === "INVITED" ||
    user === "PENDING" ||
    membership === ""
  );
}

export function toDirectoryUser(
  membership: PlatformMembershipRow,
  user?: PlatformUserRow | null,
  index = 0,
): DirectoryUser | null {
  const membershipId = str(membership.id);
  const userId = str(membership.userId);
  if (membershipId === "" || userId === "") return null;

  const email = str(membership.email) || str(user?.primaryEmail);
  const displayName = userDisplayName({
    displayName: membership.displayName ?? null,
    firstName: membership.firstName ?? null,
    lastName: membership.lastName ?? null,
    username: membership.username || user?.username || null,
    email,
  });
  const membershipStatus = str(membership.status) || "PENDING";
  const userStatus = str(membership.userStatus) || str(user?.status);
  const roles = Array.isArray(membership.roles)
    ? membership.roles.filter((role) => str(role.roleCode) !== "")
    : [];

  return {
    membershipId,
    userId,
    email,
    displayName,
    firstName: str(membership.firstName),
    lastName: str(membership.lastName),
    username: str(membership.username) || str(user?.username),
    personId: str(membership.personId) || str(user?.personId),
    membershipStatus,
    userStatus,
    verified: isVerifiedUser({ userStatus, membershipStatus }),
    pending: isPendingUser({ userStatus, membershipStatus }),
    roles,
    lastLoginAt: membership.lastLoginAt
      ? String(membership.lastLoginAt)
      : user?.lastLoginAt
        ? String(user.lastLoginAt)
        : null,
    recordVersion:
      typeof membership.recordVersion === "number"
        ? membership.recordVersion
        : typeof user?.recordVersion === "number"
          ? user.recordVersion
          : 1,
    initials: rosterInitials(displayName),
    avatarTone: AVATAR_TONES[index % AVATAR_TONES.length]!,
  };
}

export function toDirectoryUsers(
  memberships: readonly unknown[],
  users: readonly unknown[] = [],
): DirectoryUser[] {
  const usersById = new Map<string, PlatformUserRow>();
  for (const row of users) {
    if (typeof row !== "object" || row === null) continue;
    const user = row as PlatformUserRow;
    if (str(user.id) !== "") usersById.set(user.id, user);
  }

  const directory: DirectoryUser[] = [];
  memberships.forEach((row, index) => {
    if (typeof row !== "object" || row === null) return;
    const membership = row as PlatformMembershipRow;
    const mapped = toDirectoryUser(membership, usersById.get(str(membership.userId)), index);
    if (mapped) directory.push(mapped);
  });
  return directory;
}

export function userManagementStats(users: readonly DirectoryUser[]): UserManagementStats {
  const total = users.length;
  const verified = users.filter((row) => row.verified).length;
  const pending = users.filter((row) => row.pending).length;
  const emails = users.map((row) => row.email.toLowerCase()).filter((email) => email !== "");
  const duplicates = Math.max(0, emails.length - new Set(emails).size);
  return { total, verified, duplicates, pending };
}

export function matchesUserQuery(user: DirectoryUser, query: string, anywhere = false): boolean {
  const haystack = [
    user.displayName,
    user.firstName,
    user.lastName,
    user.email,
    user.username,
    user.membershipStatus,
    user.userStatus,
    ...user.roles.map((role) => role.roleName),
    ...user.roles.map((role) => role.roleCode),
  ];
  return anywhere
    ? matchesSearchTokensAnywhere(haystack, query)
    : matchesSearchTokens(haystack, query);
}

export function filterDirectoryUsers(
  users: readonly DirectoryUser[],
  query: string,
): DirectoryUser[] {
  const trimmed = query.trim();
  if (trimmed === "") return [...users];
  const strict = users.filter((user) => matchesUserQuery(user, trimmed));
  return strict.length > 0
    ? strict
    : users.filter((user) => matchesUserQuery(user, trimmed, true));
}

export function paginateDirectoryUsers(
  users: readonly DirectoryUser[],
  page: number,
  pageSize: number,
): { items: DirectoryUser[]; page: number; pageCount: number; from: number; to: number } {
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(users.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * size;
  const items = users.slice(start, start + size);
  return {
    items,
    page: current,
    pageCount,
    from: users.length === 0 ? 0 : start + 1,
    to: start + items.length,
  };
}

export function directoryUsersCsv(users: readonly DirectoryUser[]): string {
  const header = ["ID", "Name", "Email", "Status", "Account", "Verified", "Roles"];
  const rows = users.map((user, index) => [
    String(index + 1),
    user.displayName,
    user.email,
    user.membershipStatus,
    user.userStatus,
    user.verified ? "Yes" : "No",
    user.roles.map((role) => role.roleName || role.roleCode).join("; "),
  ]);
  return [header, ...rows]
    .map((cols) =>
      cols.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");
}

export function inviteRoleOptions(roles: readonly TenantRoleOption[]): TenantRoleOption[] {
  return roles.filter((role) => str(role.status) !== "INACTIVE" && str(role.code) !== "");
}

export function preferredInviteRole(roles: readonly TenantRoleOption[]): string {
  const active = inviteRoleOptions(roles);
  const preferred = [
    "INDUSTRIAL_TENANT_ADMIN",
    "TENANT_ADMIN",
    "INDUSTRIAL_EMPLOYEE",
    "STANDARD_USER",
  ];
  for (const code of preferred) {
    if (active.some((role) => role.code === code)) return code;
  }
  return active[0]?.code ?? "";
}
