/**
 * Maps Industrial module codes to RBAC permission bundles used by Roles & permissions
 * (module picker) and shell navigation.
 */

import { INDUSTRIAL_MODULE_REGISTRY } from "./industrial.js";
import {
  isIndustrialModulePagePermission,
  pagePermissionCodesForModule,
} from "./industrial-module-pages.js";

export type IndustrialModuleRoleAccess = {
  code: string;
  /** Any one grants nav/workspace access (with industrial.access). */
  accessPermissions: readonly string[];
  /** Codes added when the module is checked in the role editor (usually view). */
  defaultGrantPermissions: readonly string[];
};

function access(
  code: string,
  view: string,
  extras: readonly string[] = [],
): IndustrialModuleRoleAccess {
  const accessPermissions = [view, ...extras];
  return {
    code,
    accessPermissions,
    defaultGrantPermissions: [view],
  };
}

/**
 * Modules with dedicated permission codes. CORE / ANALYTICS / IMPORT / system tools
 * without RBAC codes stay access-only (company entitlement + industrial.access).
 */
export const INDUSTRIAL_MODULE_ROLE_ACCESS: readonly IndustrialModuleRoleAccess[] = [
  access("PERSONNEL", "industrial.personnel.view"),
  access("FIRST_AID", "industrial.first_aid.view"),
  access("TRAINING", "industrial.training.view"),
  access("JSAS", "industrial.jsa.view"),
  access("INCIDENTS", "industrial.incidents.view"),
  access("OSHA", "industrial.osha.view"),
  access("WORKERS_COMP", "industrial.workers_comp.view"),
  access("INSPECTIONS", "industrial.inspections.view"),
  access("SANITATION", "industrial.sanitation.view"),
  access("FORMS", "industrial.forms.view"),
  access("OBSERVATIONS", "industrial.observations.view"),
  access("RISK", "industrial.risk.view"),
  access("SCAN", "industrial.scan.view", ["industrial.qr.view", "industrial.qr_links.view"]),
  access("CORRECTIVE_ACTIONS", "industrial.corrective_actions.view"),
  access("DOT_COMPLIANCE", "industrial.dot.view"),
  access("CONTRACTOR_SAFETY", "industrial.contractor_safety.view"),
  access("PROCESS_SAFETY", "industrial.process_safety.view"),
  access("ENVIRONMENTAL_SAFETY", "industrial.environmental_safety.view"),
  access("EQUIPMENT", "industrial.equipment.view"),
  access("FLEET", "industrial.fleet.view"),
  access("SAFETY_SUPPLIES", "industrial.supplies.view"),
  access("FORKLIFTS", "industrial.forklifts.view"),
  access("CRANES_RIGGING", "industrial.cranes_rigging.view"),
  access("MACHINE_SAFETY", "industrial.machine_safety.view"),
  access("ELECTRICAL_SAFETY", "industrial.electrical_safety.view"),
  access("LOCKOUT_TAGOUT", "industrial.loto.view"),
  access("CONFINED_SPACE", "industrial.confined_space.view"),
  access("HOT_WORK", "industrial.hot_work.view"),
  access("WORKING_AT_HEIGHTS", "industrial.working_at_heights.view"),
  access("CHEMICAL_SAFETY", "industrial.chemical_safety.view"),
  access("WAREHOUSE_SAFETY", "industrial.warehouse_safety.view"),
  access("MANUFACTURING_SAFETY", "industrial.manufacturing_safety.view"),
  access("EMERGENCY_ALERTS", "industrial.emergency_alerts.view"),
  access("DOCUMENTS", "industrial.documents.view"),
  access("QR_LINKS", "industrial.qr_links.view", ["industrial.qr.view"]),
  access("REPORTING", "industrial.reporting.view"),
  access("PRINT_MANAGER", "industrial.printer.view", [
    "industrial.printer.print",
    "industrial.printer.quick_print",
  ]),
  access("PRINT_QUEUE", "industrial.printer.view"),
  access("PRINT_HISTORY", "industrial.printer.view"),
] as const;

const BY_CODE = new Map(INDUSTRIAL_MODULE_ROLE_ACCESS.map((row) => [row.code, row]));

export function industrialModuleRoleAccess(
  code: string,
): IndustrialModuleRoleAccess | undefined {
  return BY_CODE.get(code);
}

/** All default-grant codes across modules (for merge/remove when toggling modules). */
export function industrialModuleManagedPermissionCodes(): string[] {
  const out = new Set<string>();
  for (const row of INDUSTRIAL_MODULE_ROLE_ACCESS) {
    for (const code of row.defaultGrantPermissions) out.add(code);
    for (const code of row.accessPermissions) out.add(code);
    for (const code of pagePermissionCodesForModule(row.code)) out.add(code);
  }
  return [...out].sort();
}

export function moduleCodesFromPermissionCodes(
  permissionCodes: readonly string[],
): string[] {
  const perms = new Set(permissionCodes);
  if (perms.has("industrial.admin")) {
    return INDUSTRIAL_MODULE_ROLE_ACCESS.map((row) => row.code);
  }
  return INDUSTRIAL_MODULE_ROLE_ACCESS.filter((row) =>
    row.accessPermissions.some((code) => perms.has(code)),
  ).map((row) => row.code);
}

/**
 * Merge role permission codes after the Admin changes the module checklist.
 * Preserves non-module and manage/fine-grained codes; syncs module default grants.
 * Newly selected modules get all page codes; modules that stay selected keep their
 * existing page customization; deselected modules lose view + page codes.
 */
export function mergePermissionCodesWithModules(input: {
  currentPermissionCodes: readonly string[];
  selectedModuleCodes: readonly string[];
  /** Only grant codes that exist in the tenant permission catalog. */
  catalogPermissionCodes?: ReadonlySet<string> | readonly string[] | null;
}): string[] {
  const catalog =
    input.catalogPermissionCodes == null
      ? null
      : input.catalogPermissionCodes instanceof Set
        ? input.catalogPermissionCodes
        : new Set(input.catalogPermissionCodes);

  const inCatalog = (code: string) => catalog == null || catalog.has(code);
  const previousSelected = new Set(moduleCodesFromPermissionCodes(input.currentPermissionCodes));
  const selected = new Set(input.selectedModuleCodes);

  const managedViews = new Set(
    INDUSTRIAL_MODULE_ROLE_ACCESS.flatMap((row) => [
      ...row.defaultGrantPermissions,
      ...row.accessPermissions,
    ]).filter(inCatalog),
  );

  const preserved = input.currentPermissionCodes.filter(
    (code) =>
      !managedViews.has(code) &&
      !isIndustrialModulePagePermission(code) &&
      code !== "industrial.access",
  );

  const fromModules = new Set<string>();
  for (const row of INDUSTRIAL_MODULE_ROLE_ACCESS) {
    if (!selected.has(row.code)) continue;
    for (const code of row.defaultGrantPermissions) {
      if (inCatalog(code)) fromModules.add(code);
    }

    const pageCodes = pagePermissionCodesForModule(row.code).filter(inCatalog);
    if (pageCodes.length === 0) continue;

    const newlySelected = !previousSelected.has(row.code);
    const existingPages = input.currentPermissionCodes.filter((code) =>
      pageCodes.includes(code),
    );

    if (newlySelected) {
      for (const code of pageCodes) fromModules.add(code);
    } else if (existingPages.length > 0) {
      for (const code of existingPages) fromModules.add(code);
    }
    // else: legacy role with view only — leave without page codes (all pages)
  }

  const next = new Set<string>([...preserved, ...fromModules]);
  if (next.size > 0 || selected.size > 0 || preserved.some((c) => c.startsWith("industrial."))) {
    if (inCatalog("industrial.access") || catalog == null) {
      next.add("industrial.access");
    }
  }
  return [...next].sort();
}

/** Nav gate: industrial.admin, or any access permission, or access-only modules. */
export function industrialModuleNavPermissionOk(
  moduleCode: string,
  permissions: ReadonlySet<string>,
): boolean {
  if (permissions.has("industrial.admin")) return true;
  if (moduleCode === "CORE") return permissions.has("industrial.access");
  const row = BY_CODE.get(moduleCode);
  if (!row || row.accessPermissions.length === 0) {
    return permissions.has("industrial.access");
  }
  return row.accessPermissions.some((code) => permissions.has(code));
}

export function industrialModulesWithRoleAccess(): Array<{
  code: string;
  name: string;
  group: string;
}> {
  const names = new Map(INDUSTRIAL_MODULE_REGISTRY.map((m) => [m.code, m]));
  return INDUSTRIAL_MODULE_ROLE_ACCESS.map((row) => {
    const entry = names.get(row.code);
    return {
      code: row.code,
      name: entry?.name ?? row.code,
      group: entry?.group ?? "Modules",
    };
  });
}
