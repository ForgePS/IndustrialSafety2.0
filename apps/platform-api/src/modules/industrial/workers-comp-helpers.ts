/**
 * Workers' compensation claim summary helpers (shared API + web shapes).
 */

export type WorkersCompClaimSummary = {
  carrierId: string;
  carrierName: string;
  claimNumber: string;
  adjuster: string;
  dateOfInjury: string;
  bodyParts: string;
  notes: string;
  lostTimeStart: string;
  lostTimeEnd: string;
};

export const EMPTY_WC_CLAIM_SUMMARY: WorkersCompClaimSummary = {
  carrierId: "",
  carrierName: "",
  claimNumber: "",
  adjuster: "",
  dateOfInjury: "",
  bodyParts: "",
  notes: "",
  lostTimeStart: "",
  lostTimeEnd: "",
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

/** Normalize personnel / WC sex values to OSHA-compatible MALE | FEMALE. */
export function normalizeWorkersCompGender(value: unknown): string {
  const upper = asText(value).toUpperCase();
  if (upper === "M" || upper === "MALE") return "MALE";
  if (upper === "F" || upper === "FEMALE") return "FEMALE";
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Unwrap double-encoded jsonb strings from the industrial importer. */
export function unwrapWorkersCompSourcePayload(raw: unknown): Record<string, unknown> {
  let current: unknown = raw;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (!trimmed) return {};
      try {
        current = JSON.parse(trimmed);
        continue;
      } catch {
        return {};
      }
    }
    const obj = asRecord(current);
    if (obj) return obj;
    return {};
  }
  return {};
}

export function parseWorkersCompClaimSummary(raw: unknown): WorkersCompClaimSummary {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_WC_CLAIM_SUMMARY };
  }
  const row = raw as Record<string, unknown>;
  const adjusterFromList =
    Array.isArray(row.adjusters) && row.adjusters[0] && typeof row.adjusters[0] === "object"
      ? asText((row.adjusters[0] as Record<string, unknown>).name)
      : "";
  return {
    carrierId: asText(row.carrierId),
    carrierName: asText(row.carrierName),
    claimNumber: asText(row.claimNumber),
    adjuster: asText(row.adjusterName) || asText(row.adjuster) || adjusterFromList,
    dateOfInjury: asText(row.dateOfInjury).slice(0, 10),
    bodyParts: asText(row.bodyParts) || asText(row.bodyPart),
    notes: asText(row.notes),
    lostTimeStart: asText(row.lostTimeStart).slice(0, 10),
    lostTimeEnd: asText(row.lostTimeEnd).slice(0, 10),
  };
}

/**
 * Normalize Firebase workersCompCases source_payload into column-ready fields.
 * Product rule: Claim Number = Case Number (prefer insurance claim # when present).
 */
export function hydrateWorkersCompFromSource(input: {
  caseNumber?: string | null;
  status?: string | null;
  severity?: string | null;
  workflowStage?: string | null;
  daysAway?: number | null;
  restrictedDays?: number | null;
  claimSummary?: unknown;
  sourcePayload?: unknown;
  reportedAt?: string | Date | null;
}): {
  caseNumber: string;
  status: string;
  severity: string;
  workflowStage: string;
  daysAway: number | null;
  restrictedDays: number | null;
  reportedAt: string | null;
  claimSummary: WorkersCompClaimSummary;
  workerName: string;
  locationText: string;
  notes: string;
  dateOfBirth: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  gender: string;
  nextAction: { label: string; dueDate: string; owner: string; priority: string } | null;
  firebasePersonnelId: string;
  sourcePayload: Record<string, unknown>;
} {
  const payload = unwrapWorkersCompSourcePayload(input.sourcePayload);
  const claim = asRecord(payload.claim) ?? {};
  const employee = asRecord(payload.employee) ?? {};
  const intake = asRecord(payload.intake) ?? {};
  const next = asRecord(payload.nextAction);

  const existingSummary = parseWorkersCompClaimSummary(input.claimSummary);
  const fromClaim = parseWorkersCompClaimSummary({
    ...claim,
    dateOfInjury: asText(intake.incidentDate) || asText(claim.dateOfInjury),
    bodyParts:
      [asText(intake.bodyPart), asText(intake.bodySide)].filter(Boolean).join(" ").trim() ||
      asText(claim.bodyParts),
  });
  // Prefer saved claim_summary over Firebase/source_payload so overview edits persist.
  // Source fills only fields that are still empty on the case row.
  const claimSummary: WorkersCompClaimSummary = {
    ...EMPTY_WC_CLAIM_SUMMARY,
    ...Object.fromEntries(
      Object.entries(fromClaim).filter(([, v]) => typeof v === "string" && v.trim() !== ""),
    ),
    ...Object.fromEntries(
      Object.entries(existingSummary).filter(([, v]) => typeof v === "string" && v.trim() !== ""),
    ),
  } as WorkersCompClaimSummary;

  const caseNumber =
    asText(input.caseNumber) ||
    asText(claimSummary.claimNumber) ||
    asText(claim.claimNumber) ||
    asText(payload.caseNumber);
  claimSummary.claimNumber = caseNumber;

  const stageRaw = asText(payload.workflowStage) || asText(input.workflowStage);
  let status: string = normalizeWcCaseStatus(input.status);
  if (stageRaw.toLowerCase() === "closed") status = "CLOSED";

  const workflowStage = (() => {
    const s = stageRaw.toLowerCase();
    if (s === "closed") return "CLOSED";
    if (s === "reported" || s === "intake") return "INTAKE";
    if (s.includes("medical") && s.includes("review")) return "MEDICAL_REVIEW";
    if (s.includes("treat")) return "TREATMENT";
    if (s.includes("return") || s.includes("rtw")) return "RETURN_TO_WORK";
    if (s.includes("claim")) return "CLAIM_ADMIN";
    if (s.includes("invest")) return "INVESTIGATION";
    return stageRaw.toUpperCase() || "INTAKE";
  })();

  const workerName =
    asText(payload.workerName) ||
    asText(employee.employeeName) ||
    asText(employee.name) ||
    "";
  const dateOfBirth =
    asText(payload.dateOfBirth).slice(0, 10) ||
    asText(employee.dateOfBirth).slice(0, 10) ||
    asText(employee.dob).slice(0, 10);
  const street =
    asText(payload.street) ||
    asText(payload.address) ||
    asText(employee.street) ||
    asText(employee.address);
  const city = asText(payload.city) || asText(employee.city);
  const state = asText(payload.state) || asText(employee.state);
  const zip =
    asText(payload.zip) ||
    asText(payload.zipCode) ||
    asText(employee.zip) ||
    asText(employee.zipCode);
  const genderRaw =
    asText(payload.gender) ||
    asText(payload.sex) ||
    asText(employee.gender) ||
    asText(employee.sex);
  const genderUpper = genderRaw.toUpperCase();
  const gender =
    genderUpper === "M" || genderUpper === "MALE"
      ? "MALE"
      : genderUpper === "F" || genderUpper === "FEMALE"
        ? "FEMALE"
        : "";
  const locationText =
    asText(payload.locationText) ||
    asText(intake.exactLocation) ||
    asText(payload.site) ||
    "";
  const notes =
    asText(payload.notes) ||
    asText(intake.injuryNarrative) ||
    asText(claim.notes) ||
    "";

  const reportedRaw =
    asText(intake.incidentDate) ||
    asText(intake.reportedDate) ||
    (typeof input.reportedAt === "string" ? input.reportedAt : "") ||
    (input.reportedAt instanceof Date ? input.reportedAt.toISOString() : "");
  const reportedAt = reportedRaw ? reportedRaw.slice(0, 10) : null;

  const daysAway =
    input.daysAway != null && Number.isFinite(Number(input.daysAway))
      ? Number(input.daysAway)
      : payload.daysAway != null && Number.isFinite(Number(payload.daysAway))
        ? Number(payload.daysAway)
        : null;
  const restrictedDays =
    input.restrictedDays != null && Number.isFinite(Number(input.restrictedDays))
      ? Number(input.restrictedDays)
      : payload.restrictedDays != null && Number.isFinite(Number(payload.restrictedDays))
        ? Number(payload.restrictedDays)
        : null;

  const nextAction =
    next && (asText(next.label) || asText(next.dueDate))
      ? {
          label: asText(next.label),
          dueDate: asText(next.dueDate).slice(0, 10),
          owner: asText(next.owner),
          priority: asText(next.priority) || "MEDIUM",
        }
      : null;

  const firebasePersonnelId =
    asText(payload.personnelId) || asText(employee.personnelId) || "";

  const sourcePayload: Record<string, unknown> = {
    ...payload,
    workerName,
    locationText,
    notes,
    dateOfBirth,
    street,
    city,
    state,
    zip,
    gender,
    caseNumber,
    claimSummary,
    nextAction,
  };

  return {
    caseNumber,
    status: status.toUpperCase(),
    severity: asText(input.severity) || asText(payload.severity) || "",
    workflowStage,
    daysAway,
    restrictedDays,
    reportedAt,
    claimSummary,
    workerName,
    locationText,
    notes,
    dateOfBirth,
    street,
    city,
    state,
    zip,
    gender,
    nextAction,
    firebasePersonnelId,
    sourcePayload,
  };
}

/** Product rule: when a Claim # / case number is set, keep claimSummary.claimNumber aligned.
 *  Empty values stay empty so Claim # can be entered later when insurance assigns it.
 */
export function syncWorkersCompClaimNumber(
  caseNumber: string | null | undefined,
  claimSummary: WorkersCompClaimSummary,
): WorkersCompClaimSummary {
  const number = asText(caseNumber);
  if (number) return { ...claimSummary, claimNumber: number };
  return { ...claimSummary, claimNumber: asText(claimSummary.claimNumber) };
}

/**
 * Resolve the single claim/case number from create/update body fields.
 * Prefers caseNumber, then claimSummary.claimNumber / claimNumber.
 */
export function resolveWorkersCompCaseNumber(
  body: Record<string, unknown>,
  existingCaseNumber?: string | null,
): string | null {
  if (typeof body.caseNumber === "string" && body.caseNumber.trim()) {
    return body.caseNumber.trim();
  }
  const fromSummary = parseWorkersCompClaimSummary(body.claimSummary ?? body).claimNumber;
  if (fromSummary) return fromSummary;
  if (typeof body.claimNumber === "string" && body.claimNumber.trim()) {
    return body.claimNumber.trim();
  }
  if (existingCaseNumber != null && String(existingCaseNumber).trim()) {
    return String(existingCaseNumber).trim();
  }
  return null;
}

export function mergeWorkersCompClaimSummary(
  existing: unknown,
  patch: unknown,
): WorkersCompClaimSummary {
  const base = parseWorkersCompClaimSummary(existing);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const next = parseWorkersCompClaimSummary({ ...base, ...(patch as Record<string, unknown>) });
  return next;
}

export const WC_CASE_STATUSES = ["ACTIVE", "CLOSED", "ARCHIVED"] as const;

export type WcCaseStatus = (typeof WC_CASE_STATUSES)[number];

/** Case status is ACTIVE, CLOSED, or ARCHIVED; retired values (OPEN, DRAFT, RESTRICTED, LOST_TIME) read as ACTIVE. */
export function normalizeWcCaseStatus(raw: unknown): WcCaseStatus {
  const s = asText(raw).toUpperCase();
  return s === "CLOSED" || s === "ARCHIVED" ? s : "ACTIVE";
}

export const WC_WORKFLOW_STAGES = [
  "INTAKE",
  "INVESTIGATION",
  "MEDICAL_REVIEW",
  "TREATMENT",
  "RETURN_TO_WORK",
  "CLAIM_ADMIN",
  "CLOSED",
] as const;

/** Worker identity key for duplicate-case detection: trimmed, collapsed whitespace, lowercase. */
export function normalizeWorkersCompWorkerKey(name: unknown): string {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Injury date key (YYYY-MM-DD) for duplicate-case detection; falls back to reportedAt (UTC). */
export function workersCompInjuryDateKey(dateOfInjury: unknown, reportedAt: Date | null): string {
  const raw = String(dateOfInjury ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (reportedAt && !Number.isNaN(reportedAt.getTime())) {
    return reportedAt.toISOString().slice(0, 10);
  }
  return "";
}

export function isOpenWcStatus(status: string): boolean {
  const s = status.trim().toUpperCase();
  return s === "OPEN" || s === "ACTIVE" || s === "RESTRICTED" || s === "LOST_TIME" || s === "DRAFT";
}

/** YYYY-MM-DD in local calendar for a Date. */
export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Thursday of the calendar week containing `date` (local timezone).
 * Sunday–Wednesday target the upcoming Thursday; Thursday–Saturday use that week's Thursday.
 */
export function thursdayWeekOf(date: Date = new Date()): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay(); // 0 Sun .. 6 Sat
  const diffToThursday = 4 - day;
  local.setDate(local.getDate() + diffToThursday);
  return toLocalIsoDate(local);
}

export function parseIsoDateLocal(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** Normalize a weekOf query to a Thursday ISO date (or current Thursday). */
export function normalizeThursdayWeekOf(raw: unknown, now: Date = new Date()): string {
  if (typeof raw === "string" && raw.trim()) {
    const parsed = parseIsoDateLocal(raw.trim().slice(0, 10));
    if (parsed) return thursdayWeekOf(parsed);
  }
  return thursdayWeekOf(now);
}

export type WcWeeklyUpdateRowStatus = "complete" | "due" | "overdue";

/**
 * complete = note saved for weekOf;
 * overdue = no note and local today is on/after that Thursday;
 * due = no note and Thursday is still in the future this week.
 */
export function weeklyUpdateRowStatus(
  weekOf: string,
  hasUpdate: boolean,
  now: Date = new Date(),
): WcWeeklyUpdateRowStatus {
  if (hasUpdate) return "complete";
  const thursday = parseIsoDateLocal(weekOf);
  if (!thursday) return "due";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today.getTime() >= thursday.getTime()) return "overdue";
  return "due";
}

/** Tenant setting key for weekly open-case status email. */
export const WC_WEEKLY_STATUS_SETTING_KEY = "workers_comp.weekly_status";
export const WC_WEEKLY_STATUS_NAMESPACE = "industrial";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export type WorkersCompWeeklyStatusSettings = {
  enabled: boolean;
  recipients: string[];
  lastSentAt: string | null;
};

export const EMPTY_WC_WEEKLY_STATUS_SETTINGS: WorkersCompWeeklyStatusSettings = {
  enabled: false,
  recipients: [],
  lastSentAt: null,
};

export function normalizeEmailAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

/** Deduped, validated recipient list (order preserved). */
export function normalizeEmailRecipients(raw: unknown): string[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,;\n]+/)
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const email = normalizeEmailAddress(entry);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function parseWorkersCompWeeklyStatusSettings(
  raw: unknown,
): WorkersCompWeeklyStatusSettings {
  const obj = asRecord(raw) ?? {};
  const lastSent =
    typeof obj.lastSentAt === "string" && obj.lastSentAt.trim()
      ? obj.lastSentAt.trim()
      : null;
  return {
    enabled: obj.enabled === true || obj.enabled === "true" || obj.enabled === 1,
    recipients: normalizeEmailRecipients(obj.recipients),
    lastSentAt: lastSent,
  };
}

export type WorkersCompWeeklyStatusCaseRow = {
  caseNumber?: string | null;
  workerName?: string | null;
  status?: string | null;
  workflowStage?: string | null;
  severity?: string | null;
  daysAway?: number | null;
  restrictedDays?: number | null;
  claimSummary?: Partial<WorkersCompClaimSummary> | null;
  locationText?: string | null;
  reportedAt?: string | null;
  /** Prefer Thursday weekly-update notes; fall back to case notes. */
  notes?: string | null;
  weeklyNotes?: string | null;
  weekOf?: string | null;
  weeklyUpdateStatus?: WcWeeklyUpdateRowStatus | null;
  /** Original incident narrative (linked incident description or WC intake narrative). */
  incidentNarrative?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Original narrative from an incident source payload (or WC intake fallback). */
export function incidentNarrativeFromPayload(raw: unknown): string {
  const payload = unwrapWorkersCompSourcePayload(raw);
  const intake = asRecord(payload.intake) ?? {};
  return (
    asText(payload.description) ||
    asText(payload.IncidentDescription) ||
    asText(payload.WorkDayDetails) ||
    asText(intake.injuryNarrative)
  );
}

function locationCompareKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const BODY_PART_WORDS = new Set(
  (
    "head scalp forehead face eye eyes eyelid ear ears nose mouth lip lips jaw cheek chin tooth teeth " +
    "neck throat shoulder shoulders collarbone clavicle arm arms upperarm forearm forearms elbow elbows " +
    "wrist wrists hand hands palm palms finger fingers fingertip fingertips thumb thumbs knuckle knuckles " +
    "digit digits pinky nail nails chest rib ribs sternum abdomen abdominal stomach belly back spine " +
    "lumbar thoracic cervical sacrum tailbone coccyx torso trunk hip hips pelvis groin buttock buttocks " +
    "leg legs thigh thighs hamstring hamstrings knee knees kneecap shin shins calf calves ankle ankles " +
    "achilles foot feet heel heels toe toes arch skin body"
  ).split(" "),
);

const BODY_PART_QUALIFIERS = new Set(
  (
    "left right l r lt rt both bilateral front rear upper lower inner outer middle index ring little " +
    "big great small side sides and or with of the area region multiple parts part dominant non " +
    "anterior posterior lateral medial top bottom"
  ).split(" "),
);

/**
 * True when text is only anatomy words + qualifiers (e.g. "Right hand / wrist",
 * "L index finger", "left-hand-front"). Place names with any other word
 * ("Back dock", "Head office") are not body parts.
 */
export function looksLikeBodyPartText(value: unknown): boolean {
  const tokens = asText(value).toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (tokens.length === 0) return false;
  let hasBodyWord = false;
  for (const token of tokens) {
    if (BODY_PART_WORDS.has(token)) hasBodyWord = true;
    else if (!BODY_PART_QUALIFIERS.has(token)) return false;
  }
  return hasBodyWord;
}

function bodyPartTextsFromIncidentPayload(payload: Record<string, unknown>): string[] {
  const texts = [
    asText(payload.bodyParts),
    asText(payload.injuriesFront),
    asText(payload.injuriesBack),
    asText(payload.InjuriesFront),
    asText(payload.InjuriesBack),
  ];
  if (Array.isArray(payload.bodyLocations)) {
    const ids = payload.bodyLocations.filter((v): v is string => typeof v === "string");
    texts.push(ids.join(", "));
    // Incidents with marked body locations store the body-part label in `location`.
    if (ids.length > 0) texts.push(asText(payload.location));
  }
  return texts.filter(Boolean);
}

/**
 * Where the incident happened (department / area / division / detail / site),
 * never the injured body part. New incidents store body parts in `location`.
 */
export function incidentPlaceFromPayload(raw: unknown, title?: string | null): string {
  const payload = unwrapWorkersCompSourcePayload(raw);
  const bodyKeys = new Set(bodyPartTextsFromIncidentPayload(payload).map(locationCompareKey));
  const dept = asText(payload.departmentName) || asText(payload.DepartmentName);
  const area = asText(payload.community) || asText(payload.Community);
  const composed =
    dept && area && dept.toLowerCase() !== area.toLowerCase() ? `${dept} - ${area}` : dept || area;
  const titleParts = asText(title)
    .replace(/^\d{2}[-/]\d{2}[-/]\d{2}\s+/, "")
    .split(/\s+-\s+/);
  const titleLocation = titleParts.length >= 2 ? titleParts.slice(1).join(" - ").trim() : "";
  const candidates = [
    composed,
    asText(payload.division) || asText(payload.Division),
    asText(payload.locationDetail) || asText(payload.LocationDetail),
    titleLocation,
    asText(payload.location),
    asText(payload.IncidentLocationName),
    asText(payload.site),
  ];
  for (const candidate of candidates) {
    if (
      candidate &&
      !bodyKeys.has(locationCompareKey(candidate)) &&
      !looksLikeBodyPartText(candidate)
    ) {
      return candidate;
    }
  }
  return "";
}

/** Weekly report "Location": the case location unless it is body-part text, else the incident's place. */
export function resolveWorkersCompReportLocation(input: {
  locationText?: string | null | undefined;
  claimBodyParts?: string | null | undefined;
  incidentPayload?: unknown;
  incidentTitle?: string | null | undefined;
  /** WC case source payload; intake may carry department / area fields. */
  casePayload?: unknown;
}): string {
  const incident = unwrapWorkersCompSourcePayload(input.incidentPayload);
  const bodyKeys = new Set(
    [asText(input.claimBodyParts), ...bodyPartTextsFromIncidentPayload(incident)]
      .filter(Boolean)
      .map(locationCompareKey),
  );
  const caseLocation = asText(input.locationText);
  if (
    caseLocation &&
    !bodyKeys.has(locationCompareKey(caseLocation)) &&
    !looksLikeBodyPartText(caseLocation)
  ) {
    return caseLocation;
  }
  const fromIncident = input.incidentPayload
    ? incidentPlaceFromPayload(incident, input.incidentTitle)
    : "";
  if (fromIncident) return fromIncident;
  if (!input.casePayload) return "";
  const casePayload = unwrapWorkersCompSourcePayload(input.casePayload);
  const intake = asRecord(casePayload.intake) ?? {};
  const place = incidentPlaceFromPayload({
    ...intake,
    ...casePayload,
    location: "",
    locationText: "",
  });
  return place && !bodyKeys.has(locationCompareKey(place)) ? place : "";
}

export const WC_WEEKLY_NARRATIVE_SUMMARY_MAX = 280;

/** Plain-text, single-line summary of an incident narrative, truncated at a word boundary. */
export function summarizeIncidentNarrative(
  value: unknown,
  max: number = WC_WEEKLY_NARRATIVE_SUMMARY_MAX,
): string {
  const plain = asText(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.replace(/[\s.,;:-]+$/, "")}…`;
}

const WC_SEVERITY_LABELS: Record<string, { name: string; osha: string }> = {
  minor: { name: "Minor", osha: "Non-Recordable (First Aid)" },
  moderate: { name: "Moderate", osha: "Recordable (Medical Treatment Only)" },
  restricted: { name: "Restricted", osha: "Recordable (Job Transfer or Restriction)" },
  lost_time: { name: "Lost Time", osha: "Recordable (Days Away From Work)" },
};

/** Severity as a lowercase key (e.g. "Lost Time" → "lost_time"). */
export function wcSeverityKey(raw: unknown): string {
  return asText(raw).toLowerCase().replace(/[\s-]+/g, "_");
}

/** Severity name + OSHA classification; unknown legacy values pass through as the name. */
export function workersCompSeverityParts(raw: unknown): { name: string; osha: string } {
  const value = asText(raw);
  const known = WC_SEVERITY_LABELS[wcSeverityKey(value)];
  return known ?? { name: value, osha: "" };
}

export function workersCompSeverityLabel(raw: unknown): string {
  const { name, osha } = workersCompSeverityParts(raw);
  return osha ? `${name} → ${osha}` : name;
}

/** Prefer this week's weekly-update notes, then case notes. */
function weeklyStatusInjuryTime(row: WorkersCompWeeklyStatusCaseRow): number | null {
  for (const raw of [row.claimSummary?.dateOfInjury, row.reportedAt]) {
    const value = asText(raw);
    if (!value) continue;
    const time = /^\d{4}-\d{2}-\d{2}/.test(value)
      ? Date.parse(`${value.slice(0, 10)}T00:00:00Z`)
      : Date.parse(value);
    if (!Number.isNaN(time)) return time;
  }
  return null;
}

/** Oldest injury first; cases without a date go last, then by worker name. */
export function sortWorkersCompWeeklyStatusCases<T extends WorkersCompWeeklyStatusCaseRow>(
  cases: readonly T[],
): T[] {
  return [...cases].sort((a, b) => {
    const ta = weeklyStatusInjuryTime(a);
    const tb = weeklyStatusInjuryTime(b);
    if (ta !== tb) {
      if (ta === null) return 1;
      if (tb === null) return -1;
      return ta - tb;
    }
    return asText(a.workerName).localeCompare(asText(b.workerName), undefined, {
      sensitivity: "base",
    });
  });
}

export function resolveWeeklyStatusEmailNotes(row: WorkersCompWeeklyStatusCaseRow): string {
  return asText(row.weeklyNotes) || asText(row.notes);
}

/** Build subject + HTML/text bodies for the weekly open-cases digest. */
export function buildWorkersCompWeeklyStatusEmail(input: {
  tenantName: string;
  cases: readonly WorkersCompWeeklyStatusCaseRow[];
  generatedAt?: Date;
  weekOf?: string;
}): { subject: string; htmlBody: string; textBody: string; openCount: number } {
  const generatedAt = input.generatedAt ?? new Date();
  const when = generatedAt.toISOString().slice(0, 10);
  const weekOf = asText(input.weekOf) || thursdayWeekOf(generatedAt);
  const openCount = input.cases.length;
  const missingWeekly = input.cases.filter((row) => !asText(row.weeklyNotes)).length;
  const subject = `Workers' Comp weekly status — ${input.tenantName} (${openCount} open)`;

  if (openCount === 0) {
    const textBody = [
      `Workers' compensation weekly status for ${input.tenantName}`,
      `Generated ${when}`,
      `Week of ${weekOf}`,
      "",
      "There are no open workers' compensation cases.",
    ].join("\n");
    const htmlBody = [
      `<p><strong>Workers' compensation weekly status</strong> for ${escapeHtml(input.tenantName)}</p>`,
      `<p>Generated ${escapeHtml(when)} · Week of ${escapeHtml(weekOf)}</p>`,
      `<p>There are no open workers' compensation cases.</p>`,
    ].join("");
    return { subject, htmlBody, textBody, openCount };
  }

  const textLines = [
    `Workers' compensation weekly status for ${input.tenantName}`,
    `Generated ${when}`,
    `Week of ${weekOf}`,
    `Open cases: ${openCount}`,
    missingWeekly > 0 ? `Missing weekly notes: ${missingWeekly}` : "All open cases have weekly notes",
    "",
  ];
  const htmlRows: string[] = [];

  for (const row of input.cases) {
    const claim = row.claimSummary ?? {};
    const worker = asText(row.workerName) || "Unknown worker";
    const statusKey = normalizeWcCaseStatus(row.status);
    const status = statusKey.charAt(0) + statusKey.slice(1).toLowerCase();
    const severity = workersCompSeverityParts(row.severity);
    const severityName = severity.name || "—";
    const injury = asText(claim.dateOfInjury) || asText(row.reportedAt)?.slice(0, 10) || "—";
    const bodyParts = asText(claim.bodyParts) || "—";
    const narrative = summarizeIncidentNarrative(row.incidentNarrative);
    const location = asText(row.locationText) || "—";
    const daysAway = row.daysAway ?? 0;
    const restricted = row.restrictedDays ?? 0;
    const weeklyNotes = asText(row.weeklyNotes);
    const notes = resolveWeeklyStatusEmailNotes(row);
    const notesLabel = weeklyNotes
      ? `Weekly notes: ${weeklyNotes}`
      : notes
        ? `Notes: ${notes}`
        : "Weekly notes: (missing)";

    textLines.push(
      [
        `• ${worker}`,
        `  Status: ${status}`,
        `  Severity: ${severity.osha ? `${severityName} - ${severity.osha}` : severityName}`,
        `  Injury: ${injury} | Body parts: ${bodyParts}`,
        ...(narrative ? [`  Incident summary: ${narrative}`] : []),
        `  Location: ${location} | Days away: ${daysAway} | Restricted: ${restricted}`,
        `  ${notesLabel}`,
      ].join("\n"),
    );
    textLines.push("");

    htmlRows.push(
      [
        "<tr>",
        `<td>${escapeHtml(worker)}</td>`,
        `<td>${escapeHtml(status)}</td>`,
        `<td>${escapeHtml(severityName)}`,
        severity.osha ? `<br/><small>${escapeHtml(severity.osha)}</small>` : "",
        "</td>",
        `<td>${escapeHtml(injury)}<br/><small>${escapeHtml(bodyParts)}</small>`,
        narrative ? `<br/><small><em>${escapeHtml(narrative)}</em></small>` : "",
        "</td>",
        `<td>${escapeHtml(location)}</td>`,
        `<td>${daysAway} / ${restricted}</td>`,
        `<td>${escapeHtml(notes || "(missing weekly notes)")}</td>`,
        "</tr>",
      ].join(""),
    );
  }

  const htmlBody = [
    `<p><strong>Workers' compensation weekly status</strong> for ${escapeHtml(input.tenantName)}</p>`,
    `<p>Generated ${escapeHtml(when)} · Week of ${escapeHtml(weekOf)} · <strong>${openCount}</strong> open case${openCount === 1 ? "" : "s"}`,
    missingWeekly > 0
      ? ` · <strong style="color:#b45309">${missingWeekly} missing weekly notes</strong>`
      : " · all weekly notes complete",
    `</p>`,
    `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">`,
    "<thead><tr>",
    "<th>Worker</th><th>Status</th><th>Severity</th><th>Injury</th><th>Location</th><th>Days away / restricted</th><th>Weekly notes</th>",
    "</tr></thead>",
    `<tbody>${htmlRows.join("")}</tbody>`,
    "</table>",
  ].join("");

  return { subject, htmlBody, textBody: textLines.join("\n").trim(), openCount };
}

/** Reporting key for the weekly digest; schedules on this report send the digest email. */
export const WC_WEEKLY_STATUS_REPORT_KEY = "workers_comp.weekly_status";
/** Fridays at 7 AM US Central (12:00 UTC), after Thursday weekly updates. */
export const WC_WEEKLY_STATUS_DEFAULT_CRON = "0 12 * * 5";

export const WC_WEEKLY_STATUS_REPORT_COLUMNS = [
  { key: "workerName", label: "Worker" },
  { key: "caseNumber", label: "Claim #" },
  { key: "status", label: "Status" },
  { key: "workflowStage", label: "Stage" },
  { key: "severity", label: "Severity" },
  { key: "dateOfInjury", label: "Date of injury" },
  { key: "bodyParts", label: "Body parts" },
  { key: "incidentSummary", label: "Incident summary" },
  { key: "location", label: "Location" },
  { key: "daysAway", label: "Days away" },
  { key: "restrictedDays", label: "Restricted days" },
  { key: "weekOf", label: "Week of" },
  { key: "weeklyNotes", label: "Weekly notes" },
] as const;

/** Flat report rows matching the weekly digest email columns. */
export function workersCompWeeklyStatusReportRows(
  cases: readonly WorkersCompWeeklyStatusCaseRow[],
): Array<Record<string, string | number>> {
  return cases.map((row) => {
    const claim = row.claimSummary ?? {};
    return {
      workerName: asText(row.workerName) || "Unknown worker",
      caseNumber: asText(row.caseNumber) || asText(claim.claimNumber),
      status: asText(row.status) || "OPEN",
      workflowStage: asText(row.workflowStage),
      severity: workersCompSeverityLabel(row.severity),
      dateOfInjury: asText(claim.dateOfInjury) || asText(row.reportedAt).slice(0, 10),
      bodyParts: asText(claim.bodyParts),
      incidentSummary: summarizeIncidentNarrative(row.incidentNarrative),
      location: asText(row.locationText),
      daysAway: row.daysAway ?? 0,
      restrictedDays: row.restrictedDays ?? 0,
      weekOf: asText(row.weekOf),
      weeklyNotes: resolveWeeklyStatusEmailNotes(row),
    };
  });
}

/** Permission helpers for WC medical (view includes manage + admin). */
export function canViewWorkersCompMedical(input: {
  isPlatformAdmin?: boolean;
  permissions: Iterable<string>;
}): boolean {
  if (input.isPlatformAdmin) return true;
  const perms = input.permissions instanceof Set ? input.permissions : new Set(input.permissions);
  return (
    perms.has("industrial.workers_comp.medical.view") ||
    perms.has("industrial.workers_comp.medical.manage") ||
    perms.has("industrial.admin")
  );
}

export function canManageWorkersCompMedical(input: {
  isPlatformAdmin?: boolean;
  permissions: Iterable<string>;
}): boolean {
  if (input.isPlatformAdmin) return true;
  const perms = input.permissions instanceof Set ? input.permissions : new Set(input.permissions);
  return perms.has("industrial.workers_comp.medical.manage") || perms.has("industrial.admin");
}

/**
 * Authored WC notes (medical / work-status) are editable by the author.
 * Tenant/platform admins can always edit. Legacy rows without an author stay
 * editable by anyone who can manage that resource.
 */
export function canEditWorkersCompAuthoredNote(input: {
  isPlatformAdmin?: boolean;
  permissions: Iterable<string>;
  userId: string;
  createdByUserId: string | null | undefined;
  /** True when caller has manage rights for this resource type. */
  canManageResource: boolean;
}): boolean {
  if (input.isPlatformAdmin) return true;
  const perms = input.permissions instanceof Set ? input.permissions : new Set(input.permissions);
  if (perms.has("industrial.admin")) return true;
  const author = typeof input.createdByUserId === "string" ? input.createdByUserId.trim() : "";
  if (author) return author === input.userId;
  return input.canManageResource;
}

/** OSHA linkage stored on workers' comp source_payload. */
export type WorkersCompOshaLinkage = {
  oshaRecordable: boolean;
  oshaPrivacyCase: boolean;
  oshaCaseId: string;
  oshaJobTitle: string;
  oshaIllnessCategory: string;
  oshaCaseOutcome: string;
};

export const EMPTY_WC_OSHA_LINKAGE: WorkersCompOshaLinkage = {
  oshaRecordable: false,
  oshaPrivacyCase: false,
  oshaCaseId: "",
  oshaJobTitle: "",
  oshaIllnessCategory: "1",
  oshaCaseOutcome: "",
};

export function parseWorkersCompOshaLinkage(raw: unknown): WorkersCompOshaLinkage {
  const payload = asRecord(raw) ?? {};
  const recordable =
    payload.oshaRecordable === true ||
    payload.oshaRecordable === "true" ||
    payload.oshaRecordable === 1 ||
    payload.oshaRecordable === "1";
  const privacy =
    payload.oshaPrivacyCase === true ||
    payload.oshaPrivacyCase === "true" ||
    payload.privacyCase === true;
  return {
    oshaRecordable: recordable,
    oshaPrivacyCase: privacy,
    oshaCaseId: asText(payload.oshaCaseId),
    oshaJobTitle: asText(payload.oshaJobTitle),
    oshaIllnessCategory: asText(payload.oshaIllnessCategory) || "1",
    oshaCaseOutcome: asText(payload.oshaCaseOutcome),
  };
}

/** Map WC days / severity into Form 300 column G–J outcome. */
export function deriveOshaOutcomeFromWorkersComp(input: {
  daysAway: number | null;
  restrictedDays: number | null;
  severity?: string;
  caseOutcome?: string | null;
}): "DEATH" | "DAYS_AWAY" | "JOB_TRANSFER_RESTRICTION" | "OTHER_RECORDABLE" {
  const explicit = asText(input.caseOutcome).toUpperCase().replace(/[\s-]+/g, "_");
  if (
    explicit === "DEATH" ||
    explicit === "DAYS_AWAY" ||
    explicit === "JOB_TRANSFER_RESTRICTION" ||
    explicit === "OTHER_RECORDABLE"
  ) {
    return explicit;
  }
  const sev = asText(input.severity).toLowerCase();
  if (sev.includes("fatal") || sev.includes("death")) return "DEATH";
  if ((input.daysAway ?? 0) > 0) return "DAYS_AWAY";
  if ((input.restrictedDays ?? 0) > 0) return "JOB_TRANSFER_RESTRICTION";
  const sevKey = sev.trim().replace(/[\s-]+/g, "_");
  if (sevKey === "lost_time") return "DAYS_AWAY";
  if (sevKey === "restricted") return "JOB_TRANSFER_RESTRICTION";
  return "OTHER_RECORDABLE";
}

/** Build Form 300/301 field patch from a workers' comp case. */
export function oshaPayloadFromWorkersComp(input: {
  workerName: string;
  locationText: string;
  notes: string;
  daysAway: number | null;
  restrictedDays: number | null;
  severity?: string;
  claimSummary: WorkersCompClaimSummary;
  siteName?: string;
  osha: WorkersCompOshaLinkage;
  dateOfBirth?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  gender?: string;
}): Record<string, unknown> {
  const injuryDate = asText(input.claimSummary.dateOfInjury).slice(0, 10);
  const description =
    asText(input.claimSummary.bodyParts) ||
    asText(input.claimSummary.notes) ||
    asText(input.notes);
  const outcome = deriveOshaOutcomeFromWorkersComp({
    daysAway: input.daysAway,
    restrictedDays: input.restrictedDays,
    caseOutcome: input.osha.oshaCaseOutcome,
    ...(input.severity !== undefined ? { severity: input.severity } : {}),
  });
  const illness =
    /^\d$/.test(input.osha.oshaIllnessCategory) && Number(input.osha.oshaIllnessCategory) >= 1
      ? input.osha.oshaIllnessCategory
      : "1";
  const genderUpper = asText(input.gender).toUpperCase();
  const gender =
    genderUpper === "M" || genderUpper === "MALE"
      ? "MALE"
      : genderUpper === "F" || genderUpper === "FEMALE"
        ? "FEMALE"
        : "";
  return {
    employeeName: asText(input.workerName),
    jobTitle: asText(input.osha.oshaJobTitle),
    injuryDate: injuryDate || null,
    eventLocation: asText(input.locationText),
    description,
    injuryOrIllness: description,
    daysAway: input.daysAway,
    restrictedDays: input.restrictedDays,
    caseOutcome: outcome,
    illnessCategory: illness,
    establishment: asText(input.siteName),
    calendarYear: injuryDate ? Number(injuryDate.slice(0, 4)) : null,
    dateOfBirth: asText(input.dateOfBirth).slice(0, 10),
    street: asText(input.street),
    city: asText(input.city),
    state: asText(input.state),
    zip: asText(input.zip),
    gender,
  };
}
