import type { ImportPermission } from "./types.js";

export type PermissionChecker = (code: string) => boolean;

export function canViewImports(hasPermission: PermissionChecker): boolean {
  return hasPermission("import.view");
}

export function actionAllowed(
  hasPermission: PermissionChecker,
  permission: ImportPermission,
): boolean {
  return hasPermission(permission);
}

export function disabledReason(
  hasPermission: PermissionChecker,
  permission: ImportPermission,
  contextBlocked?: string | null,
): string | null {
  if (contextBlocked) return contextBlocked;
  if (!hasPermission(permission)) {
    return `Requires permission ${permission}.`;
  }
  return null;
}

export const IMPORT_PERMISSION_MATRIX: ReadonlyArray<{
  permission: ImportPermission;
  controls: string;
}> = [
  { permission: "import.view", controls: "Dashboard, job detail, status, results (masked)" },
  { permission: "import.upload", controls: "New import, upload, abort upload" },
  { permission: "import.map", controls: "Mapping workspace, put mappings" },
  { permission: "import.validate", controls: "Validation request, rescan" },
  { permission: "import.preview", controls: "Preview request and table" },
  { permission: "import.approve", controls: "Submit for approval, approve, reject" },
  { permission: "import.execute", controls: "Execute, cancel execution" },
  { permission: "import.rollback", controls: "Rollback request" },
  { permission: "import.profile.manage", controls: "Create/archive profiles" },
  { permission: "import.template.manage", controls: "Template management" },
  { permission: "import.error.reprocess", controls: "Eligible row error retry" },
  {
    permission: "import.sensitive",
    controls: "Privileged download request (server still masks secrets)",
  },
];
