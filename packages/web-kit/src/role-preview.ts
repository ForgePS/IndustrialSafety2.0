import type { AuthMe } from "./auth-api.js";

/** sessionStorage key for Creator "view platform as role" overlay. */
export const ROLE_PREVIEW_STORAGE_KEY = "forge.auth.rolePreview";

export type RolePreviewState = {
  tenantId: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  permissionCodes: string[];
  startedAt: string;
};

function isRolePreviewState(value: unknown): value is RolePreviewState {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.tenantId === "string" &&
    typeof row.roleId === "string" &&
    typeof row.roleCode === "string" &&
    typeof row.roleName === "string" &&
    Array.isArray(row.permissionCodes) &&
    row.permissionCodes.every((code) => typeof code === "string") &&
    typeof row.startedAt === "string"
  );
}

export function readRolePreview(): RolePreviewState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ROLE_PREVIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRolePreviewState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeRolePreview(state: RolePreviewState): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ROLE_PREVIEW_STORAGE_KEY, JSON.stringify(state));
}

export function clearRolePreview(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ROLE_PREVIEW_STORAGE_KEY);
}

/** Overlay used by AuthProvider so UI gates match the selected role (API still uses real session). */
export function applyRolePreviewToMe(me: AuthMe, preview: RolePreviewState): AuthMe {
  return {
    ...me,
    isPlatformAdmin: false,
    permissions: [...preview.permissionCodes],
    accessMode: "MEMBER",
  };
}

/** Prefer ALLOW codes; DENY wins when both appear for the same code. */
export function permissionCodesFromRolePermissions(
  permissions: ReadonlyArray<{ code?: string | null; effect?: string | null }> | null | undefined,
): string[] {
  const allow = new Set<string>();
  const deny = new Set<string>();
  for (const row of permissions ?? []) {
    const code = typeof row.code === "string" ? row.code.trim() : "";
    if (!code) continue;
    const effect = String(row.effect ?? "ALLOW")
      .trim()
      .toUpperCase();
    if (effect === "DENY") deny.add(code);
    else allow.add(code);
  }
  return [...allow].filter((code) => !deny.has(code)).sort();
}
