import type { ImportPermissionCode } from "./types.js";
import { IMPORT_PERMISSIONS } from "./types.js";

const ACTION_PERMISSION: Record<string, ImportPermissionCode> = {
  view: "import.view",
  upload: "import.upload",
  map: "import.map",
  validate: "import.validate",
  preview: "import.preview",
  approve: "import.approve",
  execute: "import.execute",
  rollback: "import.rollback",
  profileManage: "import.profile.manage",
  templateManage: "import.template.manage",
  errorReprocess: "import.error.reprocess",
  sensitive: "import.sensitive",
};

export function hasImportPermission(
  held: ReadonlySet<string> | readonly string[],
  code: ImportPermissionCode,
): boolean {
  const set = held instanceof Set ? held : new Set(held);
  return set.has(code);
}

export function assertImportPermission(
  held: ReadonlySet<string> | readonly string[],
  code: ImportPermissionCode,
): void {
  if (!hasImportPermission(held, code)) {
    const error = new Error(`Missing import permission: ${code}`);
    (error as Error & { code: string }).code = "FORBIDDEN";
    throw error;
  }
}

export function importPermissionForAction(
  action: keyof typeof ACTION_PERMISSION,
): ImportPermissionCode {
  return ACTION_PERMISSION[action]!;
}

export function listImportPermissions(): readonly ImportPermissionCode[] {
  return IMPORT_PERMISSIONS;
}

/** Tenant admins must not receive Creator-only platform grantables via import seeding. */
export function tenantAdminImportPermissions(): readonly ImportPermissionCode[] {
  return IMPORT_PERMISSIONS.filter(
    (p) => p !== "import.sensitive" && p !== "import.template.manage",
  );
}
