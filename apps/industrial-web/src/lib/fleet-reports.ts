import { asFleetText } from "./fleet";

export type FleetReportField = {
  id: string;
  label: string;
  group: string;
};

export type FleetReportFilters = {
  q: string;
  assetType: string;
  status: string;
  insured: "" | "true" | "false";
  includeRemoved: boolean;
};

export type FleetCustomReportTemplate = {
  id: string;
  name: string;
  fields: string[];
  filters: FleetReportFilters;
  createdAt: string;
  updatedAt: string;
};

export const FLEET_REPORT_FIELDS: readonly FleetReportField[] = [
  { id: "assetNumber", label: "Asset #", group: "Identity" },
  { id: "assetType", label: "Asset type", group: "Identity" },
  { id: "customAssetTypeLabel", label: "Custom type label", group: "Identity" },
  { id: "year", label: "Year", group: "Identity" },
  { id: "make", label: "Make", group: "Identity" },
  { id: "model", label: "Model", group: "Identity" },
  { id: "trim", label: "Trim", group: "Identity" },
  { id: "color", label: "Color", group: "Identity" },
  { id: "vin", label: "VIN", group: "Identity" },
  { id: "serialNumber", label: "Serial #", group: "Identity" },
  { id: "status", label: "Status", group: "Identity" },
  { id: "locationName", label: "Location", group: "Identity" },
  { id: "notes", label: "Notes", group: "Identity" },
  { id: "licensePlate", label: "License plate", group: "Registration" },
  { id: "licenseState", label: "License state", group: "Registration" },
  { id: "renewalDate", label: "Renewal date", group: "Registration" },
  { id: "registrationRenewalMonth", label: "Renewal month", group: "Registration" },
  { id: "insured", label: "Insured", group: "Insurance" },
  { id: "insuranceStatus", label: "Insurance status", group: "Insurance" },
  { id: "insuranceCompany", label: "Insurance company", group: "Insurance" },
  { id: "insurancePolicyNumber", label: "Policy #", group: "Insurance" },
  { id: "insurancePhone", label: "Company phone", group: "Insurance" },
  { id: "insuranceAgentName", label: "Agent name", group: "Insurance" },
  { id: "insuranceAgentPhone", label: "Agent phone", group: "Insurance" },
  { id: "insuranceAgentEmail", label: "Agent email", group: "Insurance" },
  { id: "insuranceEffectiveDate", label: "Effective date", group: "Insurance" },
  { id: "insuranceExpirationDate", label: "Expiration date", group: "Insurance" },
  { id: "countyAssessed", label: "County assessed", group: "Compliance" },
  { id: "countyAssessmentStatus", label: "County status", group: "Compliance" },
  { id: "form2290Status", label: "Form 2290", group: "Compliance" },
  { id: "irpStatus", label: "IRP", group: "Compliance" },
  { id: "notOnVehicleFringeSs", label: "Fringe SS excluded", group: "Compliance" },
  { id: "commuteUseStatus", label: "Commute use", group: "Compliance" },
  { id: "assignedDriverName", label: "Assigned DRIVER", group: "Assignment" },
  { id: "mileage", label: "Mileage", group: "Assignment" },
  { id: "engineHours", label: "Engine hours", group: "Assignment" },
  { id: "outOfService", label: "Out of service", group: "Assignment" },
  { id: "outOfServiceReason", label: "OOS reason", group: "Assignment" },
  { id: "dispositionStatus", label: "Disposition", group: "Disposition" },
  { id: "dispositionDate", label: "Disposition date", group: "Disposition" },
];

export const FLEET_REPORT_FIELD_IDS = new Set(FLEET_REPORT_FIELDS.map((f) => f.id));

export const FLEET_REPORT_FIELD_BY_ID = new Map(FLEET_REPORT_FIELDS.map((f) => [f.id, f]));

export const FLEET_REPORT_GROUPS = [...new Set(FLEET_REPORT_FIELDS.map((f) => f.group))];

export const DEFAULT_FLEET_REPORT_FILTERS: FleetReportFilters = {
  q: "",
  assetType: "",
  status: "",
  insured: "",
  includeRemoved: false,
};

export const FLEET_REPORT_PRESETS: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  fields: string[];
  filters?: Partial<FleetReportFilters>;
}> = [
  {
    id: "inventory",
    name: "Asset inventory",
    description: "Core identity, location, and status for active assets.",
    fields: [
      "assetNumber",
      "assetType",
      "year",
      "make",
      "model",
      "vin",
      "licensePlate",
      "licenseState",
      "locationName",
      "assignedDriverName",
      "status",
      "mileage",
    ],
  },
  {
    id: "insurance",
    name: "Insurance roster",
    description: "Coverage details with DRIVER and plate.",
    fields: [
      "assetNumber",
      "year",
      "make",
      "model",
      "licensePlate",
      "assignedDriverName",
      "insured",
      "insuranceStatus",
      "insuranceCompany",
      "insurancePolicyNumber",
      "insuranceEffectiveDate",
      "insuranceExpirationDate",
      "insuranceAgentName",
      "insuranceAgentPhone",
    ],
  },
  {
    id: "registration",
    name: "Registration renewals",
    description: "Plates and renewal dates.",
    fields: [
      "assetNumber",
      "year",
      "make",
      "model",
      "licensePlate",
      "licenseState",
      "renewalDate",
      "registrationRenewalMonth",
      "status",
      "locationName",
    ],
  },
  {
    id: "compliance",
    name: "Compliance snapshot",
    description: "2290, IRP, county, fringe, and commute fields.",
    fields: [
      "assetNumber",
      "assetType",
      "licensePlate",
      "form2290Status",
      "irpStatus",
      "countyAssessed",
      "countyAssessmentStatus",
      "notOnVehicleFringeSs",
      "commuteUseStatus",
      "insured",
      "insuranceStatus",
    ],
  },
];

const REMOVED_STATUSES = new Set(["REMOVED", "SOLD", "DISPOSED", "ARCHIVED"]);

export function normalizeFleetReportFields(fields: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of fields) {
    if (!FLEET_REPORT_FIELD_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function filterFleetReportRows(
  rows: Array<Record<string, unknown>>,
  filters: FleetReportFilters,
): Array<Record<string, unknown>> {
  const q = filters.q.trim().toLowerCase();
  return rows.filter((row) => {
    const status = String(row.status ?? "").toUpperCase();
    const isRemoved = REMOVED_STATUSES.has(status);
    if (!filters.includeRemoved && isRemoved) return false;
    if (filters.status && status !== filters.status.toUpperCase()) return false;
    if (filters.assetType && String(row.assetType ?? "") !== filters.assetType) return false;
    if (filters.insured === "true" && row.insured !== true) return false;
    if (filters.insured === "false" && row.insured !== false) return false;
    if (!q) return true;
    const haystack = [
      row.assetNumber,
      row.make,
      row.model,
      row.vin,
      row.licensePlate,
      row.assignedDriverName,
      row.locationName,
      row.assetType,
    ]
      .map((v) => asFleetText(v).toLowerCase())
      .join(" ");
    return haystack.includes(q);
  });
}

export function formatFleetReportCell(value: unknown): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value == null) return "";
  return String(value);
}

export function escapeFleetReportCsv(value: unknown): string {
  const s = formatFleetReportCell(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildFleetReportCsv(
  rows: Array<Record<string, unknown>>,
  fieldIds: string[],
): string {
  const fields = normalizeFleetReportFields(fieldIds);
  if (fields.length === 0) return "";
  const headers = fields.map((id) => FLEET_REPORT_FIELD_BY_ID.get(id)?.label ?? id);
  const lines = [headers.map(escapeFleetReportCsv).join(",")];
  for (const row of rows) {
    lines.push(
      fields.map((id) => escapeFleetReportCsv((row as Record<string, unknown>)[id])).join(","),
    );
  }
  return lines.join("\n");
}

export function fleetReportStorageKey(tenantId: string): string {
  return `forge:fleet-custom-reports:${tenantId}`;
}

export function loadFleetCustomReports(tenantId: string): FleetCustomReportTemplate[] {
  if (typeof window === "undefined" || !tenantId) return [];
  try {
    const raw = window.localStorage.getItem(fleetReportStorageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FleetCustomReportTemplate[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t && typeof t.name === "string" && Array.isArray(t.fields))
      .map((t) => ({
        id: String(t.id),
        name: String(t.name).trim(),
        fields: normalizeFleetReportFields(t.fields),
        filters: { ...DEFAULT_FLEET_REPORT_FILTERS, ...t.filters },
        createdAt: String(t.createdAt ?? new Date().toISOString()),
        updatedAt: String(t.updatedAt ?? new Date().toISOString()),
      }))
      .filter((t) => t.name && t.fields.length > 0);
  } catch {
    return [];
  }
}

export function saveFleetCustomReports(
  tenantId: string,
  templates: FleetCustomReportTemplate[],
): void {
  if (typeof window === "undefined" || !tenantId) return;
  window.localStorage.setItem(fleetReportStorageKey(tenantId), JSON.stringify(templates));
}

export function slugifyFleetReportName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
