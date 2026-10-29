/**
 * Per-module page (tab) catalogs and RBAC helpers for Roles & permissions.
 * Page codes: industrial.<domain>.page.<tabId>
 */

export type IndustrialModulePage = {
  id: string;
  label: string;
};

export type IndustrialModulePageCatalog = {
  moduleCode: string;
  /** Permission domain prefix, e.g. industrial.sanitation */
  domain: string;
  pages: readonly IndustrialModulePage[];
};

function catalog(
  moduleCode: string,
  domain: string,
  pages: readonly IndustrialModulePage[],
): IndustrialModulePageCatalog {
  return { moduleCode, domain, pages };
}

/**
 * Multi-tab industrial modules that support per-role page visibility.
 * Labels match ModuleWorkspaceTabs in industrial-web.
 */
export const INDUSTRIAL_MODULE_PAGE_CATALOGS: readonly IndustrialModulePageCatalog[] = [
  catalog("SANITATION", "industrial.sanitation", [
    { id: "dashboard", label: "Dashboard" },
    { id: "analytics", label: "Analytics" },
    { id: "heatmap", label: "Heat Map" },
    { id: "inspections", label: "Inspections" },
    { id: "start", label: "Start Inspection" },
    { id: "preop", label: "Pre-Op" },
    { id: "run", label: "Checklist" },
    { id: "mss", label: "Master Schedule" },
    { id: "cleaning", label: "Cleaning Tasks" },
    { id: "dust", label: "Dust Housekeeping" },
    { id: "environmental", label: "Environmental" },
    { id: "spills", label: "Spills" },
    { id: "zones", label: "Areas & Locations" },
    { id: "pest", label: "Pest Control" },
    { id: "chemicals", label: "Chemicals" },
    { id: "compressed-air", label: "Compressed Air" },
    { id: "findings", label: "Findings" },
    { id: "verification", label: "Verification" },
    { id: "concerns", label: "Concerns" },
    { id: "reports", label: "Reports" },
    { id: "regulatory", label: "Regulatory" },
    { id: "profile", label: "Facility Profile" },
    { id: "templates", label: "Templates" },
    { id: "settings", label: "Settings" },
  ]),
  catalog("WORKERS_COMP", "industrial.workers_comp", [
    { id: "dashboard", label: "Dashboard" },
    { id: "cases", label: "Cases" },
    { id: "weekly-updates", label: "Weekly updates" },
    { id: "employees", label: "EMPLOYEES" },
    { id: "return-to-work", label: "Return to Work" },
    { id: "medical", label: "Medical and Restrictions" },
    { id: "claims", label: "Claims and Carriers" },
    { id: "costs", label: "Costs and Reserves" },
    { id: "osha", label: "OSHA Recordkeeping" },
    { id: "documents", label: "Documents" },
    { id: "reports", label: "Reports" },
    { id: "settings", label: "Settings" },
  ]),
  catalog("INCIDENTS", "industrial.incidents", [
    { id: "injuries", label: "Injuries" },
    { id: "near-misses", label: "Near Misses" },
    { id: "medical-refusals", label: "Medical Refusals" },
    { id: "drug-alcohol", label: "Drug/Alcohol" },
    { id: "property-damage", label: "Property Damage" },
    { id: "automotive", label: "Automotive" },
    { id: "incident-workflow", label: "Incident Workflow" },
    { id: "evaluation-checklist", label: "Evaluation Checklist" },
    { id: "root-cause-analysis", label: "Root Cause Analysis" },
    { id: "body-map", label: "Injury Map" },
  ]),
  catalog("DOCUMENTS", "industrial.documents", [
    { id: "library", label: "Library" },
    { id: "document", label: "Document" },
    { id: "approvals", label: "Approvals" },
    { id: "acknowledgments", label: "Acknowledgments" },
    { id: "reviews", label: "Reviews" },
  ]),
  catalog("DOT_COMPLIANCE", "industrial.dot", [
    { id: "dashboard", label: "Dashboard" },
    { id: "drivers", label: "DRIVERS (DQF)" },
    { id: "vehicles", label: "Vehicles" },
    { id: "dvirs", label: "DVIRs" },
    { id: "roadside", label: "Roadside" },
    { id: "accidents", label: "Accidents" },
    { id: "drug-alcohol", label: "Drug & Alcohol" },
    { id: "company", label: "Company" },
    { id: "other", label: "Other" },
    { id: "reports", label: "Reports" },
  ]),
  catalog("FORMS", "industrial.forms", [
    { id: "library", label: "Forms" },
    { id: "fill", label: "Fill out" },
    { id: "submissions", label: "Submissions" },
  ]),
  catalog("INSPECTIONS", "industrial.inspections", [
    { id: "list", label: "Inspections" },
    { id: "templates", label: "Templates" },
    { id: "start", label: "Start" },
    { id: "run", label: "Checklist" },
    { id: "report", label: "Report" },
    { id: "open-items", label: "Open items" },
    { id: "contacts", label: "Dept contacts" },
  ]),
  catalog("LOCKOUT_TAGOUT", "industrial.loto", [
    { id: "procedures", label: "Procedures" },
    { id: "lockouts", label: "Active lockouts" },
    { id: "reports", label: "Reports" },
  ]),
  catalog("EMERGENCY_ALERTS", "industrial.emergency_alerts", [
    { id: "dashboard", label: "Dashboard" },
    { id: "compose", label: "Send Alert" },
    { id: "active", label: "Active" },
    { id: "history", label: "History" },
    { id: "templates", label: "Templates" },
    { id: "groups", label: "Groups" },
  ]),
  catalog("QR_LINKS", "industrial.qr_links", [
    { id: "registry", label: "Registry" },
    { id: "create", label: "Create" },
    { id: "detail", label: "Detail" },
  ]),
  catalog("PRINT_MANAGER", "industrial.printer", [
    { id: "dashboard", label: "Dashboard" },
    { id: "queue", label: "Print Queue" },
    { id: "printers", label: "Printers" },
    { id: "bridges", label: "Print Bridges" },
    { id: "groups", label: "Groups" },
    { id: "routing", label: "Routing" },
    { id: "templates", label: "Templates" },
    { id: "batches", label: "Batches" },
    { id: "supplies", label: "Supplies" },
    { id: "analytics", label: "Analytics" },
    { id: "history", label: "Print History" },
  ]),
  catalog("FLEET", "industrial.fleet", [
    { id: "dashboard", label: "Dashboard" },
    { id: "assets", label: "Assets" },
    { id: "drivers", label: "DRIVERS" },
    { id: "renewals", label: "Renewals" },
    { id: "compliance", label: "Compliance" },
    { id: "maintenance", label: "Maintenance" },
    { id: "inspections", label: "Inspections" },
    { id: "documents", label: "Documents" },
    { id: "removed", label: "Removed" },
    { id: "reports", label: "Reports" },
    { id: "settings", label: "Settings" },
  ]),
  catalog("SAFETY_SUPPLIES", "industrial.supplies", [
    { id: "dashboard", label: "Dashboard" },
    { id: "inventory", label: "Inventory" },
    { id: "items", label: "Items" },
    { id: "locations", label: "Locations" },
    { id: "receive", label: "Receive" },
    { id: "issue", label: "Issue" },
    { id: "ppe", label: "PPE" },
    { id: "transfers", label: "Transfers" },
    { id: "requests", label: "Requests" },
    { id: "qr-stations", label: "QR Supply Requests" },
    { id: "vendors", label: "Vendors" },
    { id: "purchase-orders", label: "Purchase Orders" },
    { id: "reorder", label: "Reorder" },
    { id: "expiring", label: "Expiring" },
    { id: "kits", label: "Kits" },
    { id: "transactions", label: "Transactions" },
    { id: "reports", label: "Reports" },
    { id: "categories", label: "Categories" },
    { id: "settings", label: "Settings" },
  ]),
] as const;

const BY_MODULE = new Map(INDUSTRIAL_MODULE_PAGE_CATALOGS.map((row) => [row.moduleCode, row]));

const BY_DOMAIN = new Map(INDUSTRIAL_MODULE_PAGE_CATALOGS.map((row) => [row.domain, row]));

/** All page permission codes for seeding catalogs. */
export const INDUSTRIAL_MODULE_PAGE_PERMISSIONS: readonly string[] =
  INDUSTRIAL_MODULE_PAGE_CATALOGS.flatMap((row) =>
    row.pages.map((page) => `${row.domain}.page.${page.id}`),
  );

export function industrialModulePageCatalog(
  moduleCode: string,
): IndustrialModulePageCatalog | undefined {
  return BY_MODULE.get(moduleCode);
}

export function pagePermissionCode(moduleCode: string, tabId: string): string | null {
  const row = BY_MODULE.get(moduleCode);
  if (!row) return null;
  if (!row.pages.some((page) => page.id === tabId)) return null;
  return `${row.domain}.page.${tabId}`;
}

export function pagePermissionCodesForModule(moduleCode: string): string[] {
  const row = BY_MODULE.get(moduleCode);
  if (!row) return [];
  return row.pages.map((page) => `${row.domain}.page.${page.id}`);
}

export function isIndustrialModulePagePermission(code: string): boolean {
  const marker = ".page.";
  const idx = code.indexOf(marker);
  if (idx < 0) return false;
  const domain = code.slice(0, idx);
  const tabId = code.slice(idx + marker.length);
  if (!tabId || tabId.includes(".")) return false;
  const row = BY_DOMAIN.get(domain);
  return Boolean(row?.pages.some((page) => page.id === tabId));
}

export function moduleCodeFromPagePermission(code: string): string | null {
  if (!isIndustrialModulePagePermission(code)) return null;
  const domain = code.slice(0, code.indexOf(".page."));
  return BY_DOMAIN.get(domain)?.moduleCode ?? null;
}

export function managePermissionForModuleDomain(domain: string): string {
  return `${domain}.manage`;
}

/**
 * Whether the role may see a module page.
 * Legacy: module view with no page codes ⇒ all pages.
 * Explicit: any page code for the module means only those pages.
 */
export function modulePagePermissionOk(
  moduleCode: string,
  tabId: string,
  permissions: ReadonlySet<string> | readonly string[],
): boolean {
  const perms = permissions instanceof Set ? permissions : new Set(permissions);
  if (perms.has("industrial.admin")) return true;

  const row = BY_MODULE.get(moduleCode);
  if (!row) return true;

  if (perms.has(managePermissionForModuleDomain(row.domain))) return true;

  const pageCodes = pagePermissionCodesForModule(moduleCode);
  const hasAnyPageCode = pageCodes.some((code) => perms.has(code));
  if (!hasAnyPageCode) {
    // Legacy: opening the module (view) grants every page until pages are customized.
    return perms.has(`${row.domain}.view`);
  }

  const needed = `${row.domain}.page.${tabId}`;
  return perms.has(needed);
}

export function filterModulePages<T extends { id: string }>(input: {
  tabs: readonly T[];
  moduleCode: string;
  permissions: ReadonlySet<string> | readonly string[];
  tenantDisabledTabs?: readonly string[] | null;
}): T[] {
  const disabled = new Set(input.tenantDisabledTabs ?? []);
  return input.tabs.filter((tab) => {
    if (disabled.has(tab.id)) return false;
    return modulePagePermissionOk(input.moduleCode, tab.id, input.permissions);
  });
}

/** Enabled page ids for Roles UI (legacy view ⇒ all pages checked). */
export function enabledPageIdsFromPermissionCodes(
  moduleCode: string,
  permissionCodes: readonly string[],
): string[] {
  const row = BY_MODULE.get(moduleCode);
  if (!row) return [];
  const perms = new Set(permissionCodes);
  if (perms.has("industrial.admin") || perms.has(managePermissionForModuleDomain(row.domain))) {
    return row.pages.map((page) => page.id);
  }
  const pageCodes = pagePermissionCodesForModule(moduleCode);
  const hasAny = pageCodes.some((code) => perms.has(code));
  if (!hasAny) {
    return perms.has(`${row.domain}.view`) ? row.pages.map((page) => page.id) : [];
  }
  return row.pages.filter((page) => perms.has(`${row.domain}.page.${page.id}`)).map((p) => p.id);
}

/**
 * Apply a Pages checklist change for one module without touching other modules.
 */
export function mergePermissionCodesWithModulePages(input: {
  currentPermissionCodes: readonly string[];
  moduleCode: string;
  enabledPageIds: readonly string[];
  catalogPermissionCodes?: ReadonlySet<string> | readonly string[] | null;
}): string[] {
  const catalog =
    input.catalogPermissionCodes == null
      ? null
      : input.catalogPermissionCodes instanceof Set
        ? input.catalogPermissionCodes
        : new Set(input.catalogPermissionCodes);
  const inCatalog = (code: string) => catalog == null || catalog.has(code);

  const row = BY_MODULE.get(input.moduleCode);
  if (!row) return [...input.currentPermissionCodes].sort();

  const modulePageCodes = new Set(pagePermissionCodesForModule(input.moduleCode));
  const next = new Set(input.currentPermissionCodes.filter((code) => !modulePageCodes.has(code)));

  const enabled = new Set(input.enabledPageIds);
  for (const page of row.pages) {
    if (!enabled.has(page.id)) continue;
    const code = `${row.domain}.page.${page.id}`;
    if (inCatalog(code)) next.add(code);
  }

  const view = `${row.domain}.view`;
  if (enabled.size > 0 && inCatalog(view)) {
    next.add(view);
  }

  return [...next].sort();
}
