/**
 * OSHA Recordkeeping module helpers for Forms 300 / 300A / 301.
 */

import {
  cappedOshaDays,
  OSHA_MAX_COUNTED_DAYS,
  oshaCaseLogYear,
  oshaLogEstablishmentKey,
} from "@forge/contracts";

export {
  cappedOshaDays,
  OSHA_MAX_COUNTED_DAYS,
  oshaCaseLogYear,
  oshaLogEstablishmentKey,
} from "@forge/contracts";

export const OSHA_API = "/api/v1/industrial/osha";
export const OSHA_FORM_300A_API = "/api/v1/industrial/osha-form-300a";
export const INCIDENTS_API = "/api/v1/industrial/incidents";

export function incidentOshaForm301Api(incidentId: string): string {
  return `${INCIDENTS_API}/${encodeURIComponent(incidentId)}/osha-form-301`;
}

export const OSHA_RECORDABILITY = [
  "PENDING",
  "RECORDABLE",
  "NOT_RECORDABLE",
  "PRIVACY_CASE",
] as const;

export type OshaRecordability = (typeof OSHA_RECORDABILITY)[number];

export const OSHA_CASE_OUTCOMES = [
  "DEATH",
  "DAYS_AWAY",
  "JOB_TRANSFER_RESTRICTION",
  "OTHER_RECORDABLE",
] as const;

export type OshaCaseOutcome = (typeof OSHA_CASE_OUTCOMES)[number];

export const OSHA_ILLNESS_CATEGORIES = ["1", "2", "3", "4", "5", "6"] as const;
export type OshaIllnessCategory = (typeof OSHA_ILLNESS_CATEGORIES)[number];

export const OSHA_GENDERS = ["MALE", "FEMALE"] as const;
export type OshaGender = (typeof OSHA_GENDERS)[number];

export const OSHA_AM_PM = ["AM", "PM"] as const;
export type OshaAmPm = (typeof OSHA_AM_PM)[number];

export type OshaCase = {
  id: string;
  title: string;
  status: string;
  incidentId: string;
  employeeName: string;
  injuryDate: string | null;
  recordabilityStatus: OshaRecordability;
  oshaRecordable: boolean | null;
  privacyCase: boolean;
  reviewer: string;
  establishment: string;
  /** The case's division — used as the OSHA establishment in filters and Form 300/300A. */
  division: string;
  calendarYear: number | null;
  daysAway: number | null;
  restrictedDays: number | null;
  jobTitle: string;
  description: string;
  caseNumber: string;
  eventLocation: string;
  caseOutcome: OshaCaseOutcome | null;
  illnessCategory: OshaIllnessCategory | null;
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
  siteId: string | null;
  personnelId: string | null;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
};

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

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function asBool(value: unknown): boolean | null {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
}

function asDate(value: unknown): string | null {
  const raw = asText(value);
  if (!raw) return null;
  const slice = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

function asInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function normalizeOshaRecordability(raw: unknown): OshaRecordability {
  const text = asText(raw)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (text === "RECORDABLE" || text === "YES") return "RECORDABLE";
  if (text === "NOT_RECORDABLE" || text === "NON_RECORDABLE" || text === "NO") {
    return "NOT_RECORDABLE";
  }
  if (text === "PRIVACY_CASE" || text === "PRIVACY") return "PRIVACY_CASE";
  if (OSHA_RECORDABILITY.includes(text as OshaRecordability)) {
    return text as OshaRecordability;
  }
  return "PENDING";
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
    text === "RESTRICTION"
  ) {
    return "JOB_TRANSFER_RESTRICTION";
  }
  if (text === "J" || text === "OTHER_RECORDABLE" || text === "OTHER") return "OTHER_RECORDABLE";
  if ((OSHA_CASE_OUTCOMES as readonly string[]).includes(text)) return text as OshaCaseOutcome;
  return null;
}

export function normalizeOshaIllnessCategory(raw: unknown): OshaIllnessCategory | null {
  const text = asText(raw);
  if (!text) return null;
  const digit = text.replace(/[^\d]/g, "");
  if ((OSHA_ILLNESS_CATEGORIES as readonly string[]).includes(digit)) {
    return digit as OshaIllnessCategory;
  }
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

export function isOshaFormLogCase(status: OshaRecordability): boolean {
  return status === "RECORDABLE" || status === "PRIVACY_CASE";
}

/** Name for Form 300 (column B): privacy cases show "Privacy case" instead of the name. */
export function displayEmployeeName(row: Pick<OshaCase, "employeeName" | "privacyCase">): string {
  return row.privacyCase ? "Privacy case" : row.employeeName || "—";
}

/**
 * Name for Form 301 (field 1). The privacy rule in 1904.29(b)(6) covers the Form 300
 * log only; the confidential 301 keeps the employee's real name.
 */
export function form301EmployeeName(row: Pick<OshaCase, "employeeName">): string {
  return row.employeeName.trim();
}

export function toOshaCase(row: Record<string, unknown>): OshaCase {
  const recordabilityStatus = normalizeOshaRecordability(
    row.recordabilityStatus ??
      (asBool(row.privacyCase) === true
        ? "PRIVACY_CASE"
        : asBool(row.oshaRecordable) === true
          ? "RECORDABLE"
          : asBool(row.oshaRecordable) === false
            ? "NOT_RECORDABLE"
            : "PENDING"),
  );
  const injuryDate = asDate(row.injuryDate) || asDate(row.dateOccurred) || asDate(row.recordDate);
  const yearRaw = row.calendarYear;
  // The injury date decides the log year; calendarYear is only a fallback.
  const calendarYear = injuryDate
    ? Number(injuryDate.slice(0, 4))
    : typeof yearRaw === "number" && Number.isFinite(yearRaw)
      ? Math.trunc(yearRaw)
      : null;

  return {
    id: asText(row.id),
    title: asText(row.title) || asText(row.incidentTitle) || "OSHA case",
    status: asText(row.status) || "OPEN",
    incidentId: asText(row.incidentId),
    employeeName: asText(row.employeeName) || asText(row.workerName),
    injuryDate,
    recordabilityStatus,
    oshaRecordable:
      recordabilityStatus === "RECORDABLE" || recordabilityStatus === "PRIVACY_CASE"
        ? true
        : recordabilityStatus === "NOT_RECORDABLE"
          ? false
          : null,
    privacyCase: recordabilityStatus === "PRIVACY_CASE",
    reviewer: asText(row.reviewer) || asText(row.reviewedBy) || "Pending",
    establishment: asText(row.establishment) || asText(row.siteName) || asText(row.site),
    division: asText(row.division) || asText(row.divisionName),
    calendarYear,
    daysAway:
      row.daysAway == null || row.daysAway === ""
        ? null
        : Number.isFinite(Number(row.daysAway))
          ? Math.trunc(Number(row.daysAway))
          : null,
    restrictedDays:
      row.restrictedDays == null || row.restrictedDays === ""
        ? null
        : Number.isFinite(Number(row.restrictedDays))
          ? Math.trunc(Number(row.restrictedDays))
          : null,
    jobTitle: asText(row.jobTitle),
    description: asText(row.description),
    caseNumber: asText(row.caseNumber),
    eventLocation: asText(row.eventLocation),
    caseOutcome: normalizeOshaCaseOutcome(row.caseOutcome),
    illnessCategory: normalizeOshaIllnessCategory(row.illnessCategory),
    completedBy: asText(row.completedBy),
    completedByTitle: asText(row.completedByTitle),
    completedByPhone: asText(row.completedByPhone),
    completedByDate: asDate(row.completedByDate),
    street: asText(row.street),
    city: asText(row.city),
    state: asText(row.state),
    zip: asText(row.zip),
    dateOfBirth: asDate(row.dateOfBirth),
    dateHired: asDate(row.dateHired),
    gender: normalizeOshaGender(row.gender),
    physicianName: asText(row.physicianName),
    treatmentFacility: asText(row.treatmentFacility),
    treatmentStreet: asText(row.treatmentStreet),
    treatmentCity: asText(row.treatmentCity),
    treatmentState: asText(row.treatmentState),
    treatmentZip: asText(row.treatmentZip),
    treatedInEr: asBool(row.treatedInEr),
    hospitalizedOvernight: asBool(row.hospitalizedOvernight),
    timeBeganWork: asText(row.timeBeganWork),
    timeBeganWorkAmPm: normalizeOshaAmPm(row.timeBeganWorkAmPm),
    timeOfEvent: asText(row.timeOfEvent),
    timeOfEventAmPm: normalizeOshaAmPm(row.timeOfEventAmPm),
    timeCannotBeDetermined: asBool(row.timeCannotBeDetermined) === true,
    activityBefore: asText(row.activityBefore),
    whatHappened: asText(row.whatHappened),
    injuryOrIllness: asText(row.injuryOrIllness) || asText(row.description),
    objectOrSubstance: asText(row.objectOrSubstance),
    dateOfDeath: asDate(row.dateOfDeath),
    siteId: asText(row.siteId) || null,
    personnelId: asText(row.personnelId) || null,
    createdAt: asText(row.createdAt) || undefined,
    updatedAt: asText(row.updatedAt) || undefined,
  };
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

export function toOshaForm300AMeta(row: Record<string, unknown>, year: number): OshaForm300AMeta {
  return {
    year,
    establishmentName: asText(row.establishmentName) || asText(row.establishment),
    street: asText(row.street),
    city: asText(row.city),
    state: asText(row.state),
    zip: asText(row.zip),
    industryDescription: asText(row.industryDescription),
    naics: asText(row.naics).replace(/\D/g, "").slice(0, 6),
    annualAverageEmployees: asInt(row.annualAverageEmployees),
    totalHoursWorked: asInt(row.totalHoursWorked),
    companyExecutive: asText(row.companyExecutive),
    executiveTitle: asText(row.executiveTitle),
    phone: asText(row.phone),
    certificationDate: asDate(row.certificationDate),
  };
}

export function filterOshaCases(
  cases: OshaCase[],
  opts: { year?: number | null; establishment?: string; q?: string },
): OshaCase[] {
  const establishment = oshaLogEstablishmentKey(opts.establishment);
  const q = asText(opts.q).toLowerCase();
  return cases.filter((row) => {
    // Cases with no date at all stay visible in every year so they can be fixed.
    const logYear = oshaCaseLogYear(row);
    if (opts.year != null && logYear != null && logYear !== opts.year) return false;
    // OSHA establishments are divisions.
    if (establishment && establishment !== "all") {
      if (oshaLogEstablishmentKey(row.division) !== establishment) return false;
    }
    if (q) {
      const hay =
        `${row.title} ${row.employeeName} ${row.division} ${row.establishment} ${row.recordabilityStatus} ${row.caseNumber}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function caseNumberSortKey(caseNumber: string): number {
  const match = /(\d+)\s*$/.exec(caseNumber);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

/** Form 300 log rows for one year, in case-number order (then injury date). */
export function logCasesForForm300(cases: OshaCase[], year: number): OshaCase[] {
  return cases
    .filter((c) => isOshaFormLogCase(c.recordabilityStatus) && oshaCaseLogYear(c) === year)
    .sort(
      (a, b) =>
        caseNumberSortKey(a.caseNumber) - caseNumberSortKey(b.caseNumber) ||
        a.caseNumber.localeCompare(b.caseNumber) ||
        (a.injuryDate ?? "").localeCompare(b.injuryDate ?? ""),
    );
}

export type OshaCaseIssue = { caseId: string; label: string; issues: string[] };

/**
 * What is missing or inconsistent on a Form 300 log case. A case with problems here
 * prints wrong or is left out of the Form 300A totals, so fix these before certifying.
 */
export function oshaCaseIssues(c: OshaCase): string[] {
  const issues: string[] = [];
  if (!c.caseNumber.trim()) issues.push("No case number (column A).");
  if (!c.privacyCase && !c.employeeName.trim()) issues.push("No employee name (column B).");
  if (!c.injuryDate) issues.push("No date of injury or onset of illness (column D).");
  if (!c.division.trim()) {
    issues.push(
      c.establishment.trim()
        ? `Establishment "${c.establishment.trim()}" is not one of your divisions. Choose the division in the case's Establishment field.`
        : "No establishment (division).",
    );
  }
  if (!c.description.trim()) issues.push("No description of the injury or illness (column F).");
  if (!c.caseOutcome) {
    issues.push("No outcome checked (columns G–J), so it is missing from the 300A case counts.");
  }
  if (!c.illnessCategory) {
    issues.push(
      "No injury or illness type (column M), so it is missing from the 300A type totals.",
    );
  }
  const away = c.daysAway ?? 0;
  const restricted = c.restrictedDays ?? 0;
  if (away < 0 || restricted < 0) issues.push("Day counts cannot be negative.");
  if (c.caseOutcome === "DAYS_AWAY" && away <= 0) {
    issues.push("Outcome is days away from work but column K has no days.");
  }
  if (c.caseOutcome === "JOB_TRANSFER_RESTRICTION" && restricted <= 0) {
    issues.push("Outcome is job transfer or restriction but column L has no days.");
  }
  if (c.caseOutcome === "JOB_TRANSFER_RESTRICTION" && away > 0) {
    issues.push("Case has days away, so the most serious outcome is days away (H), not I.");
  }
  if (c.caseOutcome === "OTHER_RECORDABLE" && (away > 0 || restricted > 0)) {
    issues.push("Case has days counted, so the outcome should be H or I, not other recordable.");
  }
  if (c.caseOutcome === "DEATH" && !c.dateOfDeath) {
    issues.push("Outcome is death but no date of death is entered (Form 301 field 18).");
  }
  if (away + restricted > OSHA_MAX_COUNTED_DAYS) {
    issues.push(`Days are capped at ${OSHA_MAX_COUNTED_DAYS} combined on the forms.`);
  }
  return issues;
}

/** Problems on every log case for the year, plus duplicate case numbers. */
/**
 * Recordable cases that cannot land on any establishment’s Form 300 for `year`:
 * no injury date (no log year at all) or no establishment. Per-site filtering hides
 * these, so they are listed separately or they would drop off every printed log.
 */
export function form300UnplacedIssues(cases: OshaCase[], year: number): OshaCaseIssue[] {
  return cases
    .filter((c) => {
      if (!isOshaFormLogCase(c.recordabilityStatus)) return false;
      const logYear = oshaCaseLogYear(c);
      return logYear == null || (logYear === year && !oshaLogEstablishmentKey(c.division));
    })
    .map((c) => ({
      caseId: c.id,
      label: `${c.caseNumber ? `Case ${c.caseNumber}` : "Unnumbered case"} — ${displayEmployeeName(c)}`,
      issues: ["Not on any Form 300 log until fixed.", ...oshaCaseIssues(c)],
    }));
}

/** Everything to fix before printing one establishment’s log: its cases plus unplaced ones. */
export function form300PrintIssues(
  logCases: OshaCase[],
  allCases: OshaCase[],
  year: number,
): OshaCaseIssue[] {
  const out = form300LogIssues(logCases);
  const seen = new Set(out.map((item) => item.caseId));
  for (const item of form300UnplacedIssues(allCases, year)) {
    if (!seen.has(item.caseId)) out.push(item);
  }
  return out;
}

export function form300LogIssues(logCases: OshaCase[]): OshaCaseIssue[] {
  const seen = new Map<string, number>();
  for (const c of logCases) {
    const key = c.caseNumber.trim().toLowerCase();
    if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const out: OshaCaseIssue[] = [];
  for (const c of logCases) {
    const issues = oshaCaseIssues(c);
    const key = c.caseNumber.trim().toLowerCase();
    if (key && (seen.get(key) ?? 0) > 1) {
      issues.unshift(`Case number ${c.caseNumber} is used more than once on this log.`);
    }
    if (issues.length > 0) {
      out.push({
        caseId: c.id,
        label: `${c.caseNumber ? `Case ${c.caseNumber}` : "Unnumbered case"} — ${displayEmployeeName(c)}`,
        issues,
      });
    }
  }
  return out;
}

export function summarizeOshaCases(cases: OshaCase[]): {
  total: number;
  pending: number;
  recordable: number;
  notRecordable: number;
  privacy: number;
} {
  const summary = {
    total: cases.length,
    pending: 0,
    recordable: 0,
    notRecordable: 0,
    privacy: 0,
  };
  for (const row of cases) {
    if (row.recordabilityStatus === "PENDING") summary.pending += 1;
    else if (row.recordabilityStatus === "RECORDABLE") summary.recordable += 1;
    else if (row.recordabilityStatus === "NOT_RECORDABLE") summary.notRecordable += 1;
    else if (row.recordabilityStatus === "PRIVACY_CASE") summary.privacy += 1;
  }
  return summary;
}

/**
 * Cases with no division but an establishment (site) that names one of the tenant's
 * divisions get that division, so they are not flagged as missing an establishment
 * and land on the right Form 300. Matches the whole establishment or any part of a
 * site path ("Producers Rice Mill / Stuttgart Milling", "Parboil - Packing").
 */
export function withEstablishmentDivisions(cases: OshaCase[], divisionCatalog: string[]): OshaCase[] {
  const byKey = new Map<string, string>();
  for (const raw of divisionCatalog) {
    const name = asText(raw);
    const key = oshaLogEstablishmentKey(name);
    if (key && !byKey.has(key)) byKey.set(key, name);
  }
  if (byKey.size === 0) return cases;
  return cases.map((c) => {
    if (c.division.trim()) return c;
    const est = c.establishment.trim();
    if (!est) return c;
    const parts = [est, ...est.split(/\s*(?:\/|>|\||,|\s-\s)\s*/)];
    for (const part of parts) {
      const match = byKey.get(oshaLogEstablishmentKey(part));
      if (match) return { ...c, division: match };
    }
    return c;
  });
}

/**
 * Establishment choices: only the tenant's division catalog (trimmed, case-insensitive dedupe,
 * sorted). Divisions typed on cases but missing from the catalog are not offered.
 */
export function establishmentOptions(divisionCatalog: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const raw of divisionCatalog) {
    const name = asText(raw);
    const key = oshaLogEstablishmentKey(name);
    if (key && !byKey.has(key)) byKey.set(key, name);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export function recordabilityBadgeClass(status: OshaRecordability): string {
  if (status === "RECORDABLE") return "bg-label-success";
  if (status === "NOT_RECORDABLE") return "bg-label-secondary";
  if (status === "PRIVACY_CASE") return "bg-label-warning";
  return "bg-label-primary";
}

export function recordabilityLabel(status: OshaRecordability): string {
  if (status === "RECORDABLE") return "Recordable";
  if (status === "NOT_RECORDABLE") return "Not recordable";
  if (status === "PRIVACY_CASE") return "Privacy case";
  return "Pending";
}

export function caseOutcomeLabel(outcome: OshaCaseOutcome | null): string {
  if (outcome === "DEATH") return "Death";
  if (outcome === "DAYS_AWAY") return "Days away from work";
  if (outcome === "JOB_TRANSFER_RESTRICTION") return "Job transfer or restriction";
  if (outcome === "OTHER_RECORDABLE") return "Other recordable cases";
  return "";
}

export function illnessCategoryLabel(cat: OshaIllnessCategory | null): string {
  if (cat === "1") return "Injury";
  if (cat === "2") return "Skin disorder";
  if (cat === "3") return "Respiratory condition";
  if (cat === "4") return "Poisoning";
  if (cat === "5") return "Hearing loss";
  if (cat === "6") return "All other illnesses";
  return "";
}

export function incidentHref(id: string): string {
  return `/modules/incidents/?tab=injuries&incident=${encodeURIComponent(id)}`;
}

/** Format YYYY-MM-DD as MM/DD for Form 300 column (D). */
export function formatOshaMonthDay(date: string | null | undefined): string {
  if (!date || date.length < 10) return "";
  return `${date.slice(5, 7)}/${date.slice(8, 10)}`;
}

/** Format YYYY-MM-DD as MM/DD/YYYY for Form 301 date fields. */
export function formatOshaDateMdY(date: string | null | undefined): string {
  if (!date || date.length < 10) return "";
  return `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}`;
}

/**
 * Autofill Form 301 from the linked Form 300 log case.
 * Case number (field 10) always comes from Form 300 column (A).
 * Empty 301 narrative / identity fields inherit Form 300 columns B/D/E/F.
 */
export function autofillForm301FromForm300(caseRow: OshaCase): OshaCase {
  const description = caseRow.description.trim();
  const location = caseRow.eventLocation.trim();
  return {
    ...caseRow,
    caseNumber: caseRow.caseNumber,
    injuryDate: caseRow.injuryDate,
    employeeName: caseRow.employeeName,
    injuryOrIllness: caseRow.injuryOrIllness.trim() || description,
    whatHappened: caseRow.whatHappened.trim() || description,
    activityBefore: caseRow.activityBefore.trim() || (location ? `Working at ${location}` : ""),
    objectOrSubstance: caseRow.objectOrSubstance.trim(),
    dateOfDeath:
      caseRow.dateOfDeath || (caseRow.caseOutcome === "DEATH" ? caseRow.injuryDate : null),
  };
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** OSHA Form 300 CSV with official A–M columns for the filtered year. */
export function buildForm300Csv(cases: OshaCase[], year: number): string {
  const header = [
    "(A) Case no.",
    "(B) Employee's name",
    "(C) Job title",
    "(D) Date of injury or onset of illness",
    "(E) Where the event occurred",
    "(F) Describe injury or illness",
    "(G) Death",
    "(H) Days away from work",
    "(I) Job transfer or restriction",
    "(J) Other recordable cases",
    "(K) Away from work (days)",
    "(L) On job transfer or restriction (days)",
    "(M1) Injury",
    "(M2) Skin disorder",
    "(M3) Respiratory condition",
    "(M4) Poisoning",
    "(M5) Hearing loss",
    "(M6) All other illnesses",
  ];
  const rows = logCasesForForm300(cases, year).map((c) =>
    [
      c.caseNumber,
      displayEmployeeName(c) === "—" ? "" : displayEmployeeName(c),
      c.jobTitle,
      c.injuryDate ?? "",
      c.eventLocation,
      c.description,
      c.caseOutcome === "DEATH" ? "X" : "",
      c.caseOutcome === "DAYS_AWAY" ? "X" : "",
      c.caseOutcome === "JOB_TRANSFER_RESTRICTION" ? "X" : "",
      c.caseOutcome === "OTHER_RECORDABLE" ? "X" : "",
      c.daysAway == null ? "" : cappedOshaDays(c.daysAway, c.restrictedDays).daysAway,
      c.restrictedDays == null ? "" : cappedOshaDays(c.daysAway, c.restrictedDays).restrictedDays,
      c.illnessCategory === "1" ? "X" : "",
      c.illnessCategory === "2" ? "X" : "",
      c.illnessCategory === "3" ? "X" : "",
      c.illnessCategory === "4" ? "X" : "",
      c.illnessCategory === "5" ? "X" : "",
      c.illnessCategory === "6" ? "X" : "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function form300ATotals(cases: OshaCase[], year: number): OshaForm300ATotals {
  // Official rule: transfer page totals from each Form 300 page onto 300A.
  // Summing per-page totals matches aggregating the full log.
  return form300ATotalsFromPageTotals(cases, year);
}

/** Sum Form 300 page totals (G–M) into Form 300A summary values. */
export function form300ATotalsFromPageTotals(cases: OshaCase[], year: number): OshaForm300ATotals {
  const pages = chunkForm300Pages(logCasesForForm300(cases, year));
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
  for (const pageCases of pages) {
    const page = form300PageTotals(pageCases);
    totals.deaths += page.deaths;
    totals.daysAwayCases += page.daysAwayCases;
    totals.jobTransferCases += page.jobTransferCases;
    totals.otherRecordableCases += page.otherRecordableCases;
    totals.daysAway += page.daysAway;
    totals.restrictedDays += page.restrictedDays;
    totals.injuries += page.m1;
    totals.skinDisorders += page.m2;
    totals.respiratoryConditions += page.m3;
    totals.poisonings += page.m4;
    totals.hearingLoss += page.m5;
    totals.allOtherIllnesses += page.m6;
  }
  return totals;
}

/** @deprecated Prefer form300ATotals — kept for transitional call sites. */
export function form300ASummary(cases: OshaCase[], year: number) {
  const totals = form300ATotals(cases, year);
  const inYear = cases.filter((c) => oshaCaseLogYear(c) === year);
  return {
    year,
    totalCases: inYear.length,
    recordableCases:
      totals.deaths + totals.daysAwayCases + totals.jobTransferCases + totals.otherRecordableCases,
    privacyCases: inYear.filter((c) => c.recordabilityStatus === "PRIVACY_CASE").length,
    daysAway: totals.daysAway,
    restrictedDays: totals.restrictedDays,
  };
}

export function form300PageTotals(cases: OshaCase[]) {
  return {
    deaths: cases.filter((c) => c.caseOutcome === "DEATH").length,
    daysAwayCases: cases.filter((c) => c.caseOutcome === "DAYS_AWAY").length,
    jobTransferCases: cases.filter((c) => c.caseOutcome === "JOB_TRANSFER_RESTRICTION").length,
    otherRecordableCases: cases.filter((c) => c.caseOutcome === "OTHER_RECORDABLE").length,
    daysAway: cases.reduce(
      (sum, c) => sum + cappedOshaDays(c.daysAway, c.restrictedDays).daysAway,
      0,
    ),
    restrictedDays: cases.reduce(
      (sum, c) => sum + cappedOshaDays(c.daysAway, c.restrictedDays).restrictedDays,
      0,
    ),
    m1: cases.filter((c) => c.illnessCategory === "1").length,
    m2: cases.filter((c) => c.illnessCategory === "2").length,
    m3: cases.filter((c) => c.illnessCategory === "3").length,
    m4: cases.filter((c) => c.illnessCategory === "4").length,
    m5: cases.filter((c) => c.illnessCategory === "5").length,
    m6: cases.filter((c) => c.illnessCategory === "6").length,
  };
}

/** Official OSHA Form 300 fillable PDF has 10 case rows per page. */
export const OSHA_FORM_300_ROWS_PER_PAGE = 10;

/** Split Form 300 log cases into official page-sized chunks (page totals are per chunk). */
export function chunkForm300Pages<T>(cases: T[], pageSize = OSHA_FORM_300_ROWS_PER_PAGE): T[][] {
  if (cases.length === 0) return [[]];
  const pages: T[][] = [];
  for (let i = 0; i < cases.length; i += pageSize) {
    pages.push(cases.slice(i, i + pageSize));
  }
  return pages;
}
