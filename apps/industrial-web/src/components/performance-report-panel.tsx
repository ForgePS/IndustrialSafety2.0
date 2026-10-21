"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { useTenantBranding } from "@/hooks/use-tenant-branding";
import { openPrintableHtmlPopup } from "@/lib/dvir";
import { navLogoForTenant } from "@/lib/tenant-nav-logo";
import {
  ALL_PERFORMANCE_SECTIONS,
  buildPerformanceReportHtml,
  buildPerformanceReportRequest,
  formatPerformanceValue,
  parsePerformanceOrgOptions,
  parsePerformanceReport,
  PERFORMANCE_GROUP_OPTIONS,
  PERFORMANCE_PERIOD_OPTIONS,
  PERFORMANCE_REPORT_PATH,
  PERFORMANCE_SECTION_OPTIONS,
  performanceFormError,
  performancePeriodLabel,
  performancePeriodRange,
  type PerformanceGroupBy,
  type PerformanceOrgOptions,
  type PerformancePeriodPreset,
  type PerformanceReport,
  type PerformanceReportForm,
  type PerformanceSectionId,
} from "@/lib/performance-report";

function absoluteAssetUrl(src: string): string {
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  if (typeof window === "undefined") return src;
  return new URL(src, window.location.origin).href;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Builds the org-wide Safety Performance Report and prints it as a PDF. */
export function PerformanceReportPanel() {
  const { me } = useAuth();
  const { logoUrl, appShortName } = useTenantBranding();
  const initialRange = performancePeriodRange("ytd")!;
  const [preset, setPreset] = useState<PerformancePeriodPreset>("ytd");
  const [form, setForm] = useState<PerformanceReportForm>({
    from: initialRange.from,
    to: initialRange.to,
    groupBy: "site",
    sections: [...ALL_PERFORMANCE_SECTIONS],
    siteIds: [],
    divisions: [],
    departmentIds: [],
    employeeLimit: 5,
    hoursWorked: "",
  });
  const [org, setOrg] = useState<PerformanceOrgOptions>({ sites: [], departments: [], divisions: [] });
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [sites, departments] = await Promise.all([
        apiGet<unknown>("/api/v1/industrial/sites", { query: { page: "1", pageSize: "200" } }).catch(() => []),
        apiGet<unknown>("/api/v1/industrial/departments").catch(() => []),
      ]);
      if (!cancelled) setOrg(parsePerformanceOrgOptions(sites, departments));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tenant = useMemo(() => {
    if (!me) return null;
    return me.tenants?.find((t) => t.tenantId === me.tenantId) ?? null;
  }, [me]);
  const companyName = tenant?.displayName?.trim() || appShortName;
  const logo = navLogoForTenant({ slug: tenant?.slug, displayName: companyName, brandingLogoUrl: logoUrl });

  const departmentsInScope = useMemo(
    () =>
      org.departments.filter(
        (d) =>
          (!form.siteIds.length || (d.siteId !== null && form.siteIds.includes(d.siteId))) &&
          (!form.divisions.length || form.divisions.includes(d.division)),
      ),
    [org.departments, form.siteIds, form.divisions],
  );

  const html = useMemo(
    () =>
      report
        ? buildPerformanceReportHtml(report, {
            companyName,
            ...(logo?.src ? { logoUrl: absoluteAssetUrl(logo.src) } : {}),
          })
        : "",
    [report, companyName, logo?.src],
  );

  function update<K extends keyof PerformanceReportForm>(key: K, value: PerformanceReportForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function choosePreset(next: PerformancePeriodPreset) {
    setPreset(next);
    const range = performancePeriodRange(next);
    if (range) setForm((prev) => ({ ...prev, ...range }));
  }

  async function generate() {
    const problem = performanceFormError(form);
    if (problem) {
      setError(problem);
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const raw = await apiSend<unknown>(PERFORMANCE_REPORT_PATH, "POST", buildPerformanceReportRequest(form));
      const parsed = parsePerformanceReport(raw);
      if (!parsed) throw new Error("Unexpected report response");
      setReport(parsed);
    } catch (e) {
      setReport(null);
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Unable to generate the report");
    } finally {
      setRunning(false);
    }
  }

  function printReport() {
    if (!html) return;
    const problem = openPrintableHtmlPopup(html, true);
    if (problem) setError(problem);
  }

  const activeFilterCount = form.siteIds.length + form.divisions.length + form.departmentIds.length;

  return (
    <div className="d-flex flex-column gap-4">
      <div className="card">
        <div className="card-body">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
            <div>
              <h6 className="card-title mb-1">Performance Report</h6>
              <p className="text-muted small mb-0">
                Organization-wide safety performance with a breakdown by location, division, department, or
                area. Choose the sections to include, generate, then print or save as PDF.
              </p>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label" htmlFor="perf-period">
                Period
              </label>
              <select
                id="perf-period"
                className="form-select"
                value={preset}
                onChange={(e) => choosePreset(e.target.value as PerformancePeriodPreset)}
              >
                {PERFORMANCE_PERIOD_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label" htmlFor="perf-from">
                From
              </label>
              <input
                id="perf-from"
                type="date"
                className="form-control"
                value={form.from}
                onChange={(e) => {
                  setPreset("custom");
                  update("from", e.target.value);
                }}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label" htmlFor="perf-to">
                To
              </label>
              <input
                id="perf-to"
                type="date"
                className="form-control"
                value={form.to}
                onChange={(e) => {
                  setPreset("custom");
                  update("to", e.target.value);
                }}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label" htmlFor="perf-group">
                Break down by
              </label>
              <select
                id="perf-group"
                className="form-select"
                value={form.groupBy}
                onChange={(e) => update("groupBy", e.target.value as PerformanceGroupBy)}
              >
                {PERFORMANCE_GROUP_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2 d-flex align-items-end">
              <button
                type="button"
                className="btn btn-outline-secondary w-100"
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
              >
                Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
              </button>
            </div>
          </div>

          {showFilters ? (
            <div className="row g-3 mt-1">
              <FilterList
                title="Locations"
                empty="No locations set up"
                options={org.sites.map((s) => ({ id: s.id, label: s.name }))}
                selected={form.siteIds}
                onToggle={(id) => update("siteIds", toggle(form.siteIds, id))}
                onClear={() => update("siteIds", [])}
              />
              <FilterList
                title="Divisions"
                empty="No divisions set on departments"
                options={org.divisions.map((d) => ({ id: d, label: d }))}
                selected={form.divisions}
                onToggle={(id) => update("divisions", toggle(form.divisions, id))}
                onClear={() => update("divisions", [])}
              />
              <FilterList
                title="Departments"
                empty="No departments in the selected scope"
                options={departmentsInScope.map((d) => ({ id: d.id, label: d.name }))}
                selected={form.departmentIds}
                onToggle={(id) => update("departmentIds", toggle(form.departmentIds, id))}
                onClear={() => update("departmentIds", [])}
              />
              <div className="col-12">
                <p className="text-muted small mb-0">
                  Leave a list empty to include everything. Records are matched to a department first, then to the
                  location and division of that department or the employee involved.
                </p>
              </div>
            </div>
          ) : null}

          <hr />

          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
            <span className="fw-semibold">Sections to include</span>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => update("sections", [...ALL_PERFORMANCE_SECTIONS])}
              >
                Select all
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => update("sections", [])}>
                Clear
              </button>
            </div>
          </div>
          <div className="row g-2">
            {PERFORMANCE_SECTION_OPTIONS.map((s) => (
              <div className="col-sm-6 col-lg-4 col-xl-3" key={s.id}>
                <div className="form-check border rounded px-3 py-2 h-100 d-flex gap-2 align-items-start mb-0">
                  <input
                    id={`perf-section-${s.id}`}
                    type="checkbox"
                    className="form-check-input ms-0 mt-1 flex-shrink-0"
                    checked={form.sections.includes(s.id)}
                    onChange={() => update("sections", toggle<PerformanceSectionId>(form.sections, s.id))}
                  />
                  <div>
                    <label htmlFor={`perf-section-${s.id}`} className="form-check-label d-block fw-semibold">
                      {s.label}
                    </label>
                    <span className="d-block small text-muted">{s.hint}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {form.sections.includes("employees") || form.sections.includes("osha") ? (
            <div className="row g-3 mt-1">
              {form.sections.includes("employees") ? (
                <div className="col-md-3">
                  <label className="form-label" htmlFor="perf-limit">
                    Employees listed per group
                  </label>
                  <input
                    id="perf-limit"
                    type="number"
                    min={1}
                    max={25}
                    className="form-control"
                    value={form.employeeLimit}
                    onChange={(e) =>
                      update("employeeLimit", Math.min(25, Math.max(1, Number(e.target.value) || 1)))
                    }
                  />
                </div>
              ) : null}
              {form.sections.includes("osha") ? (
                <div className="col-md-4">
                  <label className="form-label" htmlFor="perf-hours">
                    Hours worked for the period (optional)
                  </label>
                  <input
                    id="perf-hours"
                    inputMode="numeric"
                    className="form-control"
                    placeholder="Uses Form 300A hours or an estimate"
                    value={form.hoursWorked}
                    onChange={(e) => update("hoursWorked", e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="alert alert-danger mt-3 mb-0" role="alert">
              {error}
            </div>
          ) : null}

          <div className="d-flex flex-wrap gap-2 mt-3">
            <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={running}>
              {running ? "Generating…" : "Generate report"}
            </button>
            <button type="button" className="btn btn-outline-primary" onClick={printReport} disabled={!report}>
              <i className="bx bx-printer me-1" aria-hidden />
              Print / Save as PDF
            </button>
          </div>
        </div>
      </div>

      {report ? <ReportPreview report={report} html={html} /> : null}
    </div>
  );
}

function FilterList({
  title,
  empty,
  options,
  selected,
  onToggle,
  onClear,
}: {
  title: string;
  empty: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="col-md-4">
      <div className="d-flex justify-content-between align-items-center mb-1">
        <span className="form-label mb-0">{title}</span>
        {selected.length ? (
          <button type="button" className="btn btn-link btn-sm p-0" onClick={onClear}>
            Clear ({selected.length})
          </button>
        ) : (
          <span className="small text-muted">All</span>
        )}
      </div>
      <div className="border rounded p-2" style={{ maxHeight: 180, overflowY: "auto" }}>
        {options.length === 0 ? (
          <p className="text-muted small mb-0">{empty}</p>
        ) : (
          options.map((o) => (
            <label className="form-check mb-1" key={o.id}>
              <input
                type="checkbox"
                className="form-check-input"
                checked={selected.includes(o.id)}
                onChange={() => onToggle(o.id)}
              />
              <span className="form-check-label">{o.label}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

function ReportPreview({ report, html }: { report: PerformanceReport; html: string }) {
  const headline = report.overview.metrics.slice(0, 8);
  return (
    <div className="card">
      <div className="card-body">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
          <div>
            <h6 className="card-title mb-1">{report.title}</h6>
            <p className="text-muted small mb-0">
              {performancePeriodLabel(report.period)} · by {report.groupByLabel.toLowerCase()} ·{" "}
              {report.overview.rows.length} {report.overview.rows.length === 1 ? "group" : "groups"}
            </p>
          </div>
        </div>
        <div className="row g-2 mb-3">
          {headline.map((m) => (
            <div className="col-6 col-md-3" key={m.key}>
              <div className="border rounded p-2 h-100">
                <div className="small text-muted">{m.label}</div>
                <div className="fs-5 fw-semibold">{formatPerformanceValue(report.overview.totals[m.key], m.format)}</div>
              </div>
            </div>
          ))}
        </div>
        {report.omitted.length ? (
          <p className="small text-muted">
            Not included: {report.omitted.map((o) => `${o.title} (${o.reason})`).join("; ")}
          </p>
        ) : null}
        <iframe
          title="Performance report preview"
          srcDoc={html}
          sandbox=""
          className="w-100 border rounded"
          style={{ height: 900, background: "#fff" }}
        />
      </div>
    </div>
  );
}
