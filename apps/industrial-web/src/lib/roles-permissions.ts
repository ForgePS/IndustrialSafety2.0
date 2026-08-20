/**
 * Settings → Roles and Permissions. Same Admin / Super Admin / Creator gate
 * as user management. Permissions are the platform catalog; roles are tenant-owned.
 */

import { matchesSearchTokens, matchesSearchTokensAnywhere } from "@/lib/search-text";
import { canAccessUserManagement } from "@/lib/user-management";

export const ROLES_PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_ROLES_PAGE_SIZE = 10;

export type CatalogPermission = {
  id?: string;
  code: string;
  name?: string | null;
  description?: string | null;
  riskLevel?: string | null;
  createdAt?: string | Date | null;
};

export type RolePermission = {
  code: string;
  name?: string | null;
  effect?: string | null;
};

export type TenantRole = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status?: string | null;
  isSystemManaged?: boolean;
  createdAt?: string | Date | null;
  recordVersion?: number;
  permissions?: RolePermission[];
};

export type RoleChip = {
  id: string;
  code: string;
  name: string;
  tone: "primary" | "warning" | "success" | "info" | "danger" | "secondary";
};

export type PermissionDirectoryRow = {
  code: string;
  name: string;
  createdAt: string | null;
  assignedRoles: RoleChip[];
};

type AuthLike = {
  isPlatformAdmin?: boolean;
  permissions?: readonly string[];
  activeProducts?: readonly string[];
} | null | undefined;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function canAccessRolesAndPermissions(me: AuthLike): boolean {
  return canAccessUserManagement(me);
}

export function canAssignRoles(me: AuthLike): boolean {
  if (!me) return false;
  if (me.isPlatformAdmin) return true;
  return (me.permissions ?? []).includes("platform.role.assign");
}

export function roleChipTone(roleCode: string, roleName = ""): RoleChip["tone"] {
  const hay = `${roleCode} ${roleName}`.toUpperCase();
  if (/(ADMIN|CREATOR|SUPER|OWNER)/.test(hay)) return "primary";
  if (/(MANAGER|SUPERVISOR)/.test(hay)) return "warning";
  if (/SUPPORT/.test(hay)) return "info";
  if (/(RESTRICT|VIEW_ONLY|READONLY)/.test(hay)) return "danger";
  if (/(OPERATOR|EMPLOYEE|USER|MEMBER|STANDARD)/.test(hay)) return "success";
  return "secondary";
}

export function roleCodeFromName(name: string): string {
  const code = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (code === "") return "CUSTOM_ROLE";
  return /^[A-Z]/.test(code) ? code : `ROLE_${code}`;
}

export function formatPermissionDate(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function permissionDisplayName(permission: {
  code?: string | null | undefined;
  name?: string | null | undefined;
}): string {
  const name = str(permission.name);
  if (name !== "" && name !== str(permission.code)) return name;
  return str(permission.code).replaceAll(".", " · ") || "Permission";
}

export function toTenantRoles(rows: readonly unknown[]): TenantRole[] {
  const roles: TenantRole[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as TenantRole;
    const id = str(record.id);
    const code = str(record.code);
    if (id === "" || code === "") continue;
    roles.push({
      ...record,
      id,
      code,
      name: str(record.name) || code,
      permissions: Array.isArray(record.permissions)
        ? record.permissions.filter((perm) => str(perm.code) !== "")
        : [],
    });
  }
  return roles;
}

export function toPermissionDirectory(
  roles: readonly TenantRole[],
  catalog: readonly CatalogPermission[] = [],
): PermissionDirectoryRow[] {
  const catalogByCode = new Map(
    catalog.filter((row) => str(row.code) !== "").map((row) => [row.code, row]),
  );
  const rows = new Map<string, PermissionDirectoryRow>();

  function ensure(code: string): PermissionDirectoryRow {
    const existing = rows.get(code);
    if (existing) return existing;
    const catalogRow = catalogByCode.get(code);
    const created: PermissionDirectoryRow = {
      code,
      name: permissionDisplayName({ code, name: catalogRow?.name }),
      createdAt: catalogRow?.createdAt ? String(catalogRow.createdAt) : null,
      assignedRoles: [],
    };
    rows.set(code, created);
    return created;
  }

  for (const role of roles) {
    for (const perm of role.permissions ?? []) {
      if (str(perm.effect).toUpperCase() === "DENY") continue;
      const row = ensure(perm.code);
      if (!row.assignedRoles.some((chip) => chip.id === role.id)) {
        row.assignedRoles.push({
          id: role.id,
          code: role.code,
          name: role.name,
          tone: roleChipTone(role.code, role.name),
        });
      }
    }
  }

  for (const permission of catalog) {
    if (!str(permission.code).startsWith("industrial.")) continue;
    ensure(permission.code);
  }

  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function matchesPermissionQuery(
  row: PermissionDirectoryRow,
  query: string,
  anywhere = false,
): boolean {
  const haystack = [
    row.name,
    row.code,
    ...row.assignedRoles.map((role) => role.name),
    ...row.assignedRoles.map((role) => role.code),
  ];
  return anywhere
    ? matchesSearchTokensAnywhere(haystack, query)
    : matchesSearchTokens(haystack, query);
}

export function filterPermissionDirectory(
  rows: readonly PermissionDirectoryRow[],
  query: string,
): PermissionDirectoryRow[] {
  const trimmed = query.trim();
  if (trimmed === "") return [...rows];
  const strict = rows.filter((row) => matchesPermissionQuery(row, trimmed));
  return strict.length > 0
    ? strict
    : rows.filter((row) => matchesPermissionQuery(row, trimmed, true));
}

export function paginateRows<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): { items: T[]; page: number; pageCount: number; from: number; to: number } {
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * size;
  const items = rows.slice(start, start + size);
  return {
    items,
    page: current,
    pageCount,
    from: rows.length === 0 ? 0 : start + 1,
    to: start + items.length,
  };
}

export function assignablePermissionCodes(
  catalog: readonly CatalogPermission[],
  me: AuthLike,
): CatalogPermission[] {
  if (!me) return [];
  if (me.isPlatformAdmin) return [...catalog];
  const held = new Set(me.permissions ?? []);
  return catalog.filter((row) => held.has(row.code));
}
