"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, useAuth } from "@forge/web-kit";
import {
  ANALYTICS_TABS,
  buildAnalyticsExportRows,
  downloadCsv,
  gradeBadgeClass,
  presetFromPeriodId,
  toSafetyIntelligenceReport,
  trendPolyline,
  type AnalyticsPreset,
  type AnalyticsTab,
  type AnalyticsTrendPoint,
  type SafetyIntelligenceReport,
} from "@/lib/safety-intelligence";

/**
 * Safety Intelligence Center — Overview plus drill-down tabs. Every metric tile,
 * period card, chart, and module row links into a viewable list.
 */
export function AnalyticsWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const canView =
    Boolean(me?.isPlatformAdmin) ||
    (me?.permissions ?? []).includes("industrial.access") ||
    (me?.permissions ?? []).includes("industrial.admin");

  const [tab, setTab] = useState<AnalyticsTab>("overview");
  const [preset, setPreset] = useState<AnalyticsPreset>("6m");
  const [report, setReport] = useState<SafetyIntelligenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (nextPreset = preset) => {
      setLoading(true);
      setError(null);
      try {
        const raw = await apiGet<unknown>("/api/v1/industrial/analytics/overview", {
          query: { preset: nextPreset },
        });
        const parsed = toSafetyIntelligenceReport(raw);
        if (!parsed) throw new Error("Unexpected analytics response");
        setReport(parsed);
      } catch (e) {
        setReport(null);
        setError(e instanceof ApiError ? e.message : "Unable to load analytics");
      } finally {
        setLoading(false);
      }
    },
    [preset],
  );

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    void load();
  }, [canView, load]);

  function selectPeriod(id: SafetyIntelligenceReport["periodSummaries"][number]["id"]) {
    const next = presetFromPeriodId(id);
    setPreset(next);
    setTab("reports");
    void load(next);
  }

  function exportExcel() {
    if (!report) return;
    downloadCsv(
      `safety-analytics-${report.preset}-${report.dateRange.end || "export"}.csv`,
      buildAnalyticsExportRows(report),
    );
  }

  function exportPdf() {
    window.print();
  }

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        <h4 className="alert-heading">{moduleName}</h4>
        <p className="mb-0">You do not have permission to view analytics.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="sic-title" className="ind-analytics">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <p className="text-uppercase text-primary fw-semibold small mb-1">Analytics</p>
          <h4 className="mb-1" id="sic-title">
            Safety Intelligence Center
          </h4>
          <p className="text-muted mb-0">
            {report
              ? `${report.periodLabel} · Last refreshed ${new Date(report.generatedAt).toLocaleString()}`
              : "Live safety metrics across Industrial modules."}
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={exportPdf} disabled={!report}>
            Export PDF
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={exportExcel} disabled={!report}>
            Export Excel
          </button>
          <button type="button" className="btn btn-outline-primary" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      <ul className="nav nav-pills flex-wrap gap-1 mb-3" role="tablist">
        {ANALYTICS_TABS.map((item) => (
          <li className="nav-item" key={item.id}>
            <button
              type="button"
              role="tab"
              className={`nav-link${tab === item.id ? " active" : ""}`}
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
          <div>
            <button type="button" className="btn btn-sm btn-outline-danger mt-2" onClick={() => void load()}>
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {loading && !report ? (
        <p className="text-muted" role="status">
          Loading Safety Intelligence Center…
        </p>
      ) : null}

      {report ? (
        <>
          <PeriodCards
            summaries={report.periodSummaries}
            activePreset={preset}
            onSelect={selectPeriod}
          />

          {tab === "overview" ? <OverviewTab report={report} /> : null}
          {tab === "reports" ? <ReportsTab report={report} /> : null}
          {tab === "safety" ? <SafetyTab report={report} /> : null}
          {tab === "operations" ? <OperationsTab report={report} /> : null}
          {tab === "dot" ? <DotTab report={report} /> : null}
          {tab === "hotspots" ? <HotspotsTab report={report} /> : null}
        </>
      ) : null}
    </section>
  );
}

function PeriodCards({
  summaries,
  activePreset,
  onSelect,
}: {
  summaries: SafetyIntelligenceReport["periodSummaries"];
  activePreset: AnalyticsPreset;
  onSelect: (id: SafetyIntelligenceReport["periodSummaries"][number]["id"]) => void;
}) {
  if (summaries.length === 0) return null;
  return (
    <div className="row g-3 mb-4">
      {summaries.map((summary) => {
        const preset = presetFromPeriodId(summary.id);
        const active = preset === activePreset;
        return (
          <div className="col-md-4" key={summary.id}>
            <button
              type="button"
              className={`card h-100 w-100 text-start border${active ? " border-primary" : ""}`}
              onClick={() => onSelect(summary.id)}
              aria-pressed={active}
            >
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <h6 className="mb-0">{summary.label}</h6>
                  <span className={`badge ${gradeBadgeClass(summary.safetyGrade)}`}>
                    {summary.safetyScore} · Grade {summary.safetyGrade}
                  </span>
                </div>
                <div className="row g-2 small">
                  <MetricPair label="Incidents" value={summary.incidents} />
                  <MetricPair label="Inspections" value={summary.inspections} />
                  <MetricPair label="Observations" value={summary.observations} />
                  <MetricPair label="Forms" value={summary.formSubmissions} />
                  <MetricPair label="Enterprise" value={summary.enterpriseActivity} />
                  <MetricPair label="Total activity" value={summary.totalActivity} />
                </div>
                <div className="text-primary small mt-2">View period details →</div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function MetricPair({ label, value }: { label: string; value: number }) {
  return (
    <div className="col-6">
      <div className="text-muted">{label}</div>
      <div className="fw-semibold">{value}</div>
    </div>
  );
}

function OverviewTab({ report }: { report: SafetyIntelligenceReport }) {
  return (
    <div className="d-flex flex-column gap-4">
      <div className="row g-3">
        <div className="col-lg-4">
          <Link href="/modules/analytics/?tab=overview" className="card h-100 text-decoration-none">
            <div className="card-body text-center">
              <h6 className="card-title">Safety Index</h6>
              <ScoreRing score={report.safetyScore} grade={report.safetyGrade} />
              <p className="text-muted small mb-0 mt-3">
                Weighted score for {report.periodLabel}, including DOT compliance.
              </p>
            </div>
          </Link>
        </div>
        <div className="col-lg-8">
          <div className="card h-100">
            <div className="card-body">
              <h6 className="card-title">Key Insights</h6>
              {report.insights.length === 0 ? (
                <p className="text-muted mb-0">Insights will appear as you add records.</p>
              ) : (
                <ul className="list-unstyled mb-0">
                  {report.insights.map((insight) => (
                    <li key={insight} className="d-flex align-items-start gap-2 mb-2">
                      <span className="badge bg-label-success rounded-circle p-1 mt-1" aria-hidden>
                        <i className="bx bx-check" />
                      </span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      <KpiGrid kpis={report.kpis} />

      <div className="row g-3">
        <div className="col-lg-6">
          <TrendCard
            title="Incident Trend"
            subtitle={report.periodLabel}
            points={report.incidentTrend}
            href="/modules/incidents/"
            stroke="var(--bs-success)"
          />
        </div>
        <div className="col-lg-6">
          <TrendCard
            title="Observations Trend"
            subtitle={report.periodLabel}
            points={report.observationsTrend}
            href="/modules/observations/"
            stroke="var(--bs-primary)"
          />
        </div>
      </div>
    </div>
  );
}

function ReportsTab({ report }: { report: SafetyIntelligenceReport }) {
  return (
    <div className="d-flex flex-column gap-4">
      <div className="card">
        <div className="card-body">
          <h6 className="card-title">Custom report window</h6>
          <p className="text-muted small mb-2">
            Showing {report.periodLabel} ({report.dateRange.start} → {report.dateRange.end}). Select a
            rolling period card above to change the window, then open any KPI to view the records.
          </p>
          <div className="d-flex flex-wrap gap-2">
            {report.activityByModule.map((module) => (
              <Link
                key={module.label}
                href={module.href || "/modules/analytics/"}
                className="badge bg-label-primary text-decoration-none"
              >
                {module.label}: {module.count}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <KpiGrid kpis={report.kpis} />
      <div className="row g-3">
        <div className="col-lg-4">
          <TrendCard
            title="Incident Trend"
            subtitle={report.periodLabel}
            points={report.incidentTrend}
            href="/modules/incidents/"
            stroke="var(--bs-success)"
          />
        </div>
        <div className="col-lg-4">
          <TrendCard
            title="Observations Trend"
            subtitle={report.periodLabel}
            points={report.observationsTrend}
            href="/modules/observations/"
            stroke="var(--bs-primary)"
          />
        </div>
        <div className="col-lg-4">
          <TrendCard
            title="Inspection Trend"
            subtitle={report.periodLabel}
            points={report.inspectionsTrend}
            href="/modules/inspections/"
            stroke="var(--bs-info)"
          />
        </div>
      </div>
      <BreakdownCard
        title="Report insights"
        items={report.insights.map((insight) => ({ label: insight, count: 0 }))}
        href="/modules/analytics/"
        showCount={false}
      />
    </div>
  );
}

function SafetyTab({ report }: { report: SafetyIntelligenceReport }) {
  const open = report.kpis.find((k) => k.id === "open-incidents");
  const total = report.periodSummaries.find((p) => presetFromPeriodId(p.id) === report.preset);
  return (
    <div className="d-flex flex-column gap-4">
      <div className="row g-3">
        <ClickStat label="Incidents in range" value={total?.incidents ?? 0} href="/modules/incidents/" />
        <ClickStat
          label="Open incidents"
          value={open?.value ?? 0}
          href="/modules/incidents/"
          danger={Number(open?.value ?? 0) > 0}
        />
        <ClickStat label="Inspections" value={total?.inspections ?? 0} href="/modules/inspections/" />
        <ClickStat label="Observations" value={total?.observations ?? 0} href="/modules/observations/" />
      </div>
      <div className="row g-3">
        <div className="col-lg-6">
          <BreakdownCard
            title="Incidents by status"
            items={report.incidentsByStatus}
            href="/modules/incidents/"
          />
        </div>
        <div className="col-lg-6">
          <TrendCard
            title="Incident Trend"
            subtitle={report.periodLabel}
            points={report.incidentTrend}
            href="/modules/incidents/"
            stroke="var(--bs-danger)"
          />
        </div>
      </div>
    </div>
  );
}

function OperationsTab({ report }: { report: SafetyIntelligenceReport }) {
  return (
    <div className="d-flex flex-column gap-4">
      <KpiGrid
        kpis={report.kpis.filter((k) =>
          ["inspections", "inspection-score", "observations", "forms", "training", "scan", "jsas", "enterprise"].includes(
            k.id,
          ),
        )}
      />
      <div className="row g-3">
        <div className="col-lg-6">
          <BreakdownCard
            title="Activity by module"
            items={report.activityByModule}
            href="/modules/analytics/"
          />
        </div>
        <div className="col-lg-6">
          <BreakdownCard
            title="Enterprise programs by module"
            items={report.enterpriseByModule}
            href="/modules/lockout-tagout/"
          />
        </div>
      </div>
      <div className="row g-3">
        <div className="col-lg-6">
          <BreakdownCard
            title="Observations by status"
            items={report.observationsByStatus}
            href="/modules/observations/"
          />
        </div>
        <div className="col-lg-6">
          <TrendCard
            title="Inspection Trend"
            subtitle={report.periodLabel}
            points={report.inspectionsTrend}
            href="/modules/inspections/"
            stroke="var(--bs-info)"
          />
        </div>
      </div>
    </div>
  );
}

function DotTab({ report }: { report: SafetyIntelligenceReport }) {
  return (
    <div className="d-flex flex-column gap-4">
      <div className="row g-3">
        <ClickStat
          label="DOT score"
          value={`${report.dot.complianceScore}%`}
          href="/modules/dot-compliance/"
        />
        <ClickStat label="DOT records" value={report.dot.totalRecords} href="/modules/dot-compliance/" />
        <ClickStat
          label="Open items"
          value={report.dot.openItems}
          href="/modules/dot-compliance/"
          danger={report.dot.openItems > 0}
        />
        <ClickStat label="Company drivers" value="View" href="/modules/personnel/?view=company-drivers" />
      </div>
      <div className="card">
        <div className="card-body">
          <h6 className="card-title">DOT compliance</h6>
          <p className="text-muted mb-3">
            Open the DOT Compliance module for driver and vehicle records, expirations, and corrective
            follow-up.
          </p>
          <Link className="btn btn-primary" href="/modules/dot-compliance/">
            Open DOT Compliance
          </Link>
        </div>
      </div>
    </div>
  );
}

function HotspotsTab({ report }: { report: SafetyIntelligenceReport }) {
  return (
    <div className="d-flex flex-column gap-4">
      <BreakdownCard
        title="Records by module"
        items={report.activityByModule}
        href="/modules/analytics/"
      />
      <div className="row g-3">
        <div className="col-lg-6">
          <BreakdownCard
            title="Incidents by status"
            items={report.incidentsByStatus}
            href="/modules/incidents/"
          />
        </div>
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-body">
              <h6 className="card-title">Injury detail</h6>
              <p className="text-muted">
                Body-part injury mapping will populate as incident injury fields are filled in. Open
                Incidents to review individual cases.
              </p>
              <Link className="btn btn-outline-primary" href="/modules/incidents/">
                View incidents
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiGrid({ kpis }: { kpis: SafetyIntelligenceReport["kpis"] }) {
  return (
    <div className="row g-3">
      {kpis.map((kpi) => (
        <div className="col-6 col-md-4 col-xl-3" key={kpi.id}>
          <Link href={kpi.href} className="card h-100 text-decoration-none">
            <div className="card-body">
              <div className="text-muted text-uppercase small">{kpi.label}</div>
              <div className="fs-3 fw-semibold text-body">{kpi.value}</div>
              {kpi.sub ? <div className="small text-muted">{kpi.sub}</div> : null}
              <div className="small text-primary mt-2">View →</div>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}

function ClickStat({
  label,
  value,
  href,
  danger,
}: {
  label: string;
  value: string | number;
  href: string;
  danger?: boolean;
}) {
  return (
    <div className="col-6 col-md-3">
      <Link href={href} className="card h-100 text-decoration-none">
        <div className="card-body">
          <div className="text-muted small">{label}</div>
          <div className={`fs-4 fw-semibold${danger ? " text-danger" : ""}`}>{value}</div>
          <div className="small text-primary">View →</div>
        </div>
      </Link>
    </div>
  );
}

function BreakdownCard({
  title,
  items,
  href,
  showCount = true,
}: {
  title: string;
  items: Array<{ label: string; count: number; href?: string }>;
  href: string;
  showCount?: boolean;
}) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="card-title mb-0">{title}</h6>
          <Link href={href} className="small">
            Open
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="text-muted mb-0">No data in this period.</p>
        ) : (
          <ul className="list-group list-group-flush">
            {items.map((item) => (
              <li className="list-group-item px-0" key={`${item.label}-${item.count}`}>
                <Link
                  href={item.href || href}
                  className="d-flex justify-content-between align-items-center text-decoration-none text-body"
                >
                  <span>{item.label}</span>
                  {showCount ? <span className="badge bg-label-primary">{item.count}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TrendCard({
  title,
  subtitle,
  points,
  href,
  stroke,
}: {
  title: string;
  subtitle: string;
  points: AnalyticsTrendPoint[];
  href: string;
  stroke: string;
}) {
  const poly = useMemo(() => trendPolyline(points), [points]);
  const total = points.reduce((sum, p) => sum + p.count, 0);
  return (
    <Link href={href} className="card h-100 text-decoration-none">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div>
            <h6 className="mb-0 text-body">{title}</h6>
            <div className="small text-muted">{subtitle}</div>
          </div>
          <span className="badge bg-label-secondary">{total}</span>
        </div>
        {points.length === 0 ? (
          <p className="text-muted small mb-0">No activity in this window.</p>
        ) : (
          <svg viewBox="0 0 320 120" className="w-100" role="img" aria-label={`${title} chart`}>
            <polyline
              fill="none"
              stroke={stroke}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={poly}
            />
          </svg>
        )}
        <div className="small text-primary mt-2">View records →</div>
      </div>
    </Link>
  );
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="position-relative d-inline-flex align-items-center justify-content-center">
      <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--bs-gray-200)" strokeWidth="10" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="var(--bs-success)"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
        />
      </svg>
      <div className="position-absolute text-center">
        <div className="fs-2 fw-bold lh-1">{score}</div>
        <div className={`badge ${gradeBadgeClass(grade)} mt-1`}>Grade {grade}</div>
      </div>
    </div>
  );
}
