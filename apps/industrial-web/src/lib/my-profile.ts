/**
 * My Profile edit gate: the signed-in user, Super Admin, Creator, or Tenant Admin.
 */

type AuthLike = {
  userId?: string;
  isPlatformAdmin?: boolean;
  permissions?: readonly string[];
  activeProducts?: readonly string[];
} | null | undefined;

export function canEditMyProfile(me: AuthLike, targetUserId?: string | null): boolean {
  if (!me?.userId) return false;
  if (!targetUserId || me.userId === targetUserId) return true;
  if (me.isPlatformAdmin) return true;
  if ((me.activeProducts ?? []).includes("FORGE_CREATOR")) return true;
  const permissions = new Set(me.permissions ?? []);
  if (permissions.has("industrial.admin")) return true;
  if (permissions.has("platform.membership.manage")) return true;
  const industrialManage = [...permissions].filter(
    (code) => code.startsWith("industrial.") && code.endsWith(".manage"),
  ).length;
  return industrialManage >= 4;
}

export function profileInitials(input: {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  accountEmail?: string | null;
  isPlatformAdmin?: boolean;
  userId?: string;
}): string {
  const first = (input.firstName ?? "").trim();
  const last = (input.lastName ?? "").trim();
  if (first || last) return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || first.slice(0, 2).toUpperCase();
  const display = (input.displayName ?? "").trim();
  if (display) {
    const parts = display.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || display.slice(0, 2).toUpperCase();
  }
  const email = (input.accountEmail ?? "").trim();
  if (email) return email.slice(0, 2).toUpperCase();
  if (input.isPlatformAdmin) return "PA";
  return (input.userId ?? "ME").slice(0, 2).toUpperCase();
}

export function profileWelcomeName(input: {
  preferredName?: string | null;
  firstName?: string | null;
  displayName?: string | null;
}): string | null {
  const preferred = (input.preferredName ?? "").trim();
  if (preferred) return preferred.split(/\s+/)[0] ?? preferred;
  const first = (input.firstName ?? "").trim();
  if (first) return first;
  const display = (input.displayName ?? "").trim();
  if (display) return display.split(/\s+/)[0] ?? display;
  return null;
}
