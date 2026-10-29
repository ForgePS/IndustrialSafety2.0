/**
 * Industrial dropdown / picklist registry for Platform Admin.
 *
 * Org catalogs (sites, departments, positions, etc.) are tenant data loaded from
 * the Industrial API. Module picklists are code-defined options used in forms.
 */
import { apiGet, apiSend } from "@forge/web-kit";
import { FLEET_ASSET_STATUS_OPTIONS, FLEET_ASSET_TYPE_OPTIONS } from "./fleet";
import { INCIDENT_SEVERITY_OPTIONS, INCIDENT_STATUS_OPTIONS } from "./incidents-module";
import { PERSONNEL_STATUS_OPTIONS, SAFETY_FOOTWEAR_CLASS_OPTIONS } from "./personnel-form";
import { loadIndustrialSiteCatalog } from "./industrial-facility";
import { WC_WORK_STATUS_OPTIONS } from "./workers-comp-module";
import type { DivisionOption } from "./personnel-assignment";

export type OrgCatalogKind =
  "sites" | "departments" | "positions" | "employment-types" | "divisions";

export type OrgCatalogDefinition = {
  kind: OrgCatalogKind;
  label: string;
  description: string;
  usedIn: string;
  editable: boolean;
};

export const ORG_CATALOG_DEFINITIONS: readonly OrgCatalogDefinition[] = [
  {
    kind: "sites",
    label: "Locations / sites",
    description: "Facilities and site locations used in the facility selector and personnel forms.",
    usedIn: "Personnel, incidents, inspections, forms, facility filter, LOTO, Safety Supplies",
    editable: true,
  },
  {
    kind: "departments",
    label: "Departments",
    description: "Organizational departments linked to a site/location.",
    usedIn: "Add Person, incident create, inspections, LOTO, Safety Supplies",
    editable: true,
  },
  {
    kind: "positions",
    label: "Positions / job titles",
    description: "Job titles and position names for personnel records.",
    usedIn: "Add Person, personnel directory",
    editable: true,
  },
  {
    kind: "employment-types",
    label: "Employment types",
    description: "Employment classification such as full-time, seasonal, or contractor.",
    usedIn: "Personnel records",
    editable: true,
  },
  {
    kind: "divisions",
    label: "Divisions",
    description: "Business divisions linked to a site/location for supervisor routing.",
    usedIn: "Add Person division select, Safety Supplies",
    editable: true,
  },
];

export type OrgCatalogRow = {
  id: string;
  label: string;
  siteId?: string | null;
  departmentId?: string | null;
  divisionName?: string | null;
  meta?: string;
  archived?: boolean;
};

export type OrgCatalogState = {
  kind: OrgCatalogKind;
  rows: OrgCatalogRow[];
};

export type FixedPicklistEntry = {
  key: string;
  label: string;
  description: string;
  options: Array<{ value: string; label: string }>;
};

export function divisionCatalogRowId(siteId: string | null | undefined, name: string): string {
  return `${siteId ?? ""}::${name}`;
}

export function parseDivisionCatalogRowId(id: string): { siteId: string | null; name: string } {
  const sep = id.indexOf("::");
  if (sep < 0) return { siteId: null, name: id };
  const sitePart = id.slice(0, sep);
  return { siteId: sitePart === "" ? null : sitePart, name: id.slice(sep + 2) };
}

function labelFromRow(row: Record<string, unknown>): string {
  return String(
    [row.name, row.title, row.displayName, row.facilityKey, row.siteKey].find(
      (value) => typeof value === "string" && value.trim() !== "",
    ) ?? row.id,
  ).trim();
}

function rowsFromApi(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { items?: unknown[] }).items)
  ) {
    return (payload as { items: unknown[] }).items;
  }
  return [];
}

function mapOrgRows(payload: unknown): OrgCatalogRow[] {
  const rows: OrgCatalogRow[] = [];
  for (const row of rowsFromApi(payload)) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as Record<string, unknown>;
    const id =
      typeof record.id === "string"
        ? record.id
        : typeof record.name === "string"
          ? record.name
          : "";
    if (!id) continue;
    const entry: OrgCatalogRow = {
      id,
      label: labelFromRow(record),
      archived: Boolean(record.archivedAt),
    };
    if (typeof record.siteId === "string" && record.siteId.trim() !== "") {
      entry.siteId = record.siteId.trim();
    } else if (record.siteId === null) {
      entry.siteId = null;
    }
    if (typeof record.departmentId === "string" && record.departmentId.trim() !== "") {
      entry.departmentId = record.departmentId.trim();
    } else if (record.departmentId === null) {
      entry.departmentId = null;
    }
    if (typeof record.divisionName === "string" && record.divisionName.trim() !== "") {
      entry.divisionName = record.divisionName.trim();
    } else if (record.divisionName === null) {
      entry.divisionName = null;
    } else {
      const payload =
        record.sourcePayload &&
        typeof record.sourcePayload === "object" &&
        !Array.isArray(record.sourcePayload)
          ? (record.sourcePayload as Record<string, unknown>)
          : null;
      if (payload && typeof payload.division === "string" && payload.division.trim()) {
        entry.divisionName = payload.division.trim();
      }
    }
    if (typeof record.description === "string" && record.description.trim() !== "") {
      entry.meta = record.description.trim();
    }
    rows.push(entry);
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

function enrichLinkedMeta(
  rows: OrgCatalogRow[],
  kind: OrgCatalogKind,
  sitesById: Map<string, string>,
  departmentsById: Map<string, OrgCatalogRow>,
): OrgCatalogRow[] {
  return rows.map((row) => {
    if (kind === "departments" || kind === "divisions") {
      const siteLabel = row.siteId ? sitesById.get(row.siteId) : null;
      const divisionLabel = row.divisionName?.trim() || "";
      const parts = [
        siteLabel ?? (row.siteId ? "Unknown site" : "Any site"),
        ...(kind === "departments" && divisionLabel ? [divisionLabel] : []),
      ];
      return {
        ...row,
        meta: parts.join(" · "),
      };
    }
    if (kind === "positions") {
      const dept = row.departmentId ? departmentsById.get(row.departmentId) : undefined;
      if (!dept) {
        return { ...row, meta: row.departmentId ? "Unknown department" : "Any department" };
      }
      const siteLabel = dept.siteId ? sitesById.get(dept.siteId) : null;
      const deptLabel = dept.label;
      return {
        ...row,
        meta: siteLabel ? `${deptLabel} · ${siteLabel}` : deptLabel,
      };
    }
    return row;
  });
}

export async function loadOrgCatalog(
  tenantId: string,
  kind: OrgCatalogKind,
): Promise<OrgCatalogRow[]> {
  const base = `/api/v1/tenants/${encodeURIComponent(tenantId)}/industrial`;

  if (kind === "sites") {
    const sites = await loadIndustrialSiteCatalog(tenantId);
    return sites.map((site) => ({ id: site.id, label: site.name }));
  }

  if (kind === "divisions") {
    const assignment = await apiGet<{
      divisions?: string[];
      divisionEntries?: DivisionOption[];
    }>("/api/v1/industrial/personnel/assignment-options").catch(() => ({
      divisions: [] as string[],
      divisionEntries: [] as DivisionOption[],
    }));
    if (Array.isArray(assignment.divisionEntries) && assignment.divisionEntries.length > 0) {
      return assignment.divisionEntries
        .map((entry) => ({
          id: divisionCatalogRowId(entry.siteId, entry.name),
          label: entry.name,
          siteId: entry.siteId,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }
    return (assignment.divisions ?? [])
      .map((name) => String(name).trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ id: divisionCatalogRowId(null, name), label: name, siteId: null }));
  }

  const path =
    kind === "departments"
      ? `${base}/departments`
      : kind === "positions"
        ? `${base}/positions`
        : `${base}/employment-types`;

  const payload = await apiGet<unknown>(path, { query: { page: "1", pageSize: "500" } });
  return mapOrgRows(payload);
}

export async function loadAllOrgCatalogs(tenantId: string): Promise<OrgCatalogState[]> {
  const results = await Promise.all(
    ORG_CATALOG_DEFINITIONS.map(async (definition) => ({
      kind: definition.kind,
      rows: await loadOrgCatalog(tenantId, definition.kind).catch(() => []),
    })),
  );
  const sitesById = new Map(
    (results.find((row) => row.kind === "sites")?.rows ?? []).map((row) => [row.id, row.label]),
  );
  const departmentsById = new Map(
    (results.find((row) => row.kind === "departments")?.rows ?? []).map((row) => [row.id, row]),
  );
  return results.map((state) => ({
    ...state,
    rows: enrichLinkedMeta(state.rows, state.kind, sitesById, departmentsById),
  }));
}

export async function addOrgCatalogEntry(
  tenantId: string,
  kind: OrgCatalogKind,
  name: string,
  extras?: { siteId?: string; departmentId?: string; divisionName?: string },
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");

  const base = `/api/v1/tenants/${encodeURIComponent(tenantId)}/industrial`;

  if (kind === "sites") {
    await apiSend(`${base}/sites`, "POST", { name: trimmed });
    return;
  }

  if (kind === "departments") {
    if (!extras?.siteId) throw new Error("Site is required for departments");
    await apiSend(`${base}/departments`, "POST", {
      name: trimmed,
      siteId: extras.siteId,
      ...(extras.divisionName ? { divisionName: extras.divisionName } : {}),
    });
    return;
  }

  if (kind === "positions") {
    await apiSend(`${base}/positions`, "POST", {
      name: trimmed,
      ...(extras?.departmentId ? { departmentId: extras.departmentId } : {}),
    });
    return;
  }

  if (kind === "employment-types") {
    await apiSend(`${base}/employment-types`, "POST", { name: trimmed });
    return;
  }

  if (kind === "divisions") {
    if (!extras?.siteId) throw new Error("Site is required for divisions");
    await apiSend(`${base}/org-lookups/create-missing`, "POST", {
      kind: "division",
      name: trimmed,
      siteId: extras.siteId,
    });
    return;
  }

  throw new Error("This catalog cannot be edited here");
}

export async function archiveOrgCatalogEntry(
  tenantId: string,
  kind: OrgCatalogKind,
  id: string,
): Promise<void> {
  const base = `/api/v1/tenants/${encodeURIComponent(tenantId)}/industrial`;
  if (kind === "sites") {
    await apiSend(`${base}/sites/${encodeURIComponent(id)}`, "PATCH", { archive: true });
    return;
  }
  if (kind === "departments") {
    await apiSend(`${base}/departments/${encodeURIComponent(id)}`, "PATCH", { archive: true });
    return;
  }
  if (kind === "positions") {
    await apiSend(`${base}/positions/${encodeURIComponent(id)}`, "PATCH", { archive: true });
    return;
  }
  if (kind === "employment-types") {
    await apiSend(`${base}/employment-types/${encodeURIComponent(id)}`, "PATCH", {
      archive: true,
    });
    return;
  }
  if (kind === "divisions") {
    const parsed = parseDivisionCatalogRowId(id);
    await apiSend(`${base}/org-lookups/divisions`, "PATCH", {
      fromName: parsed.name,
      fromSiteId: parsed.siteId,
      archive: true,
    });
    return;
  }
  throw new Error("Remove is not supported for this catalog yet");
}

export async function renameOrgCatalogEntry(
  tenantId: string,
  kind: OrgCatalogKind,
  id: string,
  name: string,
  extras?: { siteId?: string | null; departmentId?: string | null; divisionName?: string | null },
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  const base = `/api/v1/tenants/${encodeURIComponent(tenantId)}/industrial`;

  if (kind === "sites") {
    await apiSend(`${base}/sites/${encodeURIComponent(id)}`, "PATCH", { name: trimmed });
    return;
  }
  if (kind === "departments") {
    const body: Record<string, unknown> = { name: trimmed };
    if (extras && "siteId" in extras) body.siteId = extras.siteId;
    if (extras && "divisionName" in extras) body.divisionName = extras.divisionName;
    await apiSend(`${base}/departments/${encodeURIComponent(id)}`, "PATCH", body);
    return;
  }
  if (kind === "positions") {
    const body: Record<string, unknown> = { name: trimmed };
    if (extras && "departmentId" in extras) body.departmentId = extras.departmentId;
    await apiSend(`${base}/positions/${encodeURIComponent(id)}`, "PATCH", body);
    return;
  }
  if (kind === "employment-types") {
    await apiSend(`${base}/employment-types/${encodeURIComponent(id)}`, "PATCH", {
      name: trimmed,
    });
    return;
  }
  if (kind === "divisions") {
    const parsed = parseDivisionCatalogRowId(id);
    await apiSend(`${base}/org-lookups/divisions`, "PATCH", {
      fromName: parsed.name,
      fromSiteId: parsed.siteId,
      name: trimmed,
      ...(extras && "siteId" in extras ? { siteId: extras.siteId } : {}),
    });
    return;
  }

  throw new Error("This catalog cannot be edited here");
}

/** Code-defined picklists shipped with Industrial — read-only reference for admins. */
export const FIXED_INDUSTRIAL_PICKLISTS: readonly FixedPicklistEntry[] = [
  {
    key: "personnel_status",
    label: "Personnel status",
    description: "Employment status on personnel records.",
    options: PERSONNEL_STATUS_OPTIONS.map((row) => ({ value: row.value, label: row.label })),
  },
  {
    key: "safety_footwear_class",
    label: "Safety footwear allowance",
    description: "PPE footwear classes for personnel.",
    options: SAFETY_FOOTWEAR_CLASS_OPTIONS.map((row) => ({ value: row.value, label: row.label })),
  },
  {
    key: "incident_status",
    label: "Incident status",
    description: "Lifecycle status when creating or editing incidents.",
    options: INCIDENT_STATUS_OPTIONS.map((row) => ({ value: row.value, label: row.label })),
  },
  {
    key: "incident_severity",
    label: "Incident severity",
    description: "Severity levels for new incidents.",
    options: INCIDENT_SEVERITY_OPTIONS.map((row) => ({ value: row.value, label: row.label })),
  },
  {
    key: "fleet_asset_type",
    label: "Fleet asset type",
    description: "Vehicle and equipment categories in Fleet.",
    options: FLEET_ASSET_TYPE_OPTIONS.map((value) => ({
      value,
      label: value.replace(/_/g, " "),
    })),
  },
  {
    key: "fleet_asset_status",
    label: "Fleet asset status",
    description: "Operational status for fleet assets.",
    options: FLEET_ASSET_STATUS_OPTIONS.map((value) => ({
      value,
      label: value.replace(/_/g, " "),
    })),
  },
  {
    key: "safety_supplies_location_type",
    label: "Safety Supplies location type",
    description:
      "Storage location types used when creating Safety Supplies locations. Editable under Safety Supplies → Settings.",
    options: ["SUPPLY_ROOM", "WAREHOUSE", "CABINET", "VEHICLE", "JOB_SITE", "OTHER"].map(
      (value) => ({
        value,
        label: value.replace(/_/g, " "),
      }),
    ),
  },
  {
    key: "workers_comp_work_status",
    label: "Workers comp work status",
    description: "Return-to-work status on WC cases.",
    options: WC_WORK_STATUS_OPTIONS.map((value) => ({
      value,
      label: value.replace(/_/g, " "),
    })),
  },
];

export function lookupOptionsToRows(
  options: Array<{ id: string; label: string; siteId?: string | null }>,
): OrgCatalogRow[] {
  return options.map((option) => {
    const row: OrgCatalogRow = { id: option.id, label: option.label };
    if (option.siteId) {
      row.siteId = option.siteId;
      row.meta = `Site: ${option.siteId}`;
    }
    return row;
  });
}
