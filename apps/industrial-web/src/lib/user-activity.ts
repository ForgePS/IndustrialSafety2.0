/**
 * Settings → User activity: login times and last platform activity.
 * Visible to Admin, Super Admin, and Creator (same gate as User management).
 */

import { canAccessUserManagement, type DirectoryUser } from "@/lib/user-management";
import { matchesSearchTokens } from "@/lib/search-text";

export { canAccessUserManagement as canAccessUserActivity };

export type UserActivityRow = {
  userId: string;
  membershipId: string;
  displayName: string;
  email: string;
  membershipStatus: string;
  roles: string[];
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  online: boolean;
};

/** Presence window aligned with messaging online indicators. */
export const USER_ACTIVITY_ONLINE_MS = 3 * 60 * 1000;

export function isUserOnlineFromActivity(
  lastActivityAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!lastActivityAt) return false;
  const ts = Date.parse(lastActivityAt);
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts <= USER_ACTIVITY_ONLINE_MS;
}

export function formatActivityTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatActivityRelative(
  value: string | null | undefined,
  nowMs = Date.now(),
): string {
  if (!value) return "Never";
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return "Never";
  const deltaSec = Math.round((nowMs - ts) / 1000);
  if (deltaSec < 45) return "Just now";
  if (deltaSec < 3600) {
    const mins = Math.max(1, Math.round(deltaSec / 60));
    return `${mins} min ago`;
  }
  if (deltaSec < 86400) {
    const hours = Math.max(1, Math.round(deltaSec / 3600));
    return `${hours} hr ago`;
  }
  const days = Math.max(1, Math.round(deltaSec / 86400));
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatActivityTimestamp(value);
}

/** Turn audit action codes into readable labels. */
export function formatAuditActionLabel(action: string | null | undefined): string {
  const raw = String(action ?? "").trim();
  if (!raw) return "Activity";
  const known: Record<string, string> = {
    "invitation.create": "Invited a user",
    "invitation.revoke": "Revoked an invitation",
    "membership.revoke": "Removed a member",
    "membership.roles.set": "Changed member roles",
    "membership.suspend": "Suspended a member",
    "membership.activate": "Activated a member",
    "config.publish": "Published configuration",
    "config.update": "Updated configuration",
    "audit.export.generated": "Exported the audit log",
    "password.reset.request": "Requested a password reset",
  };
  if (known[raw]) return known[raw];
  return raw
    .split(/[._]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function toUserActivityRow(
  user: DirectoryUser,
  lastActivityAt: string | null,
  nowMs = Date.now(),
): UserActivityRow {
  return {
    userId: user.userId,
    membershipId: user.membershipId,
    displayName: user.displayName,
    email: user.email,
    membershipStatus: user.membershipStatus,
    roles: user.roles.map((role) => role.roleName || role.roleCode).filter(Boolean),
    lastLoginAt: user.lastLoginAt,
    lastActivityAt,
    online: isUserOnlineFromActivity(lastActivityAt, nowMs),
  };
}

export function sortUserActivityRows(rows: UserActivityRow[]): UserActivityRow[] {
  return [...rows].sort((a, b) => {
    const aTs = Date.parse(a.lastActivityAt ?? a.lastLoginAt ?? "") || 0;
    const bTs = Date.parse(b.lastActivityAt ?? b.lastLoginAt ?? "") || 0;
    if (bTs !== aTs) return bTs - aTs;
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  });
}

export function filterUserActivityRows(
  rows: readonly UserActivityRow[],
  query: string,
): UserActivityRow[] {
  const q = query.trim();
  if (!q) return [...rows];
  return rows.filter((row) =>
    matchesSearchTokens(
      [row.displayName, row.email, row.roles.join(" "), row.membershipStatus],
      q,
    ),
  );
}

export type MembershipActivitySource = {
  id?: string;
  userId?: string;
  lastLoginAt?: string | Date | null;
  lastActivityAt?: string | Date | null;
};

export function activityByUserId(
  memberships: readonly MembershipActivitySource[],
): Map<string, { lastLoginAt: string | null; lastActivityAt: string | null }> {
  const map = new Map<string, { lastLoginAt: string | null; lastActivityAt: string | null }>();
  for (const row of memberships) {
    const userId = typeof row.userId === "string" ? row.userId.trim() : "";
    if (!userId) continue;
    map.set(userId, {
      lastLoginAt: row.lastLoginAt ? String(row.lastLoginAt) : null,
      lastActivityAt: row.lastActivityAt ? String(row.lastActivityAt) : null,
    });
  }
  return map;
}
