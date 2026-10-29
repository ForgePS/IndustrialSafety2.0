export const OBSERVATIONS_API = "/api/v1/industrial/observations";

export type ObservationOption = { value: string; label: string; help?: string; tone: string };

export const OBSERVATION_TYPE_OPTIONS: ReadonlyArray<ObservationOption> = [
  {
    value: "SAFE_BEHAVIOR",
    label: "Safe behavior",
    help: "Someone working safely - worth recognizing.",
    tone: "success",
  },
  {
    value: "UNSAFE_BEHAVIOR",
    label: "Unsafe behavior (at-risk act)",
    help: "A person doing something that could get them or others hurt.",
    tone: "danger",
  },
  {
    value: "UNSAFE_CONDITION",
    label: "Unsafe condition",
    help: "Something in the workplace that is unsafe right now.",
    tone: "danger",
  },
  {
    value: "HAZARD",
    label: "Hazard",
    help: "A source of potential harm that needs to be controlled.",
    tone: "warning",
  },
  {
    value: "NEAR_MISS",
    label: "Near miss",
    help: "An event that could have caused injury or damage but did not.",
    tone: "warning",
  },
  {
    value: "GOOD_CATCH",
    label: "Good catch / positive observation",
    help: "A problem spotted and stopped before it became an issue.",
    tone: "success",
  },
  {
    value: "ENVIRONMENTAL",
    label: "Environmental / housekeeping",
    help: "Spills, waste, clutter, blocked exits, and similar.",
    tone: "info",
  },
];

export const OBSERVATION_STATUS_OPTIONS: ReadonlyArray<ObservationOption> = [
  { value: "OPEN", label: "Open", tone: "warning" },
  { value: "IN_PROGRESS", label: "In progress", tone: "info" },
  { value: "CLOSED", label: "Closed", tone: "success" },
  { value: "ARCHIVED", label: "Archived", tone: "secondary" },
];

export const OBSERVATION_RISK_OPTIONS: ReadonlyArray<ObservationOption> = [
  {
    value: "low",
    label: "Low",
    help: "Unlikely to cause harm; fix when convenient.",
    tone: "success",
  },
  {
    value: "medium",
    label: "Medium",
    help: "Could cause a minor injury; fix soon.",
    tone: "warning",
  },
  {
    value: "high",
    label: "High",
    help: "Could cause a serious injury; fix today.",
    tone: "danger",
  },
  {
    value: "critical",
    label: "Critical",
    help: "Could cause death or permanent injury; stop work until fixed.",
    tone: "dark",
  },
];

/** Used until the tenant's category list loads (matches the API default list). */
export const DEFAULT_OBSERVATION_CATEGORIES: ReadonlyArray<string> = [
  "PPE",
  "Housekeeping",
  "Ergonomics",
  "Lifting",
  "LOTO",
  "Forklift / Mobile equipment",
  "Machine guarding",
  "Electrical",
  "Chemical",
  "Fall protection",
  "Fire",
  "Driving",
  "Other",
];

const LEGACY_TYPES: Record<string, string> = {
  SAFE: "SAFE_BEHAVIOR",
  UNSAFE: "UNSAFE_BEHAVIOR",
  POSITIVE: "GOOD_CATCH",
};

const LEGACY_STATUSES: Record<string, string> = {
  ACTIVE: "OPEN",
  AT_RISK: "OPEN",
  NEW: "OPEN",
  INPROGRESS: "IN_PROGRESS",
  COMPLETED: "CLOSED",
  RESOLVED: "CLOSED",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function optionFor(options: ReadonlyArray<ObservationOption>, value: string) {
  return options.find((o) => o.value === value);
}

export function normalizeObservationType(raw: unknown): string {
  const key = text(raw)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (!key) return "";
  const mapped = LEGACY_TYPES[key] ?? key;
  return optionFor(OBSERVATION_TYPE_OPTIONS, mapped) ? mapped : "";
}

export function normalizeObservationStatus(raw: unknown): string {
  const key = text(raw)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const mapped = LEGACY_STATUSES[key] ?? key;
  return optionFor(OBSERVATION_STATUS_OPTIONS, mapped) ? mapped : "OPEN";
}

export function normalizeObservationRisk(raw: unknown): string {
  const key = text(raw).toLowerCase();
  if (key === "moderate") return "medium";
  if (key === "severe" || key === "extreme") return "critical";
  return optionFor(OBSERVATION_RISK_OPTIONS, key) ? key : "";
}

export function observationTypeOption(value: unknown) {
  return optionFor(OBSERVATION_TYPE_OPTIONS, normalizeObservationType(value));
}

export function observationStatusOption(value: unknown) {
  return optionFor(OBSERVATION_STATUS_OPTIONS, normalizeObservationStatus(value))!;
}

export function observationRiskOption(value: unknown) {
  return optionFor(OBSERVATION_RISK_OPTIONS, normalizeObservationRisk(value));
}

/** Keeps a legacy/removed category selectable on records that already use it. */
export function observationCategoryOptions(
  categories: ReadonlyArray<string>,
  current?: string,
): string[] {
  const list = [...categories];
  const value = text(current);
  if (value && !list.some((c) => c.toLowerCase() === value.toLowerCase())) list.push(value);
  return list;
}

/** `atFault` absent = follow the observation type (Unsafe behavior → at fault). */
export type ObservedPerson = { personnelId: string | null; name: string; atFault?: boolean };

const POSITIVE_OBSERVATION_TYPES = new Set(["SAFE_BEHAVIOR", "GOOD_CATCH"]);

export function isPositiveObservationType(type: unknown): boolean {
  return POSITIVE_OBSERVATION_TYPES.has(normalizeObservationType(type));
}

/** Same rule as the API: positive observations never put anyone at fault. */
export function observedPersonAtFault(person: ObservedPerson, observationType: unknown): boolean {
  const type = normalizeObservationType(observationType);
  if (POSITIVE_OBSERVATION_TYPES.has(type)) return false;
  return person.atFault ?? type === "UNSAFE_BEHAVIOR";
}

export type ObservationPhoto = {
  id: string;
  fileName: string;
  contentType: string;
  dataUrl: string;
  [key: string]: unknown;
};

/** Matches the API root-cause list. */
export const OBSERVATION_ROOT_CAUSE_OPTIONS: ReadonlyArray<string> = [
  "Lack of training or awareness",
  "Procedure not followed",
  "No procedure or unclear procedure",
  "Equipment or tool condition",
  "PPE not available",
  "PPE not used",
  "Housekeeping",
  "Time pressure / shortcut",
  "Workplace design or layout",
  "Not applicable (positive observation)",
  "Other",
];

export const OBSERVATION_COACHING_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "na", label: "N/A" },
];

export type ObservationFollowUp = {
  rootCause: string;
  rootCauseDetail: string;
  correctiveAction: string;
  preventiveAction: string;
  employeeCoached: string;
  completedDate: string;
  notes: string;
  completedByName: string;
  signatureDataUrl: string;
  afterPhotos: ObservationPhoto[];
  savedAt: string;
  completedAt: string;
  completedVia: string;
};

export function emptyObservationFollowUp(completedByName = ""): ObservationFollowUp {
  return {
    rootCause: "",
    rootCauseDetail: "",
    correctiveAction: "",
    preventiveAction: "",
    employeeCoached: "",
    completedDate: "",
    notes: "",
    completedByName,
    signatureDataUrl: "",
    afterPhotos: [],
    savedAt: "",
    completedAt: "",
    completedVia: "",
  };
}

export function mapObservationFollowUp(raw: unknown): ObservationFollowUp {
  const obj: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    rootCause: text(obj.rootCause),
    rootCauseDetail: text(obj.rootCauseDetail),
    correctiveAction: text(obj.correctiveAction),
    preventiveAction: text(obj.preventiveAction),
    employeeCoached: text(obj.employeeCoached),
    completedDate: text(obj.completedDate),
    notes: text(obj.notes),
    completedByName: text(obj.completedByName),
    signatureDataUrl: text(obj.signatureDataUrl),
    afterPhotos: photos(obj.afterPhotos),
    savedAt: text(obj.savedAt),
    completedAt: text(obj.completedAt),
    completedVia: text(obj.completedVia),
  };
}

/** Editable follow-up fields sent to the API (timestamps are server-owned). */
export function followUpPayload(f: ObservationFollowUp): Record<string, unknown> {
  return {
    rootCause: f.rootCause,
    rootCauseDetail: f.rootCauseDetail.trim(),
    correctiveAction: f.correctiveAction.trim(),
    preventiveAction: f.preventiveAction.trim(),
    employeeCoached: f.employeeCoached,
    completedDate: f.completedDate,
    notes: f.notes.trim(),
    completedByName: f.completedByName.trim(),
    signatureDataUrl: f.signatureDataUrl,
    afterPhotos: f.afterPhotos,
  };
}

/** First missing item required to close out, or null (same rules as the API). */
export function followUpMissing(f: ObservationFollowUp): string | null {
  if (!f.correctiveAction.trim()) return "Describe the corrective action taken.";
  if (!f.completedDate) return "Enter the date the follow-up was completed.";
  if (!f.completedByName.trim()) return "Enter the supervisor's name.";
  if (!f.signatureDataUrl) return "Sign the follow-up to close it out.";
  return null;
}

export function todayDateInput(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export type ObservationRecord = {
  id: string;
  title: string;
  status: string;
  observationType: string;
  category: string;
  description: string;
  riskLevel: string;
  observedAt: string;
  siteId: string;
  siteName: string;
  divisionName: string;
  departmentId: string;
  departmentName: string;
  area: string;
  reportedBy: string;
  immediateActions: string;
  peopleObserved: ObservedPerson[];
  photos: ObservationPhoto[];
  photoCount: number;
  fieldSource: string;
  assignedToPersonnelId: string;
  assignedToName: string;
  assignedToEmail: string;
  assignedAt: string;
  lastEmailedAt: string;
  lastEmailedTo: string[];
  followUp: ObservationFollowUp;
  /** From the list query, which omits the full follow-up. */
  followUpCompletedAt: string;
  followUpSavedAt: string;
  closedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ObservationAssignee = { personnelId: string; name: string; email: string };

/** The department contact acts as its supervisor; null when none is set. */
export function departmentSupervisor(
  dept:
    | {
        contactPersonnelId?: string | null;
        contactName?: string | null;
        contactEmail?: string | null;
      }
    | null
    | undefined,
): ObservationAssignee | null {
  if (!dept) return null;
  const personnelId = text(dept.contactPersonnelId);
  const name = text(dept.contactName);
  if (!personnelId && !name) return null;
  return { personnelId, name: name || "Department supervisor", email: text(dept.contactEmail) };
}

export function sameAssignee(
  form: Pick<ObservationFormState, "assignedToPersonnelId" | "assignedToName">,
  who: ObservationAssignee | null,
): boolean {
  if (!who) return !form.assignedToPersonnelId && !form.assignedToName.trim();
  if (who.personnelId || form.assignedToPersonnelId)
    return who.personnelId === form.assignedToPersonnelId;
  return who.name.toLowerCase() === form.assignedToName.trim().toLowerCase();
}

export function splitEmailList(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function people(raw: unknown): ObservedPerson[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      const obj: Record<string, unknown> =
        p && typeof p === "object" ? (p as Record<string, unknown>) : { name: p };
      const person: ObservedPerson = {
        personnelId: text(obj.personnelId) || null,
        name: text(obj.name ?? obj.displayName),
      };
      if (typeof obj.atFault === "boolean") person.atFault = obj.atFault;
      return person;
    })
    .filter((p) => p.name || p.personnelId);
}

function photos(raw: unknown): ObservationPhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is ObservationPhoto =>
      Boolean(p) &&
      typeof p === "object" &&
      text((p as ObservationPhoto).dataUrl).startsWith("data:image/"),
  );
}

export function mapObservationRecord(row: Record<string, unknown>): ObservationRecord {
  const photoList = photos(row.photos);
  const followUp = mapObservationFollowUp(row.followUp);
  return {
    id: text(row.id),
    title: text(row.title),
    status: normalizeObservationStatus(row.status),
    observationType: normalizeObservationType(row.observationType),
    category: text(row.category),
    description: text(row.description),
    riskLevel: normalizeObservationRisk(row.riskLevel),
    observedAt: text(row.observedAt),
    siteId: text(row.siteId),
    siteName: text(row.siteName ?? row.location),
    divisionName: text(row.divisionName),
    departmentId: text(row.departmentId),
    departmentName: text(row.departmentName),
    area: text(row.area),
    reportedBy: text(row.reportedBy),
    immediateActions: text(row.immediateActions),
    peopleObserved: people(row.peopleObserved),
    photos: photoList,
    photoCount: typeof row.photoCount === "number" ? row.photoCount : photoList.length,
    fieldSource: text(row.fieldSource),
    assignedToPersonnelId: text(row.assignedToPersonnelId),
    assignedToName: text(row.assignedToName),
    assignedToEmail: text(row.assignedToEmail),
    assignedAt: text(row.assignedAt),
    lastEmailedAt: text(row.lastEmailedAt),
    lastEmailedTo: Array.isArray(row.lastEmailedTo)
      ? row.lastEmailedTo.map(text).filter(Boolean)
      : [],
    followUp,
    followUpCompletedAt: text(row.followUpCompletedAt) || followUp.completedAt,
    followUpSavedAt: text(row.followUpSavedAt) || followUp.savedAt,
    closedAt: text(row.closedAt),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
  };
}

export type ObservationFormState = {
  observationType: string;
  category: string;
  description: string;
  observedAt: string;
  siteId: string;
  siteName: string;
  divisionName: string;
  departmentId: string;
  departmentName: string;
  area: string;
  riskLevel: string;
  peopleObserved: ObservedPerson[];
  immediateActions: string;
  reportedBy: string;
  status: string;
  photos: ObservationPhoto[];
  assignedToPersonnelId: string;
  assignedToName: string;
  assignedToEmail: string;
};

/** `datetime-local` input value in the browser's local time zone. */
export function toDateTimeLocal(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function emptyObservationForm(
  reportedBy = "",
  now: Date = new Date(),
): ObservationFormState {
  return {
    observationType: "",
    category: "",
    description: "",
    observedAt: toDateTimeLocal(now),
    siteId: "",
    siteName: "",
    divisionName: "",
    departmentId: "",
    departmentName: "",
    area: "",
    riskLevel: "",
    peopleObserved: [],
    immediateActions: "",
    reportedBy,
    status: "OPEN",
    photos: [],
    assignedToPersonnelId: "",
    assignedToName: "",
    assignedToEmail: "",
  };
}

export function observationFormFromRecord(record: ObservationRecord): ObservationFormState {
  return {
    observationType: record.observationType,
    category: record.category,
    description: record.description,
    observedAt: toDateTimeLocal(record.observedAt || record.createdAt),
    siteId: record.siteId,
    siteName: record.siteName,
    divisionName: record.divisionName,
    departmentId: record.departmentId,
    departmentName: record.departmentName,
    area: record.area,
    riskLevel: record.riskLevel,
    peopleObserved: record.peopleObserved,
    immediateActions: record.immediateActions,
    reportedBy: record.reportedBy,
    status: record.status,
    photos: record.photos,
    assignedToPersonnelId: record.assignedToPersonnelId,
    assignedToName: record.assignedToName,
    assignedToEmail: record.assignedToEmail,
  };
}

/** Returns a user-facing message for the first missing required field, or null. */
export function validateObservationForm(form: ObservationFormState): string | null {
  if (!form.observationType) return "Choose an observation type.";
  if (!form.category) return "Choose a category.";
  if (!form.description.trim()) return "Describe what was observed.";
  if (!form.riskLevel) return "Choose a risk level.";
  const email = form.assignedToEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid supervisor email.";
  return null;
}

export function observationPayloadFromForm(form: ObservationFormState): Record<string, unknown> {
  const observedAt = form.observedAt ? new Date(form.observedAt) : null;
  return {
    observationType: form.observationType,
    category: form.category,
    description: form.description.trim(),
    observedAt: observedAt && !Number.isNaN(observedAt.getTime()) ? observedAt.toISOString() : "",
    siteId: form.siteId || null,
    siteName: form.siteName,
    location: form.siteName,
    divisionName: form.divisionName,
    departmentId: form.departmentId,
    departmentName: form.departmentName,
    area: form.area.trim(),
    riskLevel: form.riskLevel,
    peopleObserved: form.peopleObserved,
    immediateActions: form.immediateActions.trim(),
    reportedBy: form.reportedBy.trim(),
    status: form.status,
    photos: form.photos,
    assignedToPersonnelId: form.assignedToPersonnelId || null,
    assignedToName: form.assignedToName.trim(),
    assignedToEmail: form.assignedToEmail.trim(),
  };
}

export function formatObservedAt(value: string): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}
