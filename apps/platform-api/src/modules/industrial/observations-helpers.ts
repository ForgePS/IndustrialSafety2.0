import { createHash, randomBytes } from "node:crypto";

export const OBSERVATION_TYPES = [
  "SAFE_BEHAVIOR",
  "UNSAFE_BEHAVIOR",
  "UNSAFE_CONDITION",
  "HAZARD",
  "NEAR_MISS",
  "GOOD_CATCH",
  "ENVIRONMENTAL",
] as const;
export type ObservationType = (typeof OBSERVATION_TYPES)[number];

export const OBSERVATION_STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED", "ARCHIVED"] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

export const OBSERVATION_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type ObservationRiskLevel = (typeof OBSERVATION_RISK_LEVELS)[number];

export const DEFAULT_OBSERVATION_CATEGORIES = [
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
] as const;

export const OBSERVATIONS_SETTINGS_NAMESPACE = "industrial.observations";
export const OBSERVATIONS_SETTINGS_KEY = "settings";

const MAX_CATEGORIES = 100;
const MAX_CATEGORY_LENGTH = 80;
const MAX_PEOPLE = 25;
const MAX_PHOTOS = 10;

export type ObservationsSettings = { categories: string[] };
/** `atFault` absent = follow the observation type (Unsafe behavior → at fault). */
export type ObservedPerson = { personnelId: string | null; name: string; atFault?: boolean };

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function key(value: unknown): string {
  return asText(value)
    .toUpperCase()
    .replace(/[\s/-]+/g, "_");
}

const LEGACY_TYPE_MAP: Record<string, ObservationType> = {
  SAFE: "SAFE_BEHAVIOR",
  SAFE_ACT: "SAFE_BEHAVIOR",
  POSITIVE: "GOOD_CATCH",
  UNSAFE: "UNSAFE_BEHAVIOR",
  AT_RISK: "UNSAFE_BEHAVIOR",
  UNSAFE_ACT: "UNSAFE_BEHAVIOR",
  AT_RISK_BEHAVIOR: "UNSAFE_BEHAVIOR",
  CONDITION: "UNSAFE_CONDITION",
  NEARMISS: "NEAR_MISS",
  ENVIRONMENT: "ENVIRONMENTAL",
  HOUSEKEEPING: "ENVIRONMENTAL",
};

/** Maps new and legacy (SAFE / UNSAFE / HAZARD) observation types; unknown values → "". */
export function normalizeObservationType(raw: unknown): ObservationType | "" {
  const k = key(raw);
  if ((OBSERVATION_TYPES as readonly string[]).includes(k)) return k as ObservationType;
  return LEGACY_TYPE_MAP[k] ?? "";
}

const LEGACY_STATUS_MAP: Record<string, ObservationStatus> = {
  ACTIVE: "OPEN",
  AT_RISK: "OPEN",
  NEW: "OPEN",
  SUBMITTED: "OPEN",
  REOPENED: "OPEN",
  INPROGRESS: "IN_PROGRESS",
  ACKNOWLEDGED: "IN_PROGRESS",
  COMPLETED: "CLOSED",
  RESOLVED: "CLOSED",
  DONE: "CLOSED",
};

/** OPEN | IN_PROGRESS | CLOSED | ARCHIVED; legacy values map across, unknown → OPEN. */
export function normalizeObservationStatus(raw: unknown): ObservationStatus {
  const k = key(raw);
  if ((OBSERVATION_STATUSES as readonly string[]).includes(k)) return k as ObservationStatus;
  return LEGACY_STATUS_MAP[k] ?? "OPEN";
}

/** Stored status values that read as `status`, so list filters still match legacy rows. */
export function observationStatusFilterValues(status: unknown): string[] {
  const wanted = normalizeObservationStatus(status);
  const legacy = Object.entries(LEGACY_STATUS_MAP)
    .filter(([, mapped]) => mapped === wanted)
    .map(([raw]) => raw);
  return [wanted, ...legacy, ...legacy.map((s) => s.toLowerCase()), wanted.toLowerCase()];
}

export function normalizeObservationRiskLevel(raw: unknown): ObservationRiskLevel | "" {
  const k = asText(raw).toLowerCase();
  if ((OBSERVATION_RISK_LEVELS as readonly string[]).includes(k)) return k as ObservationRiskLevel;
  if (k === "moderate" || k === "med") return "medium";
  if (k === "severe" || k === "extreme") return "critical";
  return "";
}

/** Trimmed, de-duplicated (case-insensitive) category names in the given order. */
export function normalizeObservationCategories(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const name = asText(entry).replace(/\s+/g, " ").slice(0, MAX_CATEGORY_LENGTH);
    if (!name) continue;
    const dedupe = name.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(name);
    if (out.length >= MAX_CATEGORIES) break;
  }
  return out;
}

/** Stored settings; tenants without a saved list get the standard categories. */
export function parseObservationsSettings(raw: unknown): ObservationsSettings {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  if (!Array.isArray(obj.categories)) {
    return { categories: [...DEFAULT_OBSERVATION_CATEGORIES] };
  }
  return { categories: normalizeObservationCategories(obj.categories) };
}

export function normalizeObservedPeople(raw: unknown): ObservedPerson[] {
  if (!Array.isArray(raw)) return [];
  const out: ObservedPerson[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const obj: Record<string, unknown> =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : { name: entry };
    const name = asText(obj.name ?? obj.displayName).slice(0, 200);
    const personnelId = asText(obj.personnelId) || null;
    if (!name && !personnelId) continue;
    const dedupe = personnelId ?? `name:${name.toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      personnelId,
      name: name || "Unnamed",
      ...(typeof obj.atFault === "boolean" ? { atFault: obj.atFault } : {}),
    });
    if (out.length >= MAX_PEOPLE) break;
  }
  return out;
}

export function observedPersonKey(person: { personnelId?: string | null; name?: string }): string {
  return person.personnelId ? person.personnelId : `name:${asText(person.name).toLowerCase()}`;
}

/** Applies `[{ key, atFault }]` toggles to the matching people; unknown keys are ignored. */
export function applyObservedPeopleFault(people: ObservedPerson[], raw: unknown): ObservedPerson[] {
  if (!Array.isArray(raw)) return people;
  const wanted = new Map<string, boolean>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { key: k, atFault } = entry as Record<string, unknown>;
    if (typeof k === "string" && typeof atFault === "boolean") wanted.set(k, atFault);
  }
  return people.map((p) => {
    const next = wanted.get(observedPersonKey(p));
    return next === undefined ? p : { ...p, atFault: next };
  });
}

const POSITIVE_OBSERVATION_TYPES: ReadonlySet<string> = new Set(["SAFE_BEHAVIOR", "GOOD_CATCH"]);

export function isPositiveObservationType(type: unknown): boolean {
  return POSITIVE_OBSERVATION_TYPES.has(normalizeObservationType(type));
}

/** Positive observations never put anyone at fault. */
export function observedPersonAtFault(person: ObservedPerson, observationType: unknown): boolean {
  const type = normalizeObservationType(observationType);
  if (POSITIVE_OBSERVATION_TYPES.has(type)) return false;
  return person.atFault ?? type === "UNSAFE_BEHAVIOR";
}

/** Points an unsafe observation takes off a score; no risk level counts as low. */
export const OBSERVATION_RISK_POINTS: Record<ObservationRiskLevel, number> = {
  low: 1,
  medium: 3,
  high: 6,
  critical: 10,
};
export const OBSERVATION_CLOSED_RESTORE = 0.5;
export const OBSERVATION_POSITIVE_CREDIT_CAP = 5;
/** Clean days → share of the remaining deduction still applied. */
const RECOVERY_STEPS: ReadonlyArray<{ days: number; factor: number }> = [
  { days: 90, factor: 0 },
  { days: 60, factor: 1 / 3 },
  { days: 30, factor: 2 / 3 },
];
const DAY_MS = 24 * 60 * 60 * 1000;

export type ScoredObservation = { riskLevel: unknown; status: unknown; at: string };

export type ObservationScoreImpact = {
  /** Points currently taken off (after close-out and clean-time restores). */
  deduction: number;
  /** Points added for positive observations (capped). */
  credit: number;
  unsafeCount: number;
  unsafeOpen: number;
  positiveCount: number;
  /** Days since the last unsafe observation or incident; null when there are none. */
  daysClean: number | null;
  /** 0 = none yet, 1/2/3 = 30/60/90 clean-day restores reached. */
  recoveryStep: 0 | 1 | 2 | 3;
};

/**
 * Unsafe observations deduct by risk; closing restores half. After 30/60/90
 * days with no new unsafe observation or incident, a further third of what
 * remains is restored each step (fully restored at 90).
 */
export function computeObservationScoreImpact(input: {
  unsafe: ScoredObservation[];
  positiveCount: number;
  incidentDates?: Array<string | null | undefined>;
  now?: Date;
}): ObservationScoreImpact {
  const now = (input.now ?? new Date()).getTime();
  let raw = 0;
  let unsafeOpen = 0;
  let last = Number.NEGATIVE_INFINITY;
  for (const obs of input.unsafe) {
    const status = normalizeObservationStatus(obs.status);
    if (status === "ARCHIVED") continue;
    const risk = normalizeObservationRiskLevel(obs.riskLevel) || "low";
    const closed = status === "CLOSED";
    if (!closed) unsafeOpen += 1;
    raw += OBSERVATION_RISK_POINTS[risk] * (closed ? 1 - OBSERVATION_CLOSED_RESTORE : 1);
    const t = Date.parse(obs.at);
    if (!Number.isNaN(t)) last = Math.max(last, t);
  }
  for (const d of input.incidentDates ?? []) {
    const t = d ? Date.parse(d) : Number.NaN;
    if (!Number.isNaN(t)) last = Math.max(last, t);
  }
  const daysClean = Number.isFinite(last) ? Math.max(0, Math.floor((now - last) / DAY_MS)) : null;
  const stepIndex = daysClean === null ? -1 : RECOVERY_STEPS.findIndex((s) => daysClean >= s.days);
  const factor = stepIndex === -1 ? 1 : RECOVERY_STEPS[stepIndex]!.factor;
  const recoveryStep = (stepIndex === -1 ? 0 : RECOVERY_STEPS.length - stepIndex) as 0 | 1 | 2 | 3;
  return {
    deduction: Math.round(raw * factor * 10) / 10,
    credit: Math.min(Math.max(input.positiveCount, 0), OBSERVATION_POSITIVE_CREDIT_CAP),
    unsafeCount: input.unsafe.filter((o) => normalizeObservationStatus(o.status) !== "ARCHIVED")
      .length,
    unsafeOpen,
    positiveCount: input.positiveCount,
    daysClean,
    recoveryStep,
  };
}

/** Keeps image data-URL photos (and any markup fields Field attached); drops anything else. */
export function normalizeObservationPhotos(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const photo = entry as Record<string, unknown>;
    const dataUrl = asText(photo.dataUrl);
    if (!dataUrl.startsWith("data:image/")) continue;
    out.push({
      ...photo,
      id: asText(photo.id) || `photo-${out.length + 1}`,
      fileName: asText(photo.fileName) || `photo-${out.length + 1}.jpg`,
      contentType: asText(photo.contentType) || "image/jpeg",
      dataUrl,
    });
    if (out.length >= MAX_PHOTOS) break;
  }
  return out;
}

const OBSERVATION_TYPE_LABELS: Record<ObservationType, string> = {
  SAFE_BEHAVIOR: "Safe behavior",
  UNSAFE_BEHAVIOR: "Unsafe behavior",
  UNSAFE_CONDITION: "Unsafe condition",
  HAZARD: "Hazard",
  NEAR_MISS: "Near miss",
  GOOD_CATCH: "Good catch",
  ENVIRONMENTAL: "Environmental / housekeeping",
};

export function observationTypeLabel(type: unknown): string {
  const normalized = normalizeObservationType(type);
  return normalized ? OBSERVATION_TYPE_LABELS[normalized] : asText(type);
}

/** Record title: explicit title, else "<Type> · <Category>: <first line of description>". */
export function buildObservationTitle(payload: Record<string, unknown>): string {
  const explicit = asText(payload.title);
  if (explicit) return explicit.slice(0, 500);
  const head = [observationTypeLabel(payload.observationType), asText(payload.category)]
    .filter(Boolean)
    .join(" · ");
  const firstLine = asText(payload.description).split(/\r?\n/)[0] ?? "";
  const title = head && firstLine ? `${head}: ${firstLine}` : head || firstLine;
  return (title || "Observation").slice(0, 500);
}

const TEXT_FIELDS = [
  "description",
  "category",
  "location",
  "siteName",
  "divisionName",
  "departmentId",
  "departmentName",
  "area",
  "observedAt",
  "immediateActions",
  "reportedBy",
] as const;

/**
 * Normalized observation fields from a create/update body. Only keys present in
 * `body` are returned so updates merge onto the stored payload.
 */
export function observationFieldsFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of TEXT_FIELDS) {
    if (body[field] !== undefined) out[field] = asText(body[field]);
  }
  if (body.siteId !== undefined) out.siteId = asText(body.siteId) || null;
  if (body.observationType !== undefined) {
    out.observationType =
      normalizeObservationType(body.observationType) || asText(body.observationType);
  }
  if (body.riskLevel !== undefined) {
    out.riskLevel = normalizeObservationRiskLevel(body.riskLevel) || asText(body.riskLevel);
  }
  if (body.peopleObserved !== undefined)
    out.peopleObserved = normalizeObservedPeople(body.peopleObserved);
  if (body.photos !== undefined) out.photos = normalizeObservationPhotos(body.photos);
  if (body.assignedToPersonnelId !== undefined) {
    out.assignedToPersonnelId = asText(body.assignedToPersonnelId) || null;
  }
  if (body.assignedToName !== undefined)
    out.assignedToName = asText(body.assignedToName).slice(0, 300);
  if (body.assignedToEmail !== undefined) {
    out.assignedToEmail = normalizeObservationEmail(body.assignedToEmail) ?? "";
  }
  return out;
}

export const OBSERVATION_ROOT_CAUSES = [
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
] as const;

export const OBSERVATION_COACHING_VALUES = ["yes", "no", "na"] as const;

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
  afterPhotos: Array<Record<string, unknown>>;
  savedAt?: string;
  completedAt?: string;
  completedVia?: string;
};

const FOLLOW_UP_TEXT_LIMITS: Record<string, number> = {
  rootCause: 200,
  rootCauseDetail: 2000,
  correctiveAction: 4000,
  preventiveAction: 4000,
  notes: 4000,
  completedByName: 200,
};
const MAX_SIGNATURE_LENGTH = 400_000;

/** Merges the follow-up keys present in `raw` onto `prev`, normalizing each one. */
export function normalizeObservationFollowUp(raw: unknown, prev?: unknown): ObservationFollowUp {
  const base =
    prev && typeof prev === "object" && !Array.isArray(prev)
      ? (prev as Record<string, unknown>)
      : {};
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const pick = (k: string) => (input[k] !== undefined ? input[k] : base[k]);
  const out: ObservationFollowUp = {
    rootCause: "",
    rootCauseDetail: "",
    correctiveAction: "",
    preventiveAction: "",
    employeeCoached: "",
    completedDate: "",
    notes: "",
    completedByName: "",
    signatureDataUrl: "",
    afterPhotos: [],
  };
  for (const [k, limit] of Object.entries(FOLLOW_UP_TEXT_LIMITS)) {
    (out as Record<string, unknown>)[k] = asText(pick(k)).slice(0, limit);
  }
  const coached = asText(pick("employeeCoached")).toLowerCase();
  out.employeeCoached = (OBSERVATION_COACHING_VALUES as readonly string[]).includes(coached)
    ? coached
    : "";
  const date = asText(pick("completedDate"));
  out.completedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  const signature = asText(pick("signatureDataUrl"));
  out.signatureDataUrl =
    signature.startsWith("data:image/") && signature.length <= MAX_SIGNATURE_LENGTH
      ? signature
      : "";
  out.afterPhotos = normalizeObservationPhotos(pick("afterPhotos"));
  for (const k of ["savedAt", "completedAt", "completedVia"] as const) {
    const v = asText(base[k]);
    if (v) out[k] = v;
  }
  return out;
}

/** First missing item required to close out, or null when the follow-up is complete. */
export function observationFollowUpMissing(f: ObservationFollowUp): string | null {
  if (!f.correctiveAction) return "Describe the corrective action taken.";
  if (!f.completedDate) return "Enter the date the follow-up was completed.";
  if (!f.completedByName) return "Enter the supervisor's name.";
  if (!f.signatureDataUrl) return "Sign the follow-up to close it out.";
  return null;
}

const FOLLOW_UP_TOKEN_TTL_MS = 120 * 24 * 60 * 60 * 1000;
const MAX_FOLLOW_UP_TOKENS = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ObservationFollowUpToken = { hash: string; expiresAt: string };

function hashToken(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * `<tenantId>.<secret>`: the tenant id scopes the lookup (no cross-tenant
 * search needed); only the secret's hash is stored.
 */
export function createObservationFollowUpToken(tenantId: string): { token: string; hash: string } {
  const secret = randomBytes(24).toString("base64url");
  return { token: `${tenantId}.${secret}`, hash: hashToken(secret) };
}

export function parseObservationFollowUpToken(
  token: unknown,
): { tenantId: string; hash: string } | null {
  const raw = asText(token);
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const tenantId = raw.slice(0, dot);
  const secret = raw.slice(dot + 1);
  if (!UUID_RE.test(tenantId) || secret.length < 16) return null;
  return { tenantId, hash: hashToken(secret) };
}

/** Adds a token, dropping expired ones and keeping the newest few. */
export function addObservationFollowUpToken(
  payload: Record<string, unknown>,
  hash: string,
  now: Date = new Date(),
): ObservationFollowUpToken[] {
  const prior = Array.isArray(payload.followUpTokens)
    ? (payload.followUpTokens as ObservationFollowUpToken[])
    : [];
  const live = prior.filter(
    (t) => t && typeof t.hash === "string" && Date.parse(t.expiresAt) > now.getTime(),
  );
  const next = [
    ...live,
    { hash, expiresAt: new Date(now.getTime() + FOLLOW_UP_TOKEN_TTL_MS).toISOString() },
  ];
  return next.slice(-MAX_FOLLOW_UP_TOKENS);
}

export function observationFollowUpTokenValid(
  payload: Record<string, unknown>,
  hash: string,
  now: Date = new Date(),
): boolean {
  const tokens = Array.isArray(payload.followUpTokens)
    ? (payload.followUpTokens as ObservationFollowUpToken[])
    : [];
  return tokens.some((t) => t?.hash === hash && Date.parse(t.expiresAt) > now.getTime());
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_RECIPIENTS = 10;
const MAX_EMAIL_LOG = 50;

export function normalizeObservationEmail(raw: unknown): string | null {
  const email = asText(raw).toLowerCase();
  return email && email.length <= 320 && EMAIL_PATTERN.test(email) ? email : null;
}

/** Valid, de-duplicated addresses from a list or a comma/semicolon separated string. */
export function normalizeObservationRecipients(raw: unknown): string[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,;\s]+/)
      : [];
  const out: string[] = [];
  for (const entry of list) {
    const email = normalizeObservationEmail(entry);
    if (email && !out.includes(email)) out.push(email);
    if (out.length >= MAX_EMAIL_RECIPIENTS) break;
  }
  return out;
}

export function observationAssigneeKey(payload: Record<string, unknown>): string {
  const id = asText(payload.assignedToPersonnelId);
  return id ? `id:${id}` : `name:${asText(payload.assignedToName).toLowerCase()}`;
}

export type ObservationEmailLogEntry = {
  to: string[];
  sentAt: string;
  sentByUserId: string | null;
  sentByName: string;
  accepted: boolean;
};

/** Newest-last email history, capped so the payload can't grow without bound. */
export function appendObservationEmailLog(
  payload: Record<string, unknown>,
  entry: ObservationEmailLogEntry,
): ObservationEmailLogEntry[] {
  const prior = Array.isArray(payload.emailLog)
    ? (payload.emailLog as ObservationEmailLogEntry[])
    : [];
  return [...prior, entry].slice(-MAX_EMAIL_LOG);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STATUS_LABELS: Record<ObservationStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
};

function formatObservedAt(raw: unknown, timeZone?: string): string {
  const text = asText(raw);
  if (!text) return "";
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return text;
  return d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  });
}

export function buildObservationEmail(input: {
  tenantName: string;
  status: unknown;
  payload: Record<string, unknown>;
  link: string;
  /** Supervisor's no-login follow-up form; omitted once the observation is closed. */
  followUpLink?: string;
  senderName: string;
  message?: string;
  timeZone?: string;
}): { subject: string; htmlBody: string; textBody: string } {
  const p = input.payload;
  const type = observationTypeLabel(p.observationType) || "Observation";
  const category = asText(p.category);
  const risk = normalizeObservationRiskLevel(p.riskLevel);
  const riskLabel = risk ? risk.charAt(0).toUpperCase() + risk.slice(1) : "";
  const location = [
    asText(p.siteName) || asText(p.location),
    asText(p.departmentName),
    asText(p.area),
  ]
    .filter(Boolean)
    .join(" · ");
  const people = normalizeObservedPeople(p.peopleObserved)
    .map((x) => x.name)
    .join(", ");
  const photoCount = Array.isArray(p.photos) ? p.photos.length : 0;
  const assignee = asText(p.assignedToName);

  const rows: Array<[string, string]> = [
    ["Type", type],
    ["Category", category],
    ["Risk level", riskLabel],
    ["Status", STATUS_LABELS[normalizeObservationStatus(input.status)]],
    ["Observed", formatObservedAt(p.observedAt, input.timeZone)],
    ["Location", location],
    ["People observed", people],
    ["Immediate action taken", asText(p.immediateActions)],
    ["Reported by", asText(p.reportedBy)],
    ["Assigned to", assignee],
    ["Photos", photoCount ? `${photoCount} attached - view in Forge` : ""],
  ];
  const filled = rows.filter(([, v]) => v);
  const description = asText(p.description);
  const message = asText(input.message);
  const riskPrefix = risk === "high" || risk === "critical" ? `[${riskLabel} risk] ` : "";
  const subject = `${riskPrefix}${type}${category ? ` - ${category}` : ""}${
    location ? ` (${location})` : ""
  } - ${input.tenantName}`.slice(0, 250);

  const intro = `${escapeHtml(input.senderName)} sent you this safety observation${
    assignee ? ` assigned to ${escapeHtml(assignee)}` : ""
  }.`;
  const htmlBody = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;max-width:640px">
<p>${intro}</p>
${message ? `<p style="background:#f4f6f8;border-left:3px solid #696cff;padding:8px 12px;white-space:pre-wrap">${escapeHtml(message)}</p>` : ""}
<h3 style="margin:16px 0 8px">What was observed</h3>
<p style="white-space:pre-wrap;margin:0 0 16px">${escapeHtml(description || "(no description)")}</p>
<table style="border-collapse:collapse;width:100%">
${filled
  .map(
    ([k, v]) =>
      `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#666;width:180px;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
  )
  .join("\n")}
</table>
${
  input.followUpLink
    ? `<p style="margin:20px 0 6px"><a href="${escapeHtml(input.followUpLink)}" style="background:#696cff;color:#fff;padding:10px 16px;border-radius:4px;text-decoration:none">Complete follow-up form</a></p>
<p style="color:#666;font-size:12px;margin:0 0 16px">Record the corrective action, sign, and close it out. No login needed.</p>
<p style="margin:0 0 20px"><a href="${escapeHtml(input.link)}">Open in Forge</a></p>`
    : `<p style="margin:20px 0"><a href="${escapeHtml(input.link)}" style="background:#696cff;color:#fff;padding:10px 16px;border-radius:4px;text-decoration:none">Open in Forge</a></p>`
}
<p style="color:#888;font-size:12px">${escapeHtml(input.tenantName)} - Forge Industrial Safety</p>
</div>`;

  const textBody = [
    `${input.senderName} sent you this safety observation${assignee ? ` assigned to ${assignee}` : ""}.`,
    message ? `\nMessage: ${message}` : "",
    `\nWhat was observed:\n${description || "(no description)"}\n`,
    ...filled.map(([k, v]) => `${k}: ${v}`),
    input.followUpLink
      ? `\nComplete the follow-up form (no login needed): ${input.followUpLink}`
      : "",
    `\nOpen in Forge: ${input.link}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, htmlBody, textBody };
}
