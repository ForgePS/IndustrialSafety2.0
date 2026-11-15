/**
 * Safety Performance Report — request builder, response parser, and printable
 * (PDF) HTML for the Analytics "Performance Report" tab.
 */

export const PERFORMANCE_REPORT_PATH = "/api/v1/industrial/analytics/performance-report";

export type PerformanceGroupBy = "site" | "division" | "department" | "area";

export const PERFORMANCE_GROUP_OPTIONS: ReadonlyArray<{ id: PerformanceGroupBy; label: string }> = [
  { id: "site", label: "Location" },
  { id: "division", label: "Division" },
  { id: "department", label: "Department" },
  { id: "area", label: "Area" },
];

export type PerformanceSectionId =
  | "incidents"
  | "osha"
  | "workers_comp"
  | "observations"
  | "inspections"
  | "training"
  | "corrective_actions"
  | "discipline"
  | "safety_score"
  | "employees"
  | "loto"
  | "sanitation"
  | "fleet_dot"
  | "jsas";

export const PERFORMANCE_SECTION_OPTIONS: ReadonlyArray<{
  id: PerformanceSectionId;
  label: string;
  hint: string;
}> = [
  { id: "incidents", label: "Incidents", hint: "Counts by type, open, closed %" },
  { id: "osha", label: "OSHA recordables & rates", hint: "TRIR, DART, lost workdays" },
  { id: "workers_comp", label: "Workers' comp", hint: "Claims, lost time, days away" },
  { id: "observations", label: "Safety observations", hint: "Positive vs unsafe, high risk" },
  { id: "inspections", label: "Inspections", hint: "Completed, completion %" },
  { id: "training", label: "Training", hint: "Completions, overdue, certifications" },
  { id: "corrective_actions", label: "Corrective actions", hint: "Open, overdue, on-time %" },
  { id: "discipline", label: "Disciplinary actions", hint: "Actions issued, active points" },
  { id: "safety_score", label: "Safety score", hint: "Safety Index, avg employee score" },
  { id: "employees", label: "Employee rankings", hint: "Lowest employee safety scores" },
  { id: "loto", label: "Lockout/Tagout", hint: "Lockouts, overdue, procedures" },
  { id: "sanitation", label: "Sanitation", hint: "Inspection scores, findings, cleaning" },
  { id: "fleet_dot", label: "Fleet & DOT", hint: "DOT items, vehicles out of service" },
  { id: "jsas", label: "Job safety analyses", hint: "JSAs created, pending" },
];

export const ALL_PERFORMANCE_SECTIONS: PerformanceSectionId[] = PERFORMANCE_SECTION_OPTIONS.map(
  (s) => s.id,
);

export type PerformancePeriodPreset =
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "ytd"
  | "last_year"
  | "last_12_months"
  | "custom";

export const PERFORMANCE_PERIOD_OPTIONS: ReadonlyArray<{
  id: PerformancePeriodPreset;
  label: string;
}> = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "last_quarter", label: "Last quarter" },
  { id: "ytd", label: "Year to date" },
  { id: "last_year", label: "Last year" },
  { id: "last_12_months", label: "Last 12 months" },
  { id: "custom", label: "Custom dates" },
];

const pad = (v: number) => String(v).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Inclusive local-calendar range for a period preset ("custom" returns null). */
export function performancePeriodRange(
  preset: PerformancePeriodPreset,
  today = new Date(),
): { from: string; to: string } | null {
  const y = today.getFullYear();
  const m = today.getMonth();
  const q = Math.floor(m / 3);
  switch (preset) {
    case "this_month":
      return { from: isoDay(new Date(y, m, 1)), to: isoDay(today) };
    case "last_month":
      return { from: isoDay(new Date(y, m - 1, 1)), to: isoDay(new Date(y, m, 0)) };
    case "this_quarter":
      return { from: isoDay(new Date(y, q * 3, 1)), to: isoDay(today) };
    case "last_quarter":
      return { from: isoDay(new Date(y, q * 3 - 3, 1)), to: isoDay(new Date(y, q * 3, 0)) };
    case "ytd":
      return { from: `${y}-01-01`, to: isoDay(today) };
    case "last_year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case "last_12_months":
      return { from: isoDay(new Date(y - 1, m, today.getDate() + 1)), to: isoDay(today) };
    case "custom":
      return null;
  }
}

export type PerformanceReportForm = {
  from: string;
  to: string;
  groupBy: PerformanceGroupBy;
  sections: PerformanceSectionId[];
  siteIds: string[];
  divisions: string[];
  departmentIds: string[];
  employeeLimit: number;
  hoursWorked: string;
};

export function performanceFormError(form: PerformanceReportForm): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.from) || !/^\d{4}-\d{2}-\d{2}$/.test(form.to)) {
    return "Choose a start and end date.";
  }
  if (form.to < form.from) return "The end date must be on or after the start date.";
  if (!form.sections.length) return "Select at least one section.";
  const hours = form.hoursWorked.replace(/,/g, "").trim();
  if (hours && !(Number(hours) > 0)) return "Hours worked must be a positive number.";
  return null;
}

export function buildPerformanceReportRequest(
  form: PerformanceReportForm,
): Record<string, unknown> {
  const hours = Number(form.hoursWorked.replace(/,/g, "").trim());
  return {
    from: form.from,
    to: form.to,
    groupBy: form.groupBy,
    sections: form.sections,
    siteIds: form.siteIds,
    divisions: form.divisions,
    departmentIds: form.departmentIds,
    employeeLimit: form.employeeLimit,
    ...(form.hoursWorked.trim() && hours > 0 ? { hoursWorked: Math.round(hours) } : {}),
  };
}

// ---------------------------------------------------------------- org filters

export type PerformanceOrgOptions = {
  sites: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string; siteId: string | null; division: string }>;
  divisions: string[];
};

function catalogRows(payload: unknown): Obj[] {
  const root = obj(payload);
  const rows = Array.isArray(payload) ? payload : list(root?.items ?? root?.data);
  return rows.map(obj).filter((r): r is Obj => r !== null && !r.archivedAt);
}

const isActiveRow = (r: Obj) => !text(r.status) || text(r.status).toUpperCase() === "ACTIVE";

export function parsePerformanceOrgOptions(
  sitesRaw: unknown,
  departmentsRaw: unknown,
): PerformanceOrgOptions {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const sites = catalogRows(sitesRaw)
    .filter(isActiveRow)
    .map((r) => ({
      id: text(r.id).trim(),
      name: text(r.name).trim() || text(r.siteKey).trim() || "Unnamed location",
    }))
    .filter((s) => s.id)
    .sort(byName);
  const departments = catalogRows(departmentsRaw)
    .filter(isActiveRow)
    .map((r) => ({
      id: text(r.id).trim(),
      name: text(r.name).trim() || "Unnamed department",
      siteId: text(r.siteId).trim() || null,
      division: (text(r.divisionName) || text(r.division)).trim(),
    }))
    .filter((d) => d.id)
    .sort(byName);
  const divisions = [...new Set(departments.map((d) => d.division).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  return { sites, departments, divisions };
}

// ---------------------------------------------------------------- response

export type PerformanceMetricFormat = "count" | "percent" | "rate" | "score" | "hours" | "days";
export type PerformanceMetric = {
  key: string;
  label: string;
  format: PerformanceMetricFormat;
  better?: "higher" | "lower";
};
export type PerformanceValues = Record<string, number | null>;
export type PerformanceTable = {
  title: string;
  metrics: PerformanceMetric[];
  totals: PerformanceValues;
  rows: Array<{ key: string; label: string; values: PerformanceValues }>;
};
export type PerformanceSection = PerformanceTable & {
  id: string;
  description: string;
  notes: string[];
};
export type PerformanceEmployee = {
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
export type PerformanceEmployeeGroup = {
  key: string;
  label: string;
  headcount: number;
  averageScore: number | null;
  lowest: PerformanceEmployee[];
};
export type PerformanceReport = {
  title: string;
  generatedAt: string;
  period: { from: string; to: string; days: number };
  groupBy: PerformanceGroupBy;
  groupByLabel: string;
  filters: { sites: string[]; divisions: string[]; departments: string[] };
  overview: PerformanceTable;
  sections: PerformanceSection[];
  employees: {
    limit: number;
    showDiscipline: boolean;
    totals: Omit<PerformanceEmployeeGroup, "key" | "label">;
    groups: PerformanceEmployeeGroup[];
    notes: string[];
  } | null;
  omitted: Array<{ id: string; title: string; reason: string }>;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const list = (v: unknown) => (Array.isArray(v) ? v : []);
const strings = (v: unknown) => list(v).map(text).filter(Boolean);
const FORMATS: PerformanceMetricFormat[] = ["count", "percent", "rate", "score", "hours", "days"];

function parseMetric(raw: unknown): PerformanceMetric | null {
  const m = obj(raw);
  if (!m || !text(m.key)) return null;
  const format = FORMATS.includes(m.format as PerformanceMetricFormat)
    ? (m.format as PerformanceMetricFormat)
    : "count";
  const better = m.better === "higher" || m.better === "lower" ? m.better : undefined;
  return {
    key: text(m.key),
    label: text(m.label) || text(m.key),
    format,
    ...(better ? { better } : {}),
  };
}

function parseValues(raw: unknown): PerformanceValues {
  const out: PerformanceValues = {};
  for (const [k, v] of Object.entries(obj(raw) ?? {})) out[k] = numOrNull(v);
  return out;
}

function parseTable(raw: unknown): PerformanceTable {
  const t = obj(raw) ?? {};
  return {
    title: text(t.title),
    metrics: list(t.metrics)
      .map(parseMetric)
      .filter((m): m is PerformanceMetric => m !== null),
    totals: parseValues(t.totals),
    rows: list(t.rows).map((r) => {
      const row = obj(r) ?? {};
      return { key: text(row.key), label: text(row.label), values: parseValues(row.values) };
    }),
  };
}

function parseEmployee(raw: unknown): PerformanceEmployee {
  const e = obj(raw) ?? {};
  return {
    personnelId: text(e.personnelId),
    name: text(e.name),
    employeeNumber: text(e.employeeNumber),
    jobTitle: text(e.jobTitle),
    score: num(e.score),
    grade: text(e.grade),
    openIncidents: num(e.openIncidents),
    recordableIncidents: num(e.recordableIncidents),
    overdueTraining: num(e.overdueTraining),
    openWorkersComp: num(e.openWorkersComp),
    positiveObservations: num(e.positiveObservations),
    unsafeObservations: num(e.unsafeObservations),
    activeDisciplinePoints: numOrNull(e.activeDisciplinePoints),
  };
}

function parseEmployeeGroup(raw: unknown): PerformanceEmployeeGroup {
  const g = obj(raw) ?? {};
  return {
    key: text(g.key),
    label: text(g.label),
    headcount: num(g.headcount),
    averageScore: numOrNull(g.averageScore),
    lowest: list(g.lowest).map(parseEmployee),
  };
}

export function parsePerformanceReport(raw: unknown): PerformanceReport | null {
  const r = obj(raw);
  if (!r || !Array.isArray(r.sections) || !obj(r.period)) return null;
  const period = obj(r.period)!;
  const filters = obj(r.filters) ?? {};
  const employees = obj(r.employees);
  const groupBy = PERFORMANCE_GROUP_OPTIONS.some((o) => o.id === r.groupBy)
    ? (r.groupBy as PerformanceGroupBy)
    : "site";
  return {
    title: text(r.title) || "Safety Performance Report",
    generatedAt: text(r.generatedAt),
    period: { from: text(period.from), to: text(period.to), days: num(period.days) },
    groupBy,
    groupByLabel: text(r.groupByLabel) || "Location",
    filters: {
      sites: strings(filters.sites),
      divisions: strings(filters.divisions),
      departments: strings(filters.departments),
    },
    overview: parseTable(r.overview),
    sections: list(r.sections).map((s) => {
      const section = obj(s) ?? {};
      return {
        ...parseTable(section),
        id: text(section.id),
        description: text(section.description),
        notes: strings(section.notes),
      };
    }),
    employees: employees
      ? {
          limit: num(employees.limit),
          showDiscipline: employees.showDiscipline === true,
          totals: (({ key: _k, label: _l, ...rest }) => rest)(parseEmployeeGroup(employees.totals)),
          groups: list(employees.groups).map(parseEmployeeGroup),
          notes: strings(employees.notes),
        }
      : null,
    omitted: list(r.omitted).map((o) => {
      const item = obj(o) ?? {};
      return { id: text(item.id), title: text(item.title), reason: text(item.reason) };
    }),
  };
}

// ---------------------------------------------------------------- formatting

export function performanceGrade(score: number | null): string {
  if (score === null) return "-";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function formatPerformanceValue(
  value: number | null | undefined,
  format: PerformanceMetricFormat,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  switch (format) {
    case "percent":
      return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
    case "rate":
      return value.toFixed(2);
    case "score":
      return `${Math.round(value)} (${performanceGrade(value)})`;
    default:
      return Math.round(value).toLocaleString("en-US");
  }
}

function formatDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

export function performancePeriodLabel(period: { from: string; to: string }): string {
  return `${formatDay(period.from)} - ${formatDay(period.to)}`;
}

export function performanceReportFileName(report: PerformanceReport): string {
  return `safety-performance-${report.groupBy}-${report.period.from}-to-${report.period.to}`;
}

// ---------------------------------------------------------------- printable HTML

export function escapePerformanceHtml(value: unknown): string {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const esc = escapePerformanceHtml;
const MAX_METRIC_COLUMNS = 9;

function scoreClass(metric: PerformanceMetric, value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (metric.format === "score") return value >= 90 ? "good" : value < 70 ? "bad" : "";
  return "";
}

/** Highlights the weakest group per metric when there is more than one group to compare. */
function worstKeys(table: PerformanceTable, metric: PerformanceMetric): Set<string> {
  if (!metric.better || table.rows.length < 2) return new Set();
  const values = table.rows
    .map((r) => ({ key: r.key, v: r.values[metric.key] }))
    .filter((x): x is { key: string; v: number } => typeof x.v === "number");
  if (values.length < 2) return new Set();
  const worst =
    metric.better === "higher"
      ? Math.min(...values.map((x) => x.v))
      : Math.max(...values.map((x) => x.v));
  const best =
    metric.better === "higher"
      ? Math.max(...values.map((x) => x.v))
      : Math.min(...values.map((x) => x.v));
  if (worst === best || (metric.better === "lower" && worst === 0)) return new Set();
  return new Set(values.filter((x) => x.v === worst).map((x) => x.key));
}

function tableHtml(table: PerformanceTable, groupLabel: string): string {
  if (!table.rows.length) return `<p class="muted">No activity recorded for this period.</p>`;
  const chunks: PerformanceMetric[][] = [];
  for (let i = 0; i < table.metrics.length; i += MAX_METRIC_COLUMNS) {
    chunks.push(table.metrics.slice(i, i + MAX_METRIC_COLUMNS));
  }
  return chunks
    .map((metrics) => {
      const worst = new Map(metrics.map((m) => [m.key, worstKeys(table, m)]));
      const head = metrics.map((m) => `<th class="num">${esc(m.label)}</th>`).join("");
      const body = table.rows
        .map(
          (row) =>
            `<tr><th scope="row">${esc(row.label)}</th>${metrics
              .map((m) => {
                const v = row.values[m.key];
                const cls = [scoreClass(m, v), worst.get(m.key)?.has(row.key) ? "worst" : ""]
                  .filter(Boolean)
                  .join(" ");
                return `<td class="num ${cls}">${esc(formatPerformanceValue(v, m.format))}</td>`;
              })
              .join("")}</tr>`,
        )
        .join("");
      const total = `<tr class="total"><th scope="row">Organization total</th>${metrics
        .map(
          (m) =>
            `<td class="num">${esc(formatPerformanceValue(table.totals[m.key], m.format))}</td>`,
        )
        .join("")}</tr>`;
      return `<table><thead><tr><th>${esc(groupLabel)}</th>${head}</tr></thead><tbody>${body}</tbody><tfoot>${total}</tfoot></table>`;
    })
    .join("");
}

function kpiTilesHtml(table: PerformanceTable): string {
  const tiles = table.metrics
    .map(
      (m) =>
        `<div class="kpi ${scoreClass(m, table.totals[m.key])}"><div class="kpi-value">${esc(
          formatPerformanceValue(table.totals[m.key], m.format),
        )}</div><div class="kpi-label">${esc(m.label)}</div></div>`,
    )
    .join("");
  return `<div class="kpis">${tiles}</div>`;
}

function employeeTableHtml(rows: PerformanceEmployee[], showDiscipline: boolean): string {
  if (!rows.length) return `<p class="muted">None</p>`;
  const head = [
    "Employee",
    "Job title",
    "Score",
    "Open incidents",
    "Recordables",
    "Overdue training",
    "Open WC",
    "Positive obs.",
    "Unsafe obs.",
    ...(showDiscipline ? ["Discipline pts"] : []),
  ];
  const body = rows
    .map((e) => {
      const cells = [
        `${esc(e.name)}${e.employeeNumber ? ` <span class="muted">#${esc(e.employeeNumber)}</span>` : ""}`,
        esc(e.jobTitle || "-"),
        esc(`${e.score} (${e.grade})`),
        esc(e.openIncidents),
        esc(e.recordableIncidents),
        esc(e.overdueTraining),
        esc(e.openWorkersComp),
        esc(e.positiveObservations),
        esc(e.unsafeObservations),
        ...(showDiscipline ? [esc(e.activeDisciplinePoints ?? 0)] : []),
      ];
      return `<tr>${cells.map((c, i) => (i < 2 ? `<td>${c}</td>` : `<td class="num ${i === 2 ? scoreClass({ key: "", label: "", format: "score" }, e.score) : ""}">${c}</td>`)).join("")}</tr>`;
    })
    .join("");
  return `<table class="employees"><thead><tr>${head
    .map((h, i) => `<th${i >= 2 ? ' class="num"' : ""}>${esc(h)}</th>`)
    .join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

function employeesHtml(report: PerformanceReport): string {
  const emp = report.employees;
  if (!emp) return "";
  const avg = emp.totals.averageScore;
  const groups = emp.groups
    .map(
      (g) => `<div class="emp-group">
  <h3>${esc(g.label)} <span class="muted">${esc(g.headcount)} employees · average ${esc(
    g.averageScore === null ? "-" : `${g.averageScore} (${performanceGrade(g.averageScore)})`,
  )}</span></h3>
  <h4>Lowest scores</h4>${employeeTableHtml(g.lowest, emp.showDiscipline)}
</div>`,
    )
    .join("");
  return `<section class="section">
  <h2>Employee rankings</h2>
  <p class="desc">${esc(emp.totals.headcount)} active employees · organization average ${esc(
    avg === null ? "-" : `${avg} (${performanceGrade(avg)})`,
  )} · lowest ${esc(emp.limit)} per ${esc(report.groupByLabel.toLowerCase())}</p>
  ${groups || `<p class="muted">No active employees in scope.</p>`}
  ${emp.notes.map((n) => `<p class="note">${esc(n)}</p>`).join("")}
</section>`;
}

export function buildPerformanceReportHtml(
  report: PerformanceReport,
  options: { companyName?: string; logoUrl?: string } = {},
): string {
  const company = options.companyName?.trim() || "";
  const scope = [
    report.filters.sites.length ? `Locations: ${report.filters.sites.join(", ")}` : "",
    report.filters.divisions.length ? `Divisions: ${report.filters.divisions.join(", ")}` : "",
    report.filters.departments.length
      ? `Departments: ${report.filters.departments.join(", ")}`
      : "",
  ].filter(Boolean);
  const generated = report.generatedAt ? new Date(report.generatedAt) : new Date();
  const logo =
    options.logoUrl && /^(https?:|data:image\/)/i.test(options.logoUrl)
      ? `<img class="logo" src="${esc(options.logoUrl)}" alt="${esc(company || "Logo")}" />`
      : "";
  const overviewTiles: PerformanceTable = {
    ...report.overview,
    metrics: report.overview.metrics.filter(
      (m) => m.key !== "headcount" || report.overview.totals.headcount,
    ),
  };
  const sections = report.sections
    .map(
      (s) => `<section class="section">
  <h2>${esc(s.title)}</h2>
  <p class="desc">${esc(s.description)}</p>
  ${kpiTilesHtml(s)}
  ${tableHtml(s, report.groupByLabel)}
  ${s.notes.map((n) => `<p class="note">${esc(n)}</p>`).join("")}
</section>`,
    )
    .join("");
  const omitted = report.omitted.length
    ? `<p class="note">Not included: ${report.omitted.map((o) => `${esc(o.title)} (${esc(o.reason)})`).join("; ")}.</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(report.title)} - ${esc(performancePeriodLabel(report.period))}</title>
<style>
  @page { size: letter landscape; margin: 0.45in; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #1f2933; font-size: 10.5px; margin: 0; padding: 16px; }
  header.report { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #1d4ed8; padding-bottom: 8px; margin-bottom: 12px; gap: 16px; }
  header.report .logo { max-height: 44px; max-width: 180px; object-fit: contain; }
  header.report h1 { margin: 0; font-size: 20px; color: #0f172a; }
  header.report .company { font-size: 13px; font-weight: 600; color: #334155; }
  header.report .meta { text-align: right; color: #475569; line-height: 1.5; }
  .scope { background: #f1f5f9; border-radius: 6px; padding: 6px 10px; margin-bottom: 12px; color: #334155; }
  h2 { font-size: 14px; margin: 0 0 2px; color: #1d4ed8; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
  h3 { font-size: 12px; margin: 10px 0 4px; }
  h4 { font-size: 10.5px; margin: 6px 0 3px; color: #475569; text-transform: uppercase; letter-spacing: .03em; }
  .section { margin: 0 0 16px; page-break-inside: auto; }
  .desc { margin: 2px 0 6px; color: #64748b; }
  .note { margin: 4px 0 0; color: #64748b; font-style: italic; }
  .muted { color: #94a3b8; font-weight: normal; }
  .kpis { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 8px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 8px; min-width: 104px; background: #f8fafc; }
  .kpi-value { font-size: 15px; font-weight: 700; color: #0f172a; }
  .kpi-label { color: #64748b; font-size: 9.5px; }
  .kpi.good .kpi-value, td.good { color: #15803d; }
  .kpi.bad .kpi-value, td.bad { color: #b91c1c; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #e2e8f0; padding: 3px 5px; text-align: left; vertical-align: top; }
  thead th { background: #1e293b; color: #fff; font-weight: 600; font-size: 9.5px; }
  tbody th { font-weight: 600; background: #f8fafc; }
  .num { text-align: right; white-space: nowrap; }
  td.worst { background: #fef2f2; color: #b91c1c; font-weight: 600; }
  tfoot tr.total th, tfoot tr.total td { background: #e0e7ff; font-weight: 700; }
  .emp-group { page-break-inside: avoid; margin-bottom: 8px; }
  table.employees td, table.employees th { font-size: 9.5px; }
  footer.report { margin-top: 18px; border-top: 1px solid #cbd5e1; padding-top: 6px; color: #94a3b8; font-size: 9px; display: flex; justify-content: space-between; }
  .legend { color: #64748b; margin: 0 0 12px; }
  .legend span { background: #fef2f2; color: #b91c1c; font-weight: 600; padding: 0 4px; border-radius: 3px; }
</style>
</head>
<body>
<header class="report">
  <div>
    ${logo}
    ${company ? `<div class="company">${esc(company)}</div>` : ""}
    <h1>${esc(report.title)}</h1>
  </div>
  <div class="meta">
    <div><strong>Period:</strong> ${esc(performancePeriodLabel(report.period))} (${esc(report.period.days)} days)</div>
    <div><strong>Broken down by:</strong> ${esc(report.groupByLabel)}</div>
    <div><strong>Generated:</strong> ${esc(generated.toLocaleString("en-US"))}</div>
  </div>
</header>
<div class="scope"><strong>Scope:</strong> ${esc(scope.length ? scope.join(" · ") : "Entire organization")}</div>
<section class="section">
  <h2>Executive summary</h2>
  <p class="desc">Organization totals for the period, followed by each ${esc(report.groupByLabel.toLowerCase())}'s key results.</p>
  ${kpiTilesHtml(overviewTiles)}
  ${tableHtml(report.overview, report.groupByLabel)}
</section>
<p class="legend"><span>Highlighted</span> cells mark the weakest ${esc(report.groupByLabel.toLowerCase())} for that measure.</p>
${sections}
${employeesHtml(report)}
${omitted}
<footer class="report">
  <span>${esc(company || "Forge Industrial")} · ${esc(report.title)}</span>
  <span>Confidential - for internal safety management use</span>
</footer>
</body>
</html>`;
}
