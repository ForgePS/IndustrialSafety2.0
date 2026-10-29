export const PERFORMANCE_GROUP_BY = ["site", "division", "department", "area"] as const;
export type PerformanceGroupBy = (typeof PERFORMANCE_GROUP_BY)[number];

export const PERFORMANCE_GROUP_LABELS: Record<PerformanceGroupBy, string> = {
  site: "Location",
  division: "Division",
  department: "Department",
  area: "Area",
};

export const PERFORMANCE_SECTION_IDS = [
  "incidents",
  "osha",
  "workers_comp",
  "observations",
  "inspections",
  "training",
  "corrective_actions",
  "discipline",
  "safety_score",
  "employees",
  "loto",
  "sanitation",
  "fleet_dot",
  "jsas",
] as const;
export type PerformanceSectionId = (typeof PERFORMANCE_SECTION_IDS)[number];

export type MetricFormat = "count" | "percent" | "rate" | "score" | "hours" | "days";
export type PerformanceMetric = {
  key: string;
  label: string;
  format: MetricFormat;
  better?: "higher" | "lower";
};

type RawValues = Record<string, number>;
export type MetricValues = Record<string, number | null>;

type SectionSpec = {
  id: Exclude<PerformanceSectionId, "employees">;
  title: string;
  description: string;
  metrics: PerformanceMetric[];
  headline: string[];
  derive?: (raw: RawValues) => MetricValues;
};

const n = (raw: RawValues, key: string) => raw[key] ?? 0;
const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
const OSHA_RATE_BASE = 200_000;
const rate = (cases: number, hours: number) =>
  hours > 0 ? Math.round(((cases * OSHA_RATE_BASE) / hours) * 100) / 100 : null;

/** Same weighting as the dashboard Safety Index (enterprise hint omitted). */
export function computeSafetyIndex(input: {
  openIncidents: number;
  totalIncidents: number;
  inspectionCount: number;
  trainingCount: number;
}): number {
  let score = 100;
  score -= Math.min(input.openIncidents * 4, 24);
  if (input.totalIncidents > 0) {
    const closedRatio = 1 - input.openIncidents / input.totalIncidents;
    score = score * 0.6 + closedRatio * 100 * 0.4;
  }
  if (input.inspectionCount > 0) score = score * 0.85 + 15;
  if (input.trainingCount > 0) score = score * 0.92 + 8;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function safetyGrade(score: number | null): string {
  if (score === null) return "-";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export const PERFORMANCE_SECTIONS: SectionSpec[] = [
  {
    id: "incidents",
    title: "Incidents",
    description: "Incidents that occurred during the period, by type.",
    metrics: [
      { key: "total", label: "Total", format: "count", better: "lower" },
      { key: "injuries", label: "Injuries", format: "count", better: "lower" },
      { key: "nearMisses", label: "Near misses", format: "count" },
      { key: "medicalRefusals", label: "Medical refusals", format: "count" },
      { key: "drugAlcohol", label: "Drug/Alcohol", format: "count", better: "lower" },
      { key: "propertyDamage", label: "Property damage", format: "count", better: "lower" },
      { key: "automotive", label: "Automotive", format: "count", better: "lower" },
      { key: "open", label: "Still open", format: "count", better: "lower" },
      { key: "closedPct", label: "Closed %", format: "percent", better: "higher" },
    ],
    headline: ["total", "injuries"],
    derive: (raw) => ({ closedPct: pct(n(raw, "total") - n(raw, "open"), n(raw, "total")) }),
  },
  {
    id: "osha",
    title: "OSHA recordables & rates",
    description:
      "OSHA log cases with an injury date in the period. Rates are per 200,000 hours worked.",
    metrics: [
      { key: "recordable", label: "Recordable cases", format: "count", better: "lower" },
      { key: "daysAwayCases", label: "Days-away cases", format: "count", better: "lower" },
      {
        key: "transferCases",
        label: "Restricted/transfer cases",
        format: "count",
        better: "lower",
      },
      { key: "otherCases", label: "Other recordable", format: "count", better: "lower" },
      { key: "daysAway", label: "Lost workdays", format: "days", better: "lower" },
      { key: "restrictedDays", label: "Restricted days", format: "days", better: "lower" },
      { key: "hoursWorked", label: "Hours worked", format: "hours" },
      { key: "trir", label: "TRIR", format: "rate", better: "lower" },
      { key: "dart", label: "DART", format: "rate", better: "lower" },
    ],
    headline: ["recordable", "trir", "dart"],
    derive: (raw) => {
      const hours = n(raw, "hoursWorked");
      return {
        hoursWorked: hours > 0 ? Math.round(hours) : null,
        trir: rate(n(raw, "recordable"), hours),
        dart: rate(n(raw, "daysAwayCases") + n(raw, "transferCases"), hours),
      };
    },
  },
  {
    id: "workers_comp",
    title: "Workers' compensation",
    description: "Claims reported during the period, plus claims open today.",
    metrics: [
      { key: "opened", label: "Claims reported", format: "count", better: "lower" },
      { key: "lostTime", label: "Lost-time claims", format: "count", better: "lower" },
      { key: "restricted", label: "Restricted-duty claims", format: "count", better: "lower" },
      { key: "daysAway", label: "Days away", format: "days", better: "lower" },
      { key: "restrictedDays", label: "Restricted days", format: "days", better: "lower" },
      { key: "openNow", label: "Open today", format: "count", better: "lower" },
    ],
    headline: ["opened", "openNow"],
  },
  {
    id: "observations",
    title: "Safety observations",
    description: "Observations recorded during the period.",
    metrics: [
      { key: "total", label: "Total", format: "count", better: "higher" },
      { key: "positive", label: "Positive", format: "count", better: "higher" },
      { key: "unsafe", label: "Unsafe / at-risk", format: "count", better: "lower" },
      { key: "highRisk", label: "High/critical risk", format: "count", better: "lower" },
      { key: "open", label: "Still open", format: "count", better: "lower" },
      { key: "positivePct", label: "Positive %", format: "percent", better: "higher" },
    ],
    headline: ["total", "positivePct"],
    derive: (raw) => ({ positivePct: pct(n(raw, "positive"), n(raw, "total")) }),
  },
  {
    id: "inspections",
    title: "Inspections",
    description: "Inspections created during the period and how many were completed.",
    metrics: [
      { key: "total", label: "Inspections", format: "count", better: "higher" },
      { key: "completed", label: "Completed", format: "count", better: "higher" },
      { key: "completionPct", label: "Completion %", format: "percent", better: "higher" },
      { key: "openNow", label: "Open today", format: "count", better: "lower" },
    ],
    headline: ["total", "completionPct"],
    derive: (raw) => ({ completionPct: pct(n(raw, "completed"), n(raw, "total")) }),
  },
  {
    id: "training",
    title: "Training",
    description:
      "Completions during the period. Overdue, assignment completion, and certificate status are as of today.",
    metrics: [
      { key: "completions", label: "Completions", format: "count", better: "higher" },
      { key: "overdue", label: "Overdue assignments", format: "count", better: "lower" },
      { key: "openAssignments", label: "Open assignments", format: "count" },
      {
        key: "assignmentPct",
        label: "Assignment completion %",
        format: "percent",
        better: "higher",
      },
      { key: "expiredCerts", label: "Expired certifications", format: "count", better: "lower" },
      { key: "expiringCerts", label: "Expiring in 30 days", format: "count", better: "lower" },
    ],
    headline: ["completions", "overdue", "assignmentPct"],
    derive: (raw) => ({
      assignmentPct: pct(n(raw, "_assigneesPassed"), n(raw, "_assigneesTotal")),
    }),
  },
  {
    id: "corrective_actions",
    title: "Corrective actions",
    description: "Actions opened and closed during the period, plus the open backlog today.",
    metrics: [
      { key: "opened", label: "Opened", format: "count" },
      { key: "closed", label: "Closed", format: "count", better: "higher" },
      { key: "onTimePct", label: "Closed on time %", format: "percent", better: "higher" },
      { key: "openNow", label: "Open today", format: "count", better: "lower" },
      { key: "overdueNow", label: "Overdue today", format: "count", better: "lower" },
    ],
    headline: ["openNow", "overdueNow", "onTimePct"],
    derive: (raw) => ({ onTimePct: pct(n(raw, "_closedOnTime"), n(raw, "_closedWithDue")) }),
  },
  {
    id: "discipline",
    title: "Disciplinary actions",
    description:
      "Actions issued during the period. Active points are as of today (12-month window).",
    metrics: [
      { key: "actions", label: "Actions issued", format: "count", better: "lower" },
      { key: "coaching", label: "Coaching", format: "count" },
      { key: "verbal", label: "Verbal", format: "count" },
      { key: "written", label: "Written", format: "count" },
      { key: "final", label: "Final", format: "count" },
      { key: "suspension", label: "Suspension", format: "count" },
      { key: "termination", label: "Termination", format: "count" },
      {
        key: "employeesActive",
        label: "Employees with active points",
        format: "count",
        better: "lower",
      },
      { key: "activePoints", label: "Active points", format: "count", better: "lower" },
    ],
    headline: ["actions", "employeesActive"],
  },
  {
    id: "safety_score",
    title: "Safety score",
    description:
      "Safety Index for the period (dashboard formula) and the average current employee safety score.",
    metrics: [
      { key: "safetyIndex", label: "Safety Index", format: "score", better: "higher" },
      { key: "avgEmployeeScore", label: "Avg employee score", format: "score", better: "higher" },
      { key: "employeesScored", label: "Employees scored", format: "count" },
      { key: "employeesBelow70", label: "Employees below 70", format: "count", better: "lower" },
    ],
    headline: ["safetyIndex", "avgEmployeeScore"],
    derive: (raw) => ({
      safetyIndex: computeSafetyIndex({
        openIncidents: n(raw, "_incOpen"),
        totalIncidents: n(raw, "_incTotal"),
        inspectionCount: n(raw, "_inspections"),
        trainingCount: n(raw, "_training"),
      }),
      avgEmployeeScore:
        n(raw, "employeesScored") > 0
          ? Math.round(n(raw, "_scoreSum") / n(raw, "employeesScored"))
          : null,
    }),
  },
  {
    id: "loto",
    title: "Lockout/Tagout",
    description:
      "Lockouts started during the period; open/overdue lockouts and procedures as of today.",
    metrics: [
      { key: "lockouts", label: "Lockouts", format: "count" },
      { key: "openNow", label: "Open today", format: "count" },
      { key: "overdueNow", label: "Overdue today", format: "count", better: "lower" },
      { key: "procedures", label: "Active procedures", format: "count", better: "higher" },
    ],
    headline: ["lockouts", "overdueNow"],
  },
  {
    id: "sanitation",
    title: "Sanitation",
    description: "Sanitation inspections and findings during the period; open items as of today.",
    metrics: [
      { key: "inspections", label: "Inspections completed", format: "count", better: "higher" },
      { key: "avgScore", label: "Avg inspection score", format: "percent", better: "higher" },
      { key: "findings", label: "Findings", format: "count", better: "lower" },
      {
        key: "criticalFindings",
        label: "Critical/major findings",
        format: "count",
        better: "lower",
      },
      { key: "openFindings", label: "Open findings today", format: "count", better: "lower" },
      { key: "overdueCleaning", label: "Overdue cleaning tasks", format: "count", better: "lower" },
    ],
    headline: ["inspections", "avgScore", "openFindings"],
    derive: (raw) => ({
      avgScore:
        n(raw, "_scoreCount") > 0
          ? Math.round((n(raw, "_scoreSum") / n(raw, "_scoreCount")) * 10) / 10
          : null,
    }),
  },
  {
    id: "fleet_dot",
    title: "Fleet & DOT",
    description: "DOT compliance records during the period; fleet status as of today.",
    metrics: [
      { key: "dotRecords", label: "DOT records", format: "count" },
      { key: "dotOpen", label: "DOT items needing attention", format: "count", better: "lower" },
      { key: "vehicles", label: "Active vehicles", format: "count" },
      { key: "outOfService", label: "Out of service", format: "count", better: "lower" },
    ],
    headline: ["dotRecords", "outOfService"],
  },
  {
    id: "jsas",
    title: "Job safety analyses",
    description: "JSAs created during the period; open JSAs as of today.",
    metrics: [
      { key: "created", label: "Created", format: "count", better: "higher" },
      { key: "openNow", label: "Draft / in review today", format: "count" },
    ],
    headline: ["created"],
  },
];

export const PERFORMANCE_SECTION_TITLES: Record<PerformanceSectionId, string> = {
  ...(Object.fromEntries(PERFORMANCE_SECTIONS.map((s) => [s.id, s.title])) as Record<
    Exclude<PerformanceSectionId, "employees">,
    string
  >),
  employees: "Employee rankings",
};

// ---------------------------------------------------------------- request

export type PerformanceReportRequest = {
  from: string;
  to: string;
  groupBy: PerformanceGroupBy;
  sections: PerformanceSectionId[];
  siteIds: string[];
  divisions: string[];
  departmentIds: string[];
  employeeLimit: number;
  hoursWorked: number | null;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PERIOD_DAYS = 3 * 366;

function stringList(raw: unknown, max = 200): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s && !out.includes(s)) out.push(s.slice(0, 300));
    if (out.length >= max) break;
  }
  return out;
}

export class PerformanceRequestError extends Error {}

export function normalizePerformanceRequest(
  body: Record<string, unknown>,
  now = new Date(),
): PerformanceReportRequest {
  const today = now.toISOString().slice(0, 10);
  const from =
    typeof body.from === "string" && ISO_DAY.test(body.from)
      ? body.from
      : `${today.slice(0, 4)}-01-01`;
  const to = typeof body.to === "string" && ISO_DAY.test(body.to) ? body.to : today;
  if (
    Number.isNaN(Date.parse(`${from}T00:00:00Z`)) ||
    Number.isNaN(Date.parse(`${to}T00:00:00Z`))
  ) {
    throw new PerformanceRequestError("Invalid report dates");
  }
  if (to < from)
    throw new PerformanceRequestError("The end date must be on or after the start date");
  if (periodDays(from, to) > MAX_PERIOD_DAYS) {
    throw new PerformanceRequestError("Reports can cover at most 3 years");
  }
  const groupBy = PERFORMANCE_GROUP_BY.includes(body.groupBy as PerformanceGroupBy)
    ? (body.groupBy as PerformanceGroupBy)
    : "site";
  const requested = stringList(body.sections, 50);
  const sections = requested.length
    ? PERFORMANCE_SECTION_IDS.filter((id) => requested.includes(id))
    : [...PERFORMANCE_SECTION_IDS];
  if (!sections.length) throw new PerformanceRequestError("Select at least one report section");
  const limitRaw = Number(body.employeeLimit);
  const employeeLimit = Number.isFinite(limitRaw)
    ? Math.min(25, Math.max(1, Math.round(limitRaw)))
    : 5;
  const hoursRaw = Number(body.hoursWorked);
  const hoursWorked =
    body.hoursWorked !== undefined &&
    body.hoursWorked !== null &&
    body.hoursWorked !== "" &&
    Number.isFinite(hoursRaw) &&
    hoursRaw > 0
      ? Math.round(hoursRaw)
      : null;
  return {
    from,
    to,
    groupBy,
    sections,
    siteIds: stringList(body.siteIds).filter((id) => UUID.test(id)),
    divisions: stringList(body.divisions),
    departmentIds: stringList(body.departmentIds).filter((id) => UUID.test(id)),
    employeeLimit,
    hoursWorked,
  };
}

// ---------------------------------------------------------------- dates

/** Calendar day (YYYY-MM-DD) from a Date, ISO string, or US-style date. */
export function toIsoDay(value: unknown): string | null {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (iso) return iso[1]!;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (us) return `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

export function inPeriod(day: string | null, period: { from: string; to: string }): boolean {
  return day !== null && day >= period.from && day <= period.to;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function periodDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

export const ESTIMATED_HOURS_PER_EMPLOYEE_YEAR = 2000;

/**
 * Hours for one site over the period: each calendar year's Form 300A total is
 * prorated by the days of that year in the period; years with no 300A hours
 * fall back to headcount x 2,000 hours.
 */
export function siteHoursForPeriod(input: {
  from: string;
  to: string;
  annualHours: (year: number) => number | null;
  headcount: number;
}): { hours: number; estimated: boolean } {
  let hours = 0;
  let estimated = false;
  const startYear = Number(input.from.slice(0, 4));
  const endYear = Number(input.to.slice(0, 4));
  for (let year = startYear; year <= endYear; year += 1) {
    const yFrom = year === startYear ? input.from : `${year}-01-01`;
    const yTo = year === endYear ? input.to : `${year}-12-31`;
    const share = periodDays(yFrom, yTo) / daysInYear(year);
    const annual = input.annualHours(year);
    if (annual !== null && annual > 0) {
      hours += annual * share;
    } else {
      hours += input.headcount * ESTIMATED_HOURS_PER_EMPLOYEE_YEAR * share;
      if (input.headcount > 0) estimated = true;
    }
  }
  return { hours, estimated };
}

// ---------------------------------------------------------------- status

export function isClosedStatus(status: unknown): boolean {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  if (/incomplet|not[\s_-]?(complet|closed|started)|reopen/.test(s)) return false;
  return /clos|resolv|archiv|complet|cancel|denied|void|done|verified|rescind|passed/.test(s);
}

export function incidentCategoryKey(payload: Record<string, unknown>): string | null {
  const category = String(payload.category ?? payload.incidentCategory ?? "")
    .trim()
    .toLowerCase();
  if (category === "injuries" || category === "injury") return "injuries";
  if (category === "near-misses" || category === "near_miss" || category === "nearmiss")
    return "nearMisses";
  if (category === "medical-refusals" || category === "medical_refusals") return "medicalRefusals";
  if (category === "drug-alcohol" || category === "drug_alcohol") return "drugAlcohol";
  if (category === "property-damage" || category === "property_damage") return "propertyDamage";
  if (category === "automotive" || category === "vehicle") return "automotive";
  return null;
}

// ---------------------------------------------------------------- org units

export type OrgDirectory = {
  sites: Map<string, string>;
  departments: Map<string, { name: string; siteId: string | null; division: string }>;
  departmentIdByName: Map<string, string>;
  personnel: Map<
    string,
    { siteId: string | null; departmentId: string | null; departmentName: string; division: string }
  >;
};

export function buildOrgDirectory(input: {
  sites: Array<{ id: string; name: string }>;
  departments: Array<{
    id: string;
    name: string;
    siteId: string | null;
    divisionName: string | null;
  }>;
  personnel: Array<{
    id: string;
    siteId: string | null;
    departmentId: string | null;
    departmentName: string | null;
    divisionName: string | null;
  }>;
}): OrgDirectory {
  const sites = new Map(input.sites.map((s) => [s.id, s.name.trim() || "Unnamed location"]));
  const departments = new Map<string, { name: string; siteId: string | null; division: string }>();
  const departmentIdByName = new Map<string, string>();
  for (const d of input.departments) {
    const name = d.name.trim() || "Unnamed department";
    departments.set(d.id, { name, siteId: d.siteId, division: (d.divisionName ?? "").trim() });
    const key = name.toLowerCase();
    if (!departmentIdByName.has(key)) departmentIdByName.set(key, d.id);
  }
  const personnel = new Map(
    input.personnel.map((p) => [
      p.id,
      {
        siteId: p.siteId,
        departmentId: p.departmentId,
        departmentName: (p.departmentName ?? "").trim(),
        division: (p.divisionName ?? "").trim(),
      },
    ]),
  );
  return { sites, departments, departmentIdByName, personnel };
}

export type OrgHint = {
  siteId?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  division?: string | null;
  area?: string | null;
  personnelId?: string | null;
};

export type ResolvedOrgUnit = {
  siteId: string | null;
  siteName: string;
  departmentId: string | null;
  departmentName: string;
  division: string;
  area: string;
};

const clean = (v: string | null | undefined) => (typeof v === "string" ? v.trim() : "");

/**
 * Explicit department wins (id, then name), then the linked employee's
 * department; location and division come from the record, then department,
 * then employee.
 */
export function resolveOrgUnit(dir: OrgDirectory, hint: OrgHint): ResolvedOrgUnit {
  const person = hint.personnelId ? dir.personnel.get(hint.personnelId) : undefined;
  const byName = (name: string) =>
    name ? dir.departmentIdByName.get(name.toLowerCase()) : undefined;
  const hintDeptId = clean(hint.departmentId);
  let departmentId =
    (hintDeptId && dir.departments.has(hintDeptId) ? hintDeptId : undefined) ??
    byName(clean(hint.departmentName));
  let looseDepartmentName = departmentId ? "" : clean(hint.departmentName);
  if (!departmentId && !looseDepartmentName && person) {
    departmentId =
      (person.departmentId && dir.departments.has(person.departmentId)
        ? person.departmentId
        : undefined) ?? byName(person.departmentName);
    if (!departmentId) looseDepartmentName = person.departmentName;
  }
  const dept = departmentId ? dir.departments.get(departmentId) : undefined;
  const hintSite = clean(hint.siteId);
  const siteId =
    (hintSite && dir.sites.has(hintSite) ? hintSite : null) ??
    (dept?.siteId && dir.sites.has(dept.siteId) ? dept.siteId : null) ??
    (person?.siteId && dir.sites.has(person.siteId) ? person.siteId : null);
  return {
    siteId,
    siteName: siteId ? dir.sites.get(siteId)! : "No location",
    departmentId: departmentId ?? null,
    departmentName: dept?.name ?? (looseDepartmentName || "No department"),
    division: clean(hint.division) || dept?.division || person?.division || "",
    area: clean(hint.area),
  };
}

export function orgGroupKey(
  unit: ResolvedOrgUnit,
  groupBy: PerformanceGroupBy,
): { key: string; label: string } {
  switch (groupBy) {
    case "site":
      return { key: unit.siteId ?? "none", label: unit.siteName };
    case "division":
      return unit.division
        ? { key: `div:${unit.division.toLowerCase()}`, label: unit.division }
        : { key: "none", label: "No division" };
    case "department":
      if (unit.departmentId) return { key: unit.departmentId, label: unit.departmentName };
      return unit.departmentName !== "No department"
        ? { key: `dept:${unit.departmentName.toLowerCase()}`, label: unit.departmentName }
        : { key: "none", label: "No department" };
    case "area":
      return unit.area
        ? { key: `area:${unit.area.toLowerCase()}`, label: unit.area }
        : { key: "none", label: "No area" };
  }
}

export type PerformanceFilters = Pick<
  PerformanceReportRequest,
  "siteIds" | "divisions" | "departmentIds"
>;

export function unitMatchesFilters(unit: ResolvedOrgUnit, filters: PerformanceFilters): boolean {
  if (filters.siteIds.length && (!unit.siteId || !filters.siteIds.includes(unit.siteId)))
    return false;
  if (
    filters.divisions.length &&
    !filters.divisions.some((d) => d.toLowerCase() === unit.division.toLowerCase())
  ) {
    return false;
  }
  if (
    filters.departmentIds.length &&
    (!unit.departmentId || !filters.departmentIds.includes(unit.departmentId))
  ) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------- accumulation

type GroupBucket = { key: string; label: string; values: Map<string, RawValues> };

export class PerformanceAccumulator {
  private readonly groups = new Map<string, GroupBucket>();
  private readonly totals = new Map<string, RawValues>();

  constructor(
    private readonly dir: OrgDirectory,
    private readonly groupBy: PerformanceGroupBy,
    private readonly filters: PerformanceFilters,
  ) {}

  /** Resolved unit, or null when the record falls outside the report filters. */
  unit(hint: OrgHint): ResolvedOrgUnit | null {
    const unit = resolveOrgUnit(this.dir, hint);
    return unitMatchesFilters(unit, this.filters) ? unit : null;
  }

  add(section: string, unit: ResolvedOrgUnit | null, metric: string, amount = 1): void {
    if (!unit || !amount) return;
    const { key, label } = orgGroupKey(unit, this.groupBy);
    let bucket = this.groups.get(key);
    if (!bucket) {
      bucket = { key, label, values: new Map() };
      this.groups.set(key, bucket);
    }
    bump(bucket.values, section, metric, amount);
    bump(this.totals, section, metric, amount);
  }

  /** Adds directly to one group (used for hours that are already allocated). */
  addToGroup(
    section: string,
    group: { key: string; label: string },
    metric: string,
    amount: number,
  ): void {
    if (!amount) return;
    let bucket = this.groups.get(group.key);
    if (!bucket) {
      bucket = { key: group.key, label: group.label, values: new Map() };
      this.groups.set(group.key, bucket);
    }
    bump(bucket.values, section, metric, amount);
    bump(this.totals, section, metric, amount);
  }

  raw(section: string, groupKey?: string): RawValues {
    const source = groupKey === undefined ? this.totals : this.groups.get(groupKey)?.values;
    return { ...(source?.get(section) ?? {}) };
  }

  /** Groups ordered by label, with the "No ..." bucket last. */
  groupList(): Array<{ key: string; label: string }> {
    return [...this.groups.values()]
      .map(({ key, label }) => ({ key, label }))
      .sort((a, b) =>
        a.key === "none"
          ? 1
          : b.key === "none"
            ? -1
            : a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
      );
  }
}

function bump(map: Map<string, RawValues>, section: string, metric: string, amount: number) {
  let values = map.get(section);
  if (!values) {
    values = {};
    map.set(section, values);
  }
  values[metric] = (values[metric] ?? 0) + amount;
}

export type PerformanceSectionResult = {
  id: PerformanceSectionId;
  title: string;
  description: string;
  metrics: PerformanceMetric[];
  totals: MetricValues;
  rows: Array<{ key: string; label: string; values: MetricValues }>;
  notes: string[];
};

function finalize(spec: SectionSpec, raw: RawValues): MetricValues {
  const derived = spec.derive?.(raw) ?? {};
  const out: MetricValues = {};
  for (const m of spec.metrics) {
    out[m.key] = m.key in derived ? derived[m.key]! : (raw[m.key] ?? 0);
  }
  return out;
}

function hasData(raw: RawValues): boolean {
  return Object.values(raw).some((v) => v !== 0);
}

export function buildPerformanceSections(
  acc: PerformanceAccumulator,
  sections: PerformanceSectionId[],
  notes: Partial<Record<PerformanceSectionId, string[]>> = {},
): PerformanceSectionResult[] {
  const groups = acc.groupList();
  return PERFORMANCE_SECTIONS.filter((s) => sections.includes(s.id)).map((spec) => ({
    id: spec.id,
    title: spec.title,
    description: spec.description,
    metrics: spec.metrics,
    totals: finalize(spec, acc.raw(spec.id)),
    rows: groups
      .filter((g) => hasData(acc.raw(spec.id, g.key)))
      .map((g) => ({
        key: g.key,
        label: g.label,
        values: finalize(spec, acc.raw(spec.id, g.key)),
      })),
    notes: notes[spec.id] ?? [],
  }));
}

/** Headcount plus each selected section's headline metrics, per group. */
export function buildPerformanceOverview(
  acc: PerformanceAccumulator,
  sections: PerformanceSectionResult[],
): Omit<PerformanceSectionResult, "id" | "description" | "notes"> {
  const metrics: PerformanceMetric[] = [{ key: "headcount", label: "Headcount", format: "count" }];
  const columns: Array<{
    section: PerformanceSectionResult;
    metric: PerformanceMetric;
    key: string;
  }> = [];
  for (const section of sections) {
    const spec = PERFORMANCE_SECTIONS.find((s) => s.id === section.id);
    for (const metricKey of spec?.headline ?? []) {
      const metric = section.metrics.find((m) => m.key === metricKey);
      if (!metric) continue;
      const key = `${section.id}.${metric.key}`;
      columns.push({ section, metric, key });
      metrics.push({ ...metric, key, label: `${section.title}: ${metric.label}` });
    }
  }
  const valuesFor = (groupKey: string | null): MetricValues => {
    const out: MetricValues = {
      headcount: n(groupKey === null ? acc.raw("_org") : acc.raw("_org", groupKey), "headcount"),
    };
    for (const col of columns) {
      out[col.key] =
        groupKey === null
          ? (col.section.totals[col.metric.key] ?? null)
          : (col.section.rows.find((r) => r.key === groupKey)?.values[col.metric.key] ?? null);
    }
    return out;
  };
  return {
    title: "Overview",
    metrics,
    totals: valuesFor(null),
    rows: acc.groupList().map((g) => ({ key: g.key, label: g.label, values: valuesFor(g.key) })),
  };
}

// ---------------------------------------------------------------- employees

export type EmployeeScoreInput = {
  openIncidents: number;
  recordableIncidents: number;
  overdueTraining: number;
  expiredQualifications: number;
  expiringQualifications: number;
  openWorkersComp: number;
  completedTraining: number;
  observationCredit: number;
  observationDeduction: number;
  disciplineDeduction: number;
};

/** Mirrors the employee profile safety score weights. */
export function computeEmployeeSafetyScore(i: EmployeeScoreInput): number {
  let score = 100;
  score -= i.openIncidents * 12;
  score -= i.recordableIncidents * 8;
  score -= i.overdueTraining * 6;
  score -= i.expiredQualifications * 5;
  score -= i.expiringQualifications * 2;
  score -= i.openWorkersComp * 4;
  score += Math.min(i.completedTraining * 2, 10);
  score += i.observationCredit - i.observationDeduction;
  score -= i.disciplineDeduction;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export type EmployeeRankRow = {
  personnelId: string;
  name: string;
  employeeNumber: string;
  jobTitle: string;
  score: number;
  grade: string;
  openIncidents: number;
  recordableIncidents: number;
  overdueTraining: number;
  openWorkersComp: number;
  positiveObservations: number;
  unsafeObservations: number;
  activeDisciplinePoints: number | null;
};

export type EmployeeRankGroup = {
  key: string;
  label: string;
  headcount: number;
  averageScore: number | null;
  /** Lowest scores first. */
  lowest: EmployeeRankRow[];
};

export function rankEmployeesByGroup(
  rows: Array<EmployeeRankRow & { group: { key: string; label: string } }>,
  limit: number,
): { totals: Omit<EmployeeRankGroup, "key" | "label">; groups: EmployeeRankGroup[] } {
  const byScoreAsc = (a: EmployeeRankRow, b: EmployeeRankRow) =>
    a.score - b.score || a.name.localeCompare(b.name);
  const strip = ({ group: _g, ...row }: EmployeeRankRow & { group: unknown }): EmployeeRankRow =>
    row;
  const summarize = (list: EmployeeRankRow[]) => ({
    headcount: list.length,
    averageScore: list.length
      ? Math.round(list.reduce((s, r) => s + r.score, 0) / list.length)
      : null,
    lowest: [...list].sort(byScoreAsc).slice(0, limit),
  });
  const grouped = new Map<string, { label: string; rows: EmployeeRankRow[] }>();
  for (const row of rows) {
    const g = grouped.get(row.group.key) ?? { label: row.group.label, rows: [] };
    g.rows.push(strip(row));
    grouped.set(row.group.key, g);
  }
  const groups = [...grouped.entries()]
    .map(([key, g]) => ({ key, label: g.label, ...summarize(g.rows) }))
    .sort((a, b) =>
      a.key === "none"
        ? 1
        : b.key === "none"
          ? -1
          : a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
  return { totals: summarize(rows.map(strip)), groups };
}
