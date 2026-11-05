/**
 * OSHA recordkeeping helpers — unwrap imported payloads and normalize
 * Form 300 / 300A / 301 fields for list/detail APIs.
 */

import { cappedOshaDays, oshaCaseLogYear } from "@forge/contracts";

export {
  cappedOshaDays,
  nextOshaCaseNumber,
  OSHA_MAX_COUNTED_DAYS,
  oshaCaseLogYear,
  oshaLogEstablishmentKey,
} from "@forge/contracts";

export const OSHA_RECORDABILITY = [
  "PENDING",
  "RECORDABLE",
  "NOT_RECORDABLE",
  "PRIVACY_CASE",
] as const;

export type OshaRecordability = (typeof OSHA_RECORDABILITY)[number];

/** Form 300 Step 3 — select only one (most serious outcome). */
export const OSHA_CASE_OUTCOMES = [
  "DEATH",
  "DAYS_AWAY",
  "JOB_TRANSFER_RESTRICTION",
  "OTHER_RECORDABLE",
] as const;

export type OshaCaseOutcome = (typeof OSHA_CASE_OUTCOMES)[number];

/** Form 300 Step 5 / column (M) illness categories 1–6. */
export const OSHA_ILLNESS_CATEGORIES = ["1", "2", "3", "4", "5", "6"] as const;

export type OshaIllnessCategory = (typeof OSHA_ILLNESS_CATEGORIES)[number];

export const OSHA_GENDERS = ["MALE", "FEMALE"] as const;
export type OshaGender = (typeof OSHA_GENDERS)[number];

export const OSHA_AM_PM = ["AM", "PM"] as const;
export type OshaAmPm = (typeof OSHA_AM_PM)[number];

/** Whitelisted keys mergeable via PATCH /osha/:id into source_payload. */
export const OSHA_CASE_PAYLOAD_KEYS = [
  "caseNumber",
  "employeeName",
  "jobTitle",
  "injuryDate",
  "eventLocation",
  "description",
  "caseOutcome",
  "daysAway",
  "restrictedDays",
  "illnessCategory",
  "establishment",
  "calendarYear",
  "reviewer",
  // Form 301
  "completedBy",
  "completedByTitle",
  "completedByPhone",
  "completedByDate",
  "street",
  "city",
  "state",
  "zip",
  "dateOfBirth",
  "dateHired",
  "gender",
  "physicianName",
  "treatmentFacility",
  "treatmentStreet",
  "treatmentCity",
  "treatmentState",
  "treatmentZip",
  "treatedInEr",
  "hospitalizedOvernight",
  "timeBeganWork",
  "timeBeganWorkAmPm",
  "timeOfEvent",
  "timeOfEventAmPm",
  "timeCannotBeDetermined",
  "activityBefore",
  "whatHappened",
  "injuryOrIllness",
  "objectOrSubstance",
  "dateOfDeath",
] as const;

export type OshaCasePayloadKey = (typeof OSHA_CASE_PAYLOAD_KEYS)[number];

export type OshaForm300AMeta = {
  year: number;
  establishmentName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  industryDescription: string;
  naics: string;
  annualAverageEmployees: number | null;
  totalHoursWorked: number | null;
  companyExecutive: string;
  executiveTitle: string;
  phone: string;
  certificationDate: string | null;
};

export type OshaForm300ATotals = {
  year: number;
  deaths: number;
  daysAwayCases: number;
  jobTransferCases: number;
  otherRecordableCases: number;
  daysAway: number;
  restrictedDays: number;
  injuries: number;
  skinDisorders: number;
  respiratoryConditions: number;
  poisonings: number;
  hearingLoss: number;
  allOtherIllnesses: number;
};

export type OshaCaseHydrated = {
  title: string;
  incidentId: string;
  /** Firebase incident document id when the AWS UUID is not yet linked. */
  sourceIncidentId: string;
  employeeName: string;
  injuryDate: string | null;
  recordabilityStatus: OshaRecordability;
  oshaRecordable: boolean | null;
  privacyCase: boolean;
  reviewer: string;
  establishment: string;
  calendarYear: number | null;
  daysAway: number | null;
  restrictedDays: number | null;
  jobTitle: string;
  description: string;
  caseNumber: string;
  // Form 300
  eventLocation: string;
  caseOutcome: OshaCaseOutcome | null;
  illnessCategory: OshaIllnessCategory | null;
  // Form 301
  completedBy: string;
  completedByTitle: string;
  completedByPhone: string;
  completedByDate: string | null;
  street: string;
  city: string;
  state: string;
  zip: string;
  dateOfBirth: string | null;
  dateHired: string | null;
  gender: OshaGender | null;
  physicianName: string;
  treatmentFacility: string;
  treatmentStreet: string;
  treatmentCity: string;
  treatmentState: string;
  treatmentZip: string;
  treatedInEr: boolean | null;
  hospitalizedOvernight: boolean | null;
  timeBeganWork: string;
  timeBeganWorkAmPm: OshaAmPm | null;
  timeOfEvent: string;
  timeOfEventAmPm: OshaAmPm | null;
  timeCannotBeDetermined: boolean;
  activityBefore: string;
  whatHappened: string;
  injuryOrIllness: string;
  objectOrSubstance: string;
  dateOfDeath: string | null;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asBool(value: unknown): boolean | null {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
}

function asDate(value: unknown): string | null {
  const fromOccurred = parseOccurredDateTime(value).date;
  if (fromOccurred) return fromOccurred;
  const raw = asText(value);
  if (!raw) return null;
  const slice = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

/**
 * Split an incident "Date occurred" value into Form 301 line 11 (date) and
 * line 13 (time of event + AM/PM). Accepts datetime-local ISO and common US forms.
 */
export function parseOccurredDateTime(raw: unknown): {
  date: string | null;
  time: string;
  amPm: OshaAmPm | null;
} {
  const text = asText(raw);
  if (!text) return { date: null, time: "", amPm: null };

  const iso =
    /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i.exec(
      text,
    );
  if (iso) {
    const date = iso[1] ?? null;
    if (!iso[2]) return { date, time: "", amPm: null };
    const hour24 = Number(iso[2]);
    const minute = Number(iso[3]);
    if (!Number.isFinite(hour24) || !Number.isFinite(minute)) {
      return { date, time: "", amPm: null };
    }
    return { date, ...formatOshaClock(hour24, minute) };
  }

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i.exec(text);
  if (us) {
    const mm = String(us[1]).padStart(2, "0");
    const dd = String(us[2]).padStart(2, "0");
    const yyyy = us[3]!;
    const date = `${yyyy}-${mm}-${dd}`;
    if (!us[4]) return { date, time: "", amPm: null };
    const hour12 = Number(us[4]);
    const minute = Number(us[5]);
    const amPm = normalizeOshaAmPm(us[6]);
    if (!Number.isFinite(hour12) || !Number.isFinite(minute) || !amPm) {
      return { date, time: "", amPm: null };
    }
    if (hour12 < 1 || hour12 > 12) return { date, time: "", amPm: null };
    return {
      date,
      time: `${hour12}:${String(minute).padStart(2, "0")}`,
      amPm,
    };
  }

  return { date: null, time: "", amPm: null };
}

function formatOshaClock(hour24: number, minute: number): { time: string; amPm: OshaAmPm } {
  const amPm: OshaAmPm = hour24 >= 12 ? "PM" : "AM";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { time: `${hour12}:${String(minute).padStart(2, "0")}`, amPm };
}

/** Parse HH:MM / HH:MM AM|PM into OSHA Form 301 clock fields. */
function parseShiftStartClock(raw: unknown): { time: string; amPm: OshaAmPm | null } {
  const text = asText(raw);
  if (!text) return { time: "", amPm: null };

  const withAmPm = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i.exec(text);
  if (withAmPm) {
    const hour12 = Number(withAmPm[1]);
    const minute = Number(withAmPm[2]);
    const amPm = normalizeOshaAmPm(withAmPm[3]);
    if (!Number.isFinite(hour12) || !Number.isFinite(minute) || !amPm) {
      return { time: "", amPm: null };
    }
    if (hour12 < 1 || hour12 > 12 || minute > 59) return { time: "", amPm: null };
    return {
      time: `${hour12}:${String(minute).padStart(2, "0")}`,
      amPm,
    };
  }

  const iso = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (iso) {
    const hour24 = Number(iso[1]);
    const minute = Number(iso[2]);
    if (!Number.isFinite(hour24) || !Number.isFinite(minute) || hour24 > 23 || minute > 59) {
      return { time: "", amPm: null };
    }
    return formatOshaClock(hour24, minute);
  }

  return { time: "", amPm: null };
}

function asYear(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1900 && value <= 2100) {
    return Math.trunc(value);
  }
  const text = asText(value);
  if (/^\d{4}$/.test(text)) return Number(text);
  const fromDate = asDate(value);
  if (fromDate) return Number(fromDate.slice(0, 4));
  return null;
}

function asInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function normalizeOshaCaseOutcome(raw: unknown): OshaCaseOutcome | null {
  const text = asText(raw)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (!text) return null;
  if (text === "G" || text === "DEATH" || text === "FATALITY") return "DEATH";
  if (text === "H" || text === "DAYS_AWAY" || text === "DAYS_AWAY_FROM_WORK") return "DAYS_AWAY";
  if (
    text === "I" ||
    text === "JOB_TRANSFER_RESTRICTION" ||
    text === "JOB_TRANSFER" ||
    text === "RESTRICTION" ||
    text === "TRANSFER_OR_RESTRICTION"
  ) {
    return "JOB_TRANSFER_RESTRICTION";
  }
  if (text === "J" || text === "OTHER_RECORDABLE" || text === "OTHER") return "OTHER_RECORDABLE";
  if ((OSHA_CASE_OUTCOMES as readonly string[]).includes(text)) {
    return text as OshaCaseOutcome;
  }
  return null;
}

export function normalizeOshaIllnessCategory(raw: unknown): OshaIllnessCategory | null {
  const text = asText(raw);
  if (!text) return null;
  const digit = text.replace(/[^\d]/g, "");
  if ((OSHA_ILLNESS_CATEGORIES as readonly string[]).includes(digit)) {
    return digit as OshaIllnessCategory;
  }
  const upper = text.toUpperCase().replace(/[\s-]+/g, "_");
  if (upper === "INJURY" || upper === "INJURIES") return "1";
  if (upper === "SKIN" || upper === "SKIN_DISORDER" || upper === "SKIN_DISORDERS") return "2";
  if (upper === "RESPIRATORY" || upper === "RESPIRATORY_CONDITION") return "3";
  if (upper === "POISONING" || upper === "POISONINGS") return "4";
  if (upper === "HEARING" || upper === "HEARING_LOSS") return "5";
  if (upper === "OTHER" || upper === "ALL_OTHER" || upper === "ALL_OTHER_ILLNESSES") return "6";
  return null;
}

export function normalizeOshaGender(raw: unknown): OshaGender | null {
  const text = asText(raw).toUpperCase();
  if (text === "M" || text === "MALE") return "MALE";
  if (text === "F" || text === "FEMALE") return "FEMALE";
  return null;
}

export function normalizeOshaAmPm(raw: unknown): OshaAmPm | null {
  const text = asText(raw).toUpperCase();
  if (text === "A" || text === "AM") return "AM";
  if (text === "P" || text === "PM") return "PM";
  return null;
}

/** Unwrap double-encoded jsonb strings from the industrial importer. */
export function unwrapOshaSourcePayload(raw: unknown): Record<string, unknown> {
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

export function normalizeOshaRecordability(raw: unknown): OshaRecordability {
  const text = asText(raw)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (text === "RECORDABLE" || text === "YES") return "RECORDABLE";
  if (
    text === "NOT_RECORDABLE" ||
    text === "NON_RECORDABLE" ||
    text === "NO" ||
    text === "NONRECORDABLE"
  ) {
    return "NOT_RECORDABLE";
  }
  if (text === "PRIVACY_CASE" || text === "PRIVACY") return "PRIVACY_CASE";
  if (text === "PENDING" || text === "UNKNOWN" || text === "" || text === "UNDETERMINED") {
    return "PENDING";
  }
  if (OSHA_RECORDABILITY.includes(text as OshaRecordability)) {
    return text as OshaRecordability;
  }
  return "PENDING";
}

export function recordabilityFromFlags(input: {
  recordabilityStatus?: unknown;
  recordability?: unknown;
  classification?: unknown;
  oshaRecordable?: unknown;
  recordable?: unknown;
  privacyCase?: unknown;
}): OshaRecordability {
  const privacy = asBool(input.privacyCase);
  if (privacy === true) return "PRIVACY_CASE";
  const explicit =
    asText(input.recordabilityStatus) ||
    asText(input.recordability) ||
    asText(input.classification);
  if (explicit) return normalizeOshaRecordability(explicit);
  const flag = asBool(input.oshaRecordable ?? input.recordable);
  if (flag === true) return "RECORDABLE";
  if (flag === false) return "NOT_RECORDABLE";
  return "PENDING";
}

export function oshaFlagsFromRecordability(status: OshaRecordability): {
  oshaRecordable: boolean | null;
  privacyCase: boolean;
} {
  if (status === "PRIVACY_CASE") return { oshaRecordable: true, privacyCase: true };
  if (status === "RECORDABLE") return { oshaRecordable: true, privacyCase: false };
  if (status === "NOT_RECORDABLE") return { oshaRecordable: false, privacyCase: false };
  return { oshaRecordable: null, privacyCase: false };
}

/**
 * Seed Form 301 (and shared Form 300) fields from an incident source_payload
 * plus optional linked personnel profile values.
 */
export function seedForm301FieldsFromIncident(input: {
  incidentId: string;
  title?: string | null;
  siteId?: string | null;
  payload: Record<string, unknown>;
  personnel?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const payload = input.payload;
  const employee = asRecord(payload.employee) ?? {};
  const person = input.personnel ?? {};
  const personEmployee = asRecord(person.employee) ?? {};

  const description =
    asText(payload.description) ||
    asText(payload.injuryNarrative) ||
    asText(payload.workDayDetails) ||
    asText(payload.injuryDescription) ||
    "";

  const eventLocation =
    asText(payload.locationDetail) ||
    asText(payload.exactLocation) ||
    asText(payload.eventLocation) ||
    asText(payload.whereEventOccurred) ||
    asText(payload.location) ||
    asText(payload.site) ||
    "";

  const occurred = parseOccurredDateTime(payload.dateOccurred ?? payload.occurredAt);
  const shiftStart = parseShiftStartClock(
    payload.shiftStartTime ?? payload.timeBeganWork ?? payload.workStartTime,
  );
  const injuryDate =
    occurred.date || asDate(payload.injuryDate) || asDate(payload.dateOfInjury) || null;

  const employeeName =
    asText(payload.personAffected) ||
    asText(payload.employeeName) ||
    asText(payload.workerName) ||
    asText(person.displayName) ||
    asText(person.name) ||
    [asText(person.firstName), asText(person.lastName)].filter(Boolean).join(" ") ||
    asText(employee.employeeName) ||
    asText(employee.name) ||
    "";

  const dateOfBirth =
    asDate(payload.dateOfBirth) ||
    asDate(employee.dateOfBirth) ||
    asDate(person.dateOfBirth) ||
    asDate(personEmployee.dateOfBirth) ||
    null;

  const dateHired =
    asDate(payload.hireDate) ||
    asDate(payload.dateHired) ||
    asDate(employee.dateHired) ||
    asDate(employee.hireDate) ||
    asDate(person.hireDate) ||
    asDate(personEmployee.dateHired) ||
    null;

  const jobTitle =
    asText(payload.jobTitle) ||
    asText(employee.jobTitle) ||
    asText(person.jobTitle) ||
    asText(personEmployee.jobTitle) ||
    "";

  const street =
    asText(payload.street) ||
    asText(employee.street) ||
    asText(employee.address) ||
    asText(person.street) ||
    asText(person.address) ||
    "";
  const city = asText(payload.city) || asText(employee.city) || asText(person.city) || "";
  const state = asText(payload.state) || asText(employee.state) || asText(person.state) || "";
  const zip =
    asText(payload.zip) ||
    asText(payload.zipCode) ||
    asText(employee.zip) ||
    asText(employee.zipCode) ||
    asText(person.zip) ||
    asText(person.zipCode) ||
    "";

  const gender = normalizeOshaGender(
    payload.gender ?? employee.gender ?? person.gender ?? personEmployee.gender,
  );

  const whatHappened =
    asText(payload.whatHappened) || asText(payload.howInjuryOccurred) || description;
  const activityBefore =
    asText(payload.activityBefore) ||
    asText(payload.whatDoing) ||
    (eventLocation ? `Working at ${eventLocation}` : "");
  const injuryOrIllness =
    asText(payload.injuryOrIllness) || asText(payload.bodyParts) || description;
  const objectOrSubstance = asText(payload.objectOrSubstance) || asText(payload.harmedBy) || "";

  const completedBy =
    asText(payload.completedBy) || asText(payload.reportedBy) || asText(payload.submittedBy) || "";
  const completedByPhone =
    asText(payload.completedByPhone) ||
    asText(payload.reportedByPhone) ||
    asText(person.phone) ||
    asText(person.companyPhone) ||
    "";
  const completedByDate =
    asDate(payload.completedByDate) ||
    asDate(payload.submittedAt) ||
    asDate(payload.reportedAt) ||
    null;

  const personnelId = asText(payload.personnelId) || asText(person.id) || "";

  return {
    incidentId: input.incidentId,
    title: asText(input.title) || employeeName || "OSHA case",
    employeeName,
    injuryDate,
    dateOfBirth,
    dateHired,
    jobTitle,
    street,
    city,
    state,
    zip,
    gender,
    establishment:
      asText(payload.establishment) ||
      asText(payload.establishmentName) ||
      asText(payload.site) ||
      asText(payload.community) ||
      "",
    eventLocation,
    description,
    injuryOrIllness,
    whatHappened,
    activityBefore,
    objectOrSubstance,
    physicianName:
      asText(payload.physicianName) || asText(payload.physician) || asText(payload.doctor) || "",
    treatmentFacility:
      asText(payload.treatmentFacility) || asText(payload.facility) || asText(payload.clinic) || "",
    treatmentStreet: asText(payload.treatmentStreet) || asText(payload.facilityStreet) || "",
    treatmentCity: asText(payload.treatmentCity) || asText(payload.facilityCity) || "",
    treatmentState: asText(payload.treatmentState) || asText(payload.facilityState) || "",
    treatmentZip: asText(payload.treatmentZip) || asText(payload.facilityZip) || "",
    treatedInEr: asBool(payload.treatedInEr ?? payload.emergencyRoom),
    hospitalizedOvernight: asBool(
      payload.hospitalizedOvernight ?? payload.hospitalized ?? payload.inpatient,
    ),
    timeBeganWork:
      asText(payload.timeBeganWork) || asText(payload.workStartTime) || shiftStart.time || "",
    timeBeganWorkAmPm:
      normalizeOshaAmPm(payload.timeBeganWorkAmPm ?? payload.workStartAmPm) || shiftStart.amPm,
    timeOfEvent: asText(payload.timeOfEvent) || asText(payload.incidentTime) || occurred.time || "",
    timeOfEventAmPm:
      normalizeOshaAmPm(payload.timeOfEventAmPm ?? payload.incidentAmPm) || occurred.amPm,
    timeCannotBeDetermined: asBool(payload.timeCannotBeDetermined) === true,
    dateOfDeath: asDate(payload.dateOfDeath),
    daysAway: asInt(payload.daysAway),
    restrictedDays: asInt(payload.restrictedDays ?? payload.jobTransferDays),
    completedBy,
    completedByTitle: asText(payload.completedByTitle) || asText(payload.reportedByTitle) || "",
    completedByPhone,
    completedByDate,
    calendarYear: injuryDate ? Number(injuryDate.slice(0, 4)) : null,
    reviewer: completedBy || asText(payload.reportedBy) || "",
    ...(personnelId ? { personnelId } : {}),
    ...(input.siteId ? { siteId: input.siteId } : {}),
  };
}

/** Prefer non-empty `preferred` values when filling blanks on an existing OSHA case. */
export function mergeOshaSeedPreferExisting(
  existing: Record<string, unknown>,
  seed: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(seed)) {
    const current = out[key];
    const empty =
      current == null || current === "" || (typeof current === "string" && current.trim() === "");
    if (empty && value != null && value !== "") {
      out[key] = value;
    }
  }
  return out;
}

export function isOshaFormLogCase(status: OshaRecordability): boolean {
  return status === "RECORDABLE" || status === "PRIVACY_CASE";
}

/** Merge whitelisted Form 300/301 fields from a PATCH body into source_payload. */
export function mergeOshaCasePayloadFields(
  payload: Record<string, unknown>,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  for (const key of OSHA_CASE_PAYLOAD_KEYS) {
    if (!(key in body)) continue;
    const value = body[key];
    switch (key) {
      case "caseOutcome":
        next.caseOutcome = normalizeOshaCaseOutcome(value);
        break;
      case "illnessCategory":
        next.illnessCategory = normalizeOshaIllnessCategory(value);
        break;
      case "gender":
        next.gender = normalizeOshaGender(value);
        break;
      case "timeBeganWorkAmPm":
      case "timeOfEventAmPm":
        next[key] = normalizeOshaAmPm(value);
        break;
      case "daysAway":
      case "restrictedDays":
      case "calendarYear":
        next[key] = asInt(value);
        break;
      case "injuryDate":
      case "completedByDate":
      case "dateOfBirth":
      case "dateHired":
      case "dateOfDeath":
        next[key] = asDate(value);
        break;
      case "treatedInEr":
      case "hospitalizedOvernight":
      case "timeCannotBeDetermined":
        next[key] = asBool(value) ?? false;
        break;
      default:
        next[key] =
          typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
        break;
    }
  }
  return next;
}

export function emptyOshaForm300AMeta(year: number, establishmentName = ""): OshaForm300AMeta {
  return {
    year,
    establishmentName,
    street: "",
    city: "",
    state: "",
    zip: "",
    industryDescription: "",
    naics: "",
    annualAverageEmployees: null,
    totalHoursWorked: null,
    companyExecutive: "",
    executiveTitle: "",
    phone: "",
    certificationDate: null,
  };
}

export function parseOshaForm300AMeta(
  raw: unknown,
  year: number,
  establishmentName = "",
): OshaForm300AMeta {
  const base = emptyOshaForm300AMeta(year, establishmentName);
  const obj = asRecord(raw);
  if (!obj) return base;
  return {
    year,
    establishmentName:
      asText(obj.establishmentName) || asText(obj.establishment) || establishmentName,
    street: asText(obj.street),
    city: asText(obj.city),
    state: asText(obj.state),
    zip: asText(obj.zip),
    industryDescription: asText(obj.industryDescription),
    naics: asText(obj.naics).replace(/\D/g, "").slice(0, 6),
    annualAverageEmployees: asInt(obj.annualAverageEmployees),
    totalHoursWorked: asInt(obj.totalHoursWorked),
    companyExecutive: asText(obj.companyExecutive),
    executiveTitle: asText(obj.executiveTitle),
    phone: asText(obj.phone),
    certificationDate: asDate(obj.certificationDate),
  };
}

export function readOshaForm300AMetaFromSitePayload(
  sourcePayload: unknown,
  year: number,
  establishmentName = "",
): OshaForm300AMeta {
  const payload = unwrapOshaSourcePayload(sourcePayload);
  const byYear = asRecord(payload.oshaForm300A) ?? {};
  return parseOshaForm300AMeta(byYear[String(year)], year, establishmentName);
}

export function writeOshaForm300AMetaToSitePayload(
  sourcePayload: unknown,
  meta: OshaForm300AMeta,
): Record<string, unknown> {
  const payload = unwrapOshaSourcePayload(sourcePayload);
  const byYear = { ...(asRecord(payload.oshaForm300A) ?? {}) };
  byYear[String(meta.year)] = {
    establishmentName: meta.establishmentName,
    street: meta.street,
    city: meta.city,
    state: meta.state,
    zip: meta.zip,
    industryDescription: meta.industryDescription,
    naics: meta.naics,
    annualAverageEmployees: meta.annualAverageEmployees,
    totalHoursWorked: meta.totalHoursWorked,
    companyExecutive: meta.companyExecutive,
    executiveTitle: meta.executiveTitle,
    phone: meta.phone,
    certificationDate: meta.certificationDate,
  };
  return { ...payload, oshaForm300A: byYear };
}

export function form300ATotalsFromCases(
  cases: Array<{
    recordabilityStatus: OshaRecordability;
    calendarYear: number | null;
    injuryDate?: string | null;
    caseOutcome: OshaCaseOutcome | null;
    daysAway: number | null;
    restrictedDays: number | null;
    illnessCategory: OshaIllnessCategory | null;
  }>,
  year: number,
): OshaForm300ATotals {
  const inYear = cases.filter(
    (c) => isOshaFormLogCase(c.recordabilityStatus) && oshaCaseLogYear(c) === year,
  );

  const totals: OshaForm300ATotals = {
    year,
    deaths: 0,
    daysAwayCases: 0,
    jobTransferCases: 0,
    otherRecordableCases: 0,
    daysAway: 0,
    restrictedDays: 0,
    injuries: 0,
    skinDisorders: 0,
    respiratoryConditions: 0,
    poisonings: 0,
    hearingLoss: 0,
    allOtherIllnesses: 0,
  };

  for (const row of inYear) {
    if (row.caseOutcome === "DEATH") totals.deaths += 1;
    else if (row.caseOutcome === "DAYS_AWAY") totals.daysAwayCases += 1;
    else if (row.caseOutcome === "JOB_TRANSFER_RESTRICTION") totals.jobTransferCases += 1;
    else if (row.caseOutcome === "OTHER_RECORDABLE") totals.otherRecordableCases += 1;

    const days = cappedOshaDays(row.daysAway, row.restrictedDays);
    totals.daysAway += days.daysAway;
    totals.restrictedDays += days.restrictedDays;

    if (row.illnessCategory === "1") totals.injuries += 1;
    else if (row.illnessCategory === "2") totals.skinDisorders += 1;
    else if (row.illnessCategory === "3") totals.respiratoryConditions += 1;
    else if (row.illnessCategory === "4") totals.poisonings += 1;
    else if (row.illnessCategory === "5") totals.hearingLoss += 1;
    else if (row.illnessCategory === "6") totals.allOtherIllnesses += 1;
  }

  return totals;
}

export function hydrateOshaFromSource(input: {
  title?: string | null;
  status?: string | null;
  recordDate?: string | Date | null;
  personnelId?: string | null;
  sourcePayload?: unknown;
  /** Optional joined / seed incident fields (win when case payload is blank). */
  incident?: {
    id?: string | null;
    title?: string | null;
    employeeName?: string | null;
    dateOccurred?: string | null;
    establishment?: string | null;
    sitePath?: string | null;
    oshaRecordable?: unknown;
    reportedBy?: string | null;
    jobTitle?: string | null;
    description?: string | null;
    daysAway?: unknown;
    restrictedDays?: unknown;
  } | null;
  personnelName?: string | null;
  siteName?: string | null;
}): OshaCaseHydrated {
  const payload = unwrapOshaSourcePayload(input.sourcePayload);
  const employee = asRecord(payload.employee) ?? {};
  const incident = asRecord(payload.incident) ?? {};
  const linked = input.incident ?? {};

  const injuryDate =
    asDate(payload.injuryDate) ||
    asDate(payload.dateOfInjury) ||
    asDate(payload.dateOccurred) ||
    asDate(incident.dateOccurred) ||
    asDate(linked.dateOccurred) ||
    asDate(input.recordDate) ||
    null;

  const recordabilityStatus = recordabilityFromFlags({
    recordabilityStatus: payload.recordabilityStatus,
    recordability: payload.recordability,
    classification: payload.classification,
    oshaRecordable: payload.oshaRecordable ?? linked.oshaRecordable,
    recordable: payload.recordable,
    privacyCase: payload.privacyCase ?? payload.isPrivacyCase,
  });
  const flags = oshaFlagsFromRecordability(recordabilityStatus);

  const employeeName =
    asText(payload.employeeName) ||
    asText(payload.workerName) ||
    asText(employee.employeeName) ||
    asText(employee.name) ||
    asText(linked.employeeName) ||
    asText(input.personnelName) ||
    "";

  const establishment =
    asText(payload.establishment) ||
    asText(payload.establishmentName) ||
    asText(payload.site) ||
    asText(payload.siteName) ||
    asText(linked.establishment) ||
    asText(linked.sitePath) ||
    asText(input.siteName) ||
    "";

  const sourceIncidentId = asText(payload.incidentId) || asText(payload.incident_id);
  const linkedIncidentId = asText(linked.id);
  const incidentId =
    (linkedIncidentId && /^[0-9a-f-]{36}$/i.test(linkedIncidentId) ? linkedIncidentId : "") ||
    (sourceIncidentId && /^[0-9a-f-]{36}$/i.test(sourceIncidentId) ? sourceIncidentId : "") ||
    asText(payload.awsIncidentId) ||
    linkedIncidentId ||
    sourceIncidentId;

  const title =
    asText(input.title) ||
    asText(payload.title) ||
    asText(payload.incidentTitle) ||
    asText(linked.title) ||
    asText(incident.title) ||
    employeeName ||
    "OSHA case";

  // The injury date decides the log year; a stored calendarYear can be stale after a date edit.
  const calendarYear =
    (injuryDate ? Number(injuryDate.slice(0, 4)) : null) ||
    asYear(payload.calendarYear) ||
    asYear(payload.year);

  const description =
    asText(payload.description) ||
    asText(payload.injuryDescription) ||
    asText(payload.decisionRationale) ||
    asText(linked.description) ||
    "";

  return {
    title,
    incidentId,
    sourceIncidentId,
    employeeName,
    injuryDate,
    recordabilityStatus,
    oshaRecordable: flags.oshaRecordable,
    privacyCase: flags.privacyCase,
    reviewer:
      asText(payload.reviewer) ||
      asText(payload.reviewedBy) ||
      asText(payload.decidedBy) ||
      asText(payload.determinedBy) ||
      asText(linked.reportedBy) ||
      asText(payload.reportedBy) ||
      "",
    establishment,
    calendarYear,
    daysAway: asInt(payload.daysAway) ?? asInt(linked.daysAway),
    restrictedDays:
      asInt(payload.restrictedDays) ??
      asInt(payload.daysRestricted) ??
      asInt(payload.daysJobTransfer) ??
      asInt(linked.restrictedDays),
    jobTitle: asText(payload.jobTitle) || asText(linked.jobTitle) || asText(employee.jobTitle),
    description,
    caseNumber: asText(payload.caseNumber),
    eventLocation:
      asText(payload.eventLocation) ||
      asText(payload.whereEventOccurred) ||
      asText(payload.location) ||
      "",
    caseOutcome: normalizeOshaCaseOutcome(payload.caseOutcome ?? payload.outcome),
    illnessCategory: normalizeOshaIllnessCategory(
      payload.illnessCategory ?? payload.injuryIllnessType ?? payload.columnM,
    ),
    completedBy: asText(payload.completedBy),
    completedByTitle: asText(payload.completedByTitle),
    completedByPhone: asText(payload.completedByPhone),
    completedByDate: asDate(payload.completedByDate),
    street: asText(payload.street) || asText(employee.street) || asText(employee.address),
    city: asText(payload.city) || asText(employee.city),
    state: asText(payload.state) || asText(employee.state),
    zip: asText(payload.zip) || asText(employee.zip) || asText(employee.zipCode),
    dateOfBirth: asDate(payload.dateOfBirth) || asDate(employee.dateOfBirth),
    dateHired: asDate(payload.dateHired) || asDate(employee.dateHired),
    gender: normalizeOshaGender(payload.gender ?? employee.gender),
    physicianName: asText(payload.physicianName) || asText(payload.physician),
    treatmentFacility: asText(payload.treatmentFacility) || asText(payload.facility),
    treatmentStreet: asText(payload.treatmentStreet),
    treatmentCity: asText(payload.treatmentCity),
    treatmentState: asText(payload.treatmentState),
    treatmentZip: asText(payload.treatmentZip),
    treatedInEr: asBool(payload.treatedInEr),
    hospitalizedOvernight: asBool(payload.hospitalizedOvernight),
    timeBeganWork: asText(payload.timeBeganWork),
    timeBeganWorkAmPm: normalizeOshaAmPm(payload.timeBeganWorkAmPm),
    timeOfEvent: asText(payload.timeOfEvent),
    timeOfEventAmPm: normalizeOshaAmPm(payload.timeOfEventAmPm),
    timeCannotBeDetermined: asBool(payload.timeCannotBeDetermined) === true,
    activityBefore: asText(payload.activityBefore) || asText(payload.whatDoing),
    whatHappened: asText(payload.whatHappened),
    injuryOrIllness: asText(payload.injuryOrIllness) || description,
    objectOrSubstance: asText(payload.objectOrSubstance),
    dateOfDeath: asDate(payload.dateOfDeath),
  };
}
