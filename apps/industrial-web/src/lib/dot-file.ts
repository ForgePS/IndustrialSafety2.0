/**
 * Projection and edit helpers for the DOT file page.
 * Known DQF / vehicle fields render in labeled sections; leftover scalars
 * land in Details so imported payloads still surface without a second map.
 */
import { formatFileDate } from "./personnel-file";
import { dotDisplayName, dotRecordCategory, type DotCategory } from "./dot-compliance-module";
import { FLEET_ASSET_TYPE_OPTIONS } from "./fleet";
import { isDvirRecord, dvirDefectSummary, dvirDriverName, dvirInspectionDate } from "./dvir";

export type DotFileRow = {
  label: string;
  value: string;
  wide?: boolean;
};

export type DotFileGroup = {
  id: string;
  title: string;
  icon: string;
  rows: DotFileRow[];
};

const IDENTITY_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "employeeNumber", label: "EMPLOYEE #" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "dateOfBirth", label: "Date of birth" },
  { key: "jobTitle", label: "Job title" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

const LICENSE_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "licenseNumber", label: "License number" },
  { key: "licenseState", label: "License state" },
  { key: "licenseExpiryDate", label: "License expiration" },
  { key: "licenseClass", label: "License class" },
  { key: "cdlClass", label: "CDL class" },
  { key: "endorsements", label: "Endorsements" },
  // Front/back copies render as images via LicenseCopiesCard, not Yes/No text.
];

const MEDICAL_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "medicalCardExpiry", label: "Medical card expiration" },
  { key: "medicalExaminer", label: "Medical examiner" },
  { key: "medicalCard", label: "Medical card" },
];

const MVR_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "initialMvrDate", label: "Initial MVR" },
  { key: "lastMvrDate", label: "Last MVR" },
  { key: "nextMvrDueDate", label: "Next MVR due" },
  { key: "mvrReleaseDate", label: "MVR release" },
  { key: "mvrUploadCount", label: "MVR files" },
  { key: "mvrReleaseUploadCount", label: "MVR release files" },
];

const VEHICLE_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "vin", label: "VIN" },
  { key: "unitNumber", label: "Unit #" },
  { key: "assetNumber", label: "Asset #" },
  { key: "licensePlate", label: "License plate" },
  { key: "year", label: "Year" },
  { key: "make", label: "Make" },
  { key: "model", label: "Model" },
  { key: "assetType", label: "Asset type" },
];

const RECORD_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "locationText", label: "Location" },
  { key: "location", label: "Location" },
  { key: "siteName", label: "Site" },
  { key: "recordDate", label: "Record date" },
  { key: "recordType", label: "Type" },
];

const SECTIONED_KEYS = new Set(
  [
    ...IDENTITY_FIELDS,
    ...LICENSE_FIELDS,
    ...MEDICAL_FIELDS,
    ...MVR_FIELDS,
    ...VEHICLE_FIELDS,
    ...RECORD_FIELDS,
  ].map((field) => field.key),
);

const HIDDEN_KEYS = new Set([
  "id",
  "tenantId",
  "siteId",
  "departmentId",
  "personnelId",
  "title",
  "displayName",
  "name",
  "workerName",
  "driverName",
  "personnelName",
  "status",
  "category",
  "createdAt",
  "updatedAt",
  "archivedAt",
  "sourceSystem",
  "sourceCollection",
  "sourceDocumentId",
  "sourcePath",
  "sourcePayload",
  "sensitiveJson",
  "schemaJson",
  "seededFrom",
  "fleetDriverId",
  "fleetVehicleId",
  "dqf",
  "details",
  "licenseFrontUrl",
  "licenseBackUrl",
  "licenseFrontUpload",
  "licenseBackUpload",
  "driversLicenseFront",
  "driversLicenseBack",
  "driversLicenseCopy",
  "hasLicenseFront",
  "hasLicenseBack",
  "driverSignatureDataUrl",
  "mechanicSignatureDataUrl",
  "driverReviewSignatureDataUrl",
  "truckDefects",
  "trailerDefects",
  "items",
  "vehicleId",
  "submittedVia",
]);

function dvirSummaryRows(record: Record<string, unknown>): DotFileRow[] {
  const defects = dvirDefectSummary(record);
  const rows: DotFileRow[] = [
    { label: "Inspection date", value: dvirInspectionDate(record) },
    { label: "DRIVER", value: dvirDriverName(record) },
    { label: "Defects", value: defects.yesNo },
  ];
  if (defects.hasDefects) {
    rows.push({ label: "Defect summary", value: defects.text, wide: true });
  }
  return rows;
}

function dvirSignatureRows(record: Record<string, unknown>): DotFileRow[] {
  const rows: DotFileRow[] = [];
  if (record.driverSignedAt) {
    rows.push({ label: "DRIVER signed", value: formatDotFileValue(record.driverSignedAt) });
  }
  if (record.mechanicSignedAt) {
    rows.push({ label: "Mechanic signed", value: formatDotFileValue(record.mechanicSignedAt) });
  }
  if (record.driverReviewSignedAt) {
    rows.push({
      label: "DRIVER review signed",
      value: formatDotFileValue(record.driverReviewSignedAt),
    });
  }
  return rows;
}

function str(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return "";
  return value.trim();
}

export function formatDotFileValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    if (value.every((entry) => typeof entry !== "object")) {
      return value.map((entry) => str(entry)).filter(Boolean).join(", ");
    }
    return `${value.length} on file`;
  }
  if (value && typeof value === "object") {
    return "";
  }
  const text = str(value);
  if (text === "") return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return formatFileDate(text);
  return text;
}

function rowsFor(
  record: Record<string, unknown>,
  fields: ReadonlyArray<{ key: string; label: string }>,
): DotFileRow[] {
  const rows: DotFileRow[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    const value = formatDotFileValue(record[field.key]);
    if (value === "" || seen.has(field.label)) continue;
    seen.add(field.label);
    rows.push({ label: field.label, value });
  }
  return rows;
}

function leftoverRows(record: Record<string, unknown>): DotFileRow[] {
  const rows: DotFileRow[] = [];
  for (const [key, raw] of Object.entries(record)) {
    if (HIDDEN_KEYS.has(key) || SECTIONED_KEYS.has(key)) continue;
    if (key.endsWith("Id") || key.endsWith("At")) continue;
    const value = formatDotFileValue(raw);
    if (value === "") continue;
    const label = key
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/^\w/, (ch) => ch.toUpperCase());
    rows.push({ label, value, wide: value.length > 80 });
  }
  return rows;
}

export function dotFileSubtitle(record: Record<string, unknown>): string {
  const category = dotRecordCategory(record);
  const job = str(record.jobTitle);
  const employee = str(record.employeeNumber);
  return [categoryLabel(category), job, employee ? `#${employee}` : ""]
    .filter((part) => part !== "")
    .join(" · ");
}

export function categoryLabel(category: DotCategory): string {
  switch (category) {
    case "drivers":
      return "DRIVERS (DQF)";
    case "drug-alcohol":
      return "Drug & Alcohol";
    case "dvirs":
      return "DVIRs";
    default:
      return category.replace(/^\w/, (ch) => ch.toUpperCase());
  }
}

export function buildDotFile(record: Record<string, unknown>): DotFileGroup[] {
  if (isDvirRecord(record)) {
    const groups: DotFileGroup[] = [
      {
        id: "dvir-summary",
        title: "Inspection summary",
        icon: "bx-clipboard",
        rows: dvirSummaryRows(record),
      },
      {
        id: "dvir-signatures",
        title: "Signatures",
        icon: "bx-pen",
        rows: dvirSignatureRows(record),
      },
    ];
    return groups.filter((group) => group.rows.length > 0);
  }

  const groups: Array<{ id: string; title: string; icon: string; fields?: DotFileRow[] }> = [
    { id: "identity", title: "Identity", icon: "bx-id-card", fields: rowsFor(record, IDENTITY_FIELDS) },
    { id: "license", title: "License", icon: "bx-credit-card", fields: rowsFor(record, LICENSE_FIELDS) },
    { id: "medical", title: "Medical", icon: "bx-plus-medical", fields: rowsFor(record, MEDICAL_FIELDS) },
    { id: "mvr", title: "MVR", icon: "bx-file", fields: rowsFor(record, MVR_FIELDS) },
    { id: "vehicle", title: "Vehicle", icon: "bx-car", fields: rowsFor(record, VEHICLE_FIELDS) },
    { id: "record", title: "Record", icon: "bx-clipboard", fields: rowsFor(record, RECORD_FIELDS) },
    { id: "details", title: "Details", icon: "bx-info-circle", fields: leftoverRows(record) },
  ];

  return groups
    .filter((group) => (group.fields ?? []).length > 0)
    .map((group) => ({
      id: group.id,
      title: group.title,
      icon: group.icon,
      rows: group.fields ?? [],
    }));
}

export function dotFileHeading(record: Record<string, unknown>): string {
  return dotDisplayName(record) || "DOT file";
}

export type DotFileFieldInput = "text" | "date" | "textarea" | "select";

export type DotFileFieldDef = {
  key: string;
  label: string;
  input?: DotFileFieldInput;
  wide?: boolean;
  options?: readonly string[];
};

export type DotFileEditSection = {
  id: string;
  title: string;
  fields: DotFileFieldDef[];
};

const EDIT_IDENTITY: DotFileFieldDef[] = IDENTITY_FIELDS.map((f) => ({
  ...f,
  input: f.key === "dateOfBirth" ? "date" : "text",
}));
const EDIT_LICENSE: DotFileFieldDef[] = LICENSE_FIELDS.map((f) => ({
  ...f,
  input: f.key === "licenseExpiryDate" ? "date" : "text",
}));
const EDIT_MEDICAL: DotFileFieldDef[] = MEDICAL_FIELDS.map((f) => ({
  ...f,
  input: f.key === "medicalCardExpiry" ? "date" : "text",
}));
const EDIT_MVR: DotFileFieldDef[] = MVR_FIELDS.map((f) => ({
  ...f,
  input: f.key.includes("Date") ? "date" : "text",
}));
const EDIT_VEHICLE: DotFileFieldDef[] = VEHICLE_FIELDS.map((f) => {
  if (f.key === "assetType") {
    return {
      ...f,
      input: "select",
      options: FLEET_ASSET_TYPE_OPTIONS,
    };
  }
  return { ...f, input: "text" };
});
const EDIT_RECORD: DotFileFieldDef[] = [
  { key: "title", label: "Record title", input: "text", wide: true },
  { key: "workerName", label: "Worker / DRIVER name", input: "text" },
  ...RECORD_FIELDS.map((f) => ({
    ...f,
    input: (f.key === "recordDate" ? "date" : "text") as DotFileFieldInput,
  })),
  { key: "notes", label: "Notes", input: "textarea", wide: true },
];

export function dotFileEditSections(record: Record<string, unknown>): DotFileEditSection[] {
  if (isDvirRecord(record)) {
    return [];
  }
  return [
    { id: "record", title: "Record", fields: EDIT_RECORD },
    { id: "identity", title: "Identity", fields: EDIT_IDENTITY },
    { id: "license", title: "License", fields: EDIT_LICENSE },
    { id: "medical", title: "Medical", fields: EDIT_MEDICAL },
    { id: "mvr", title: "MVR", fields: EDIT_MVR },
    { id: "vehicle", title: "Vehicle", fields: EDIT_VEHICLE },
  ];
}

export function dotFileDraftFromRecord(
  record: Record<string, unknown>,
  sections: DotFileEditSection[],
): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const section of sections) {
    for (const field of section.fields) {
      const raw = record[field.key];
      if (raw == null || raw === "") {
        draft[field.key] = "";
        continue;
      }
      if (typeof raw === "boolean") {
        draft[field.key] = raw ? "true" : "false";
        continue;
      }
      const text = String(raw).trim();
      draft[field.key] =
        field.input === "date" && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
    }
  }
  return draft;
}

export function dotFilePatchFromDraft(
  draft: Record<string, string>,
  sections: DotFileEditSection[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const section of sections) {
    for (const field of section.fields) {
      const value = draft[field.key];
      if (value === undefined) continue;
      const trimmed = value.trim();
      if (trimmed === "") {
        patch[field.key] = null;
        continue;
      }
      if (field.key === "conditionSatisfactory") {
        patch[field.key] = trimmed === "true";
        continue;
      }
      patch[field.key] = trimmed;
    }
  }
  const worker = String(patch.workerName ?? "").trim();
  const first = String(patch.firstName ?? "").trim();
  const last = String(patch.lastName ?? "").trim();
  const title = String(patch.title ?? "").trim();
  if (!title) {
    patch.title = worker || [first, last].filter(Boolean).join(" ") || undefined;
  }
  if (worker) {
    patch.driverName = worker;
    patch.personnelName = worker;
  }
  return patch;
}
