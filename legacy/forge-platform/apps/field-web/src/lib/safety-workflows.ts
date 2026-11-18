/**
 * Phase 7 safety workflow catalog for Forge Safety - Field Version.
 * Only enabled industrial modules should be shown in Field.
 */

export type SafetyWorkflowId =
  | "jsa"
  | "loto"
  | "confined-space"
  | "hot-work"
  | "working-at-heights"
  | "electrical"
  | "chemicals"
  | "food-safety"
  | "sanitation";

export type SafetyWorkflowDef = {
  id: SafetyWorkflowId;
  label: string;
  detail: string;
  href: string;
  moduleCode: string;
  /** Optional secondary codes — show if any match. */
  anyModuleCodes?: readonly string[];
  apiPath?: string;
  featureId?: string;
  group: "core" | "permits" | "chemical" | "food";
};

export const SAFETY_WORKFLOWS: readonly SafetyWorkflowDef[] = [
  {
    id: "jsa",
    label: "JSA / JHA",
    detail: "Brief, acknowledge, and review job safety analysis",
    href: "/jsa/",
    moduleCode: "JSAS",
    featureId: "jsa",
    apiPath: "/api/v1/industrial/jsas",
    group: "core",
  },
  {
    id: "loto",
    label: "LOTO",
    detail: "Lockout / Tagout procedures",
    href: "/more/loto/",
    moduleCode: "LOCKOUT_TAGOUT",
    featureId: "more-loto",
    group: "core",
  },
  {
    id: "hot-work",
    label: "Hot Work",
    detail: "Hot work permits",
    href: "/more/permits/?type=hot-work",
    moduleCode: "HOT_WORK",
    featureId: "more-permits",
    apiPath: "/api/v1/industrial/hot-work",
    group: "permits",
  },
  {
    id: "confined-space",
    label: "Confined Space",
    detail: "Entry permits and atmospheric checks",
    href: "/more/permits/?type=confined-space",
    moduleCode: "CONFINED_SPACE",
    apiPath: "/api/v1/industrial/confined-space",
    group: "permits",
  },
  {
    id: "working-at-heights",
    label: "Working at Heights",
    detail: "Fall protection permits",
    href: "/more/permits/?type=working-at-heights",
    moduleCode: "WORKING_AT_HEIGHTS",
    apiPath: "/api/v1/industrial/working-at-heights",
    group: "permits",
  },
  {
    id: "electrical",
    label: "Electrical",
    detail: "Electrical safety permits",
    href: "/more/permits/?type=electrical-safety",
    moduleCode: "ELECTRICAL_SAFETY",
    apiPath: "/api/v1/industrial/electrical-safety",
    group: "permits",
  },
  {
    id: "chemicals",
    label: "Chemicals / SDS",
    detail: "Critical chemical summaries",
    href: "/more/sds/",
    moduleCode: "CHEMICAL_SAFETY",
    featureId: "more-sds",
    apiPath: "/api/v1/industrial/chemical-safety",
    group: "chemical",
  },
  {
    id: "food-safety",
    label: "Food Safety",
    detail: "Pre-op, verification, and contamination checks",
    href: "/sanitation/?focus=food",
    moduleCode: "SANITATION",
    featureId: "more-sanitation",
    group: "food",
  },
  {
    id: "sanitation",
    label: "Sanitation Inspections",
    detail: "Cleaning, pest, dust, and sanitation checklists",
    href: "/sanitation/",
    moduleCode: "SANITATION",
    featureId: "more-sanitation",
    group: "food",
  },
];

export type PermitTypeId =
  "hot-work" | "confined-space" | "working-at-heights" | "electrical-safety";

export const PERMIT_TYPES: Array<{
  id: PermitTypeId;
  label: string;
  moduleCode: string;
  apiPath: string;
}> = [
  {
    id: "hot-work",
    label: "Hot Work",
    moduleCode: "HOT_WORK",
    apiPath: "/api/v1/industrial/hot-work",
  },
  {
    id: "confined-space",
    label: "Confined Space",
    moduleCode: "CONFINED_SPACE",
    apiPath: "/api/v1/industrial/confined-space",
  },
  {
    id: "working-at-heights",
    label: "Working at Heights",
    moduleCode: "WORKING_AT_HEIGHTS",
    apiPath: "/api/v1/industrial/working-at-heights",
  },
  {
    id: "electrical-safety",
    label: "Electrical",
    moduleCode: "ELECTRICAL_SAFETY",
    apiPath: "/api/v1/industrial/electrical-safety",
  },
];

export function enabledSafetyWorkflows(
  moduleEnabled: (code: string) => boolean,
): SafetyWorkflowDef[] {
  return SAFETY_WORKFLOWS.filter((workflow) => {
    if (moduleEnabled(workflow.moduleCode)) return true;
    return (workflow.anyModuleCodes ?? []).some((code) => moduleEnabled(code));
  });
}

export function enabledPermitTypes(moduleEnabled: (code: string) => boolean) {
  return PERMIT_TYPES.filter((type) => moduleEnabled(type.moduleCode));
}

export function parsePermitType(raw: string | null | undefined): PermitTypeId | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (value === "hot-work" || value === "hotwork") return "hot-work";
  if (value === "confined-space" || value === "confined") return "confined-space";
  if (value === "working-at-heights" || value === "heights") return "working-at-heights";
  if (value === "electrical-safety" || value === "electrical") return "electrical-safety";
  return null;
}

export type SafetyRecord = {
  id: string;
  title?: string | null;
  status?: string | null;
  siteId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  sourcePayload?: Record<string, unknown> | null;
  description?: string | null;
  location?: string | null;
  divisionName?: string | null;
  departmentName?: string | null;
  [key: string]: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function recordPayload(record: SafetyRecord): Record<string, unknown> {
  return asRecord(record.sourcePayload);
}

export function recordText(record: SafetyRecord, ...keys: string[]): string {
  const payload = recordPayload(record);
  for (const key of keys) {
    const fromRow = record[key];
    if (typeof fromRow === "string" && fromRow.trim()) return fromRow.trim();
    const fromPayload = payload[key];
    if (typeof fromPayload === "string" && fromPayload.trim()) return fromPayload.trim();
  }
  return "";
}

export function listFromPayload(record: SafetyRecord, key: string): string[] {
  const payload = recordPayload(record);
  const raw = payload[key] ?? record[key];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === "string") return item.trim();
        const row = asRecord(item);
        return String(row.label ?? row.text ?? row.step ?? row.name ?? "").trim();
      })
      .filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(/\n|;/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

export function acknowledgmentsOf(record: SafetyRecord): Array<Record<string, unknown>> {
  const payload = recordPayload(record);
  return Array.isArray(payload.acknowledgments)
    ? (payload.acknowledgments as Array<Record<string, unknown>>)
    : [];
}

export function hasPersonAcknowledged(
  record: SafetyRecord,
  personnelId: string | null | undefined,
  displayName: string | null | undefined,
): boolean {
  const acks = acknowledgmentsOf(record);
  const pid = (personnelId ?? "").trim();
  const name = (displayName ?? "").trim().toLowerCase();
  return acks.some((ack) => {
    const ackPid = String(ack.personnelId ?? "").trim();
    const ackName = String(ack.name ?? "")
      .trim()
      .toLowerCase();
    if (pid && ackPid && pid === ackPid) return true;
    if (name && ackName && name === ackName) return true;
    return false;
  });
}

export function chemicalCriticalFields(
  record: SafetyRecord,
): Array<{ label: string; value: string }> {
  const pairs: Array<[string, string[]]> = [
    ["Product", ["title", "name", "productName", "chemicalName"]],
    ["CAS", ["casNumber", "cas"]],
    ["Hazard class", ["hazardClass", "hazardCategory", "ghsClass"]],
    ["Signal word", ["signalWord"]],
    ["PPE", ["ppe", "requiredPpe", "personalProtectiveEquipment"]],
    ["First aid", ["firstAid", "firstAidSummary"]],
    ["Storage", ["storage", "storageRequirements"]],
    ["Location", ["location", "locationName", "siteName"]],
  ];
  return pairs
    .map(([label, keys]) => ({ label, value: recordText(record, ...keys) }))
    .filter((row) => row.value);
}
