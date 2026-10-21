"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError } from "@forge/web-kit";
import { AdminEmptyState } from "@/components/admin-action-dropdown";
import { BUILT_IN_REPORTS } from "@/lib/reporting-catalog";
import {
  fetchHistory,
  fetchLibraryReports,
  fetchReportingOverview,
  fetchSchedules,
  type LibraryReportItem,
  type ReportExecutionRow,
  type ReportingOverview,
  type ReportScheduleRow,
} from "@/lib/reporting-api";

const KPI_META = [
  { id: "saved", label: "Saved reports", href: "/reporting/saved/", icon: "bx-bookmark", key: "savedReports" as const },
  { id: "scheduled", label: "Scheduled", href: "/reporting/scheduled/", icon: "bx-calendar", key: "scheduled" as const },
  { id: "runs", label: "Runs this month", href: "/reporting/history/", icon: "bx-play-circle", key: "runsThisMonth" as const },
  {
    id: "compliance",
    label: "Compliance",
    href: "/reporting/compliance/",
    icon: "bx-shield-quarter",
    key: "complianceBuiltinCount" as const,
  },
  { id: "exports", label: "Recent exports", href: "/reporting/exports/", icon: "bx-export", key: "recentExports" as const },
  { id: "library", label: "Library reports", href: "/reporting/library/", icon: "bx-library", key: "libraryCount" as const },
] as const;

export default function ReportingOverviewPage() {
  const [overview, setOverview] = useState<ReportingOverview | null>(null);
  const [favorites, setFavorites] = useState<LibraryReportItem[]>([]);
  const [recentRuns, setRecentRuns] = useState<ReportExecutionRow[]>([]);
  const [schedules, setSchedules] = useState<ReportScheduleRow[]>([]);
  const [libraryPreview, setLibraryPreview] = useState<LibraryReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [ov, lib, hist, sched] = await Promise.all([
          fetchReportingOverview(),
          fetchLibraryReports().catch(() => null),
          fetchHistory().catch(() => null),
          fetchSchedules().catch(() => null),
        ]);
        if (cancelled) return;
        setOverview(ov);
        const items = lib?.items ?? [];
        setFavorites(items.filter((r) => r.isFavorite).slice(0, 6));
        setLibraryPreview(items.slice(0, 6));
        setRecentRuns((hist?.items ?? []).slice(0, 6));
        setSchedules((sched?.items ?? []).slice(0, 5));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load reporting overview");
        setLibraryPreview(
          BUILT_IN_REPORTS.slice(0, 6).map((r) => ({
            key: r.key,
            id: null,
            name: r.name,
            description: r.description,
            module: r.module,
            category: r.category,
            reportType: r.reportType,
            origin: "builtin",
            isFavorite: false,
          })),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const kpiValue = (key: (typeof KPI_META)[number]["key"]): number => {
    if (overview) return overview[key];
    if (key === "complianceBuiltinCount") {
      return BUILT_IN_REPORTS.filter((r) => r.reportType === "compliance").length;
    }
    if (key === "libraryCount") return BUILT_IN_REPORTS.length;
    return 0;
  };

  return (
    <>
      <div
        className="mb-4 d-flex flex-wrap align-items-start justify-content-between gap-3"
        data-walkthrough="reporting-center"
      >
        <div>
          <p className="settings-admin-sidebar__eyebrow mb-2">Reporting</p>
          <h1 className="h4 mb-1">Reporting</h1>
          <p className="text-muted mb-0">
            Build, analyze, schedule, export, and manage reports across your organization.
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Link href="/reporting/builder/" className="btn btn-primary">
            + Create report
          </Link>
          <Link href="/reporting/library/" className="btn btn-outline-primary">
            Report library
          </Link>
          <Link href="/reporting/scheduled/" className="btn btn-outline-secondary">
            Scheduled
          </Link>
        </div>
      </div>

      {error ? (
        <div className="alert alert-warning" role="status">
          {error}
        </div>
      ) : null}

      <div className="row g-3 mb-4">
        {KPI_META.map((card) => (
          <div key={card.id} className="col-6 col-md-4">
            <Link href={card.href} className="card h-100 text-decoration-none reporting-kpi-card">
              <div className="card-body">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-muted small">{card.label}</span>
                  <i className={`bx ${card.icon} text-muted`} aria-hidden />
                </div>
                <p className="display-6 mb-0 lh-1">{loading && !overview ? "…" : kpiValue(card.key)}</p>
              </div>
            </Link>
          </div>
        ))}
      </div>

      <div className="row g-3 mb-4">
        <div className="col-12 col-lg-6">
          <div className="card border shadow-none h-100">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h2 className="h6 mb-0">Favorites</h2>
                <Link href="/reporting/favorites/" className="small">
                  View all
                </Link>
              </div>
              {favorites.length === 0 ? (
                <AdminEmptyState
                  title="No favorites yet"
                  description="Star reports from the library to pin them here."
                  action={
                    <Link href="/reporting/library/" className="btn btn-sm btn-outline-primary">
                      Browse library
                    </Link>
                  }
                />
              ) : (
                <ul className="list-unstyled mb-0">
                  {favorites.map((fav) => (
                    <li key={fav.key} className="d-flex justify-content-between align-items-center py-2 border-bottom">
                      <div>
                        <div className="fw-medium">{fav.name}</div>
                        <div className="small text-muted">{fav.module ?? fav.category ?? fav.key}</div>
                      </div>
                      <Link
                        href={`/reporting/library/?q=${encodeURIComponent(fav.name)}`}
                        className="btn btn-sm btn-outline-primary"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <div className="card border shadow-none h-100">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h2 className="h6 mb-0">Recently run</h2>
                <Link href="/reporting/history/" className="small">
                  History
                </Link>
              </div>
              {recentRuns.length === 0 ? (
                <AdminEmptyState
                  title="No runs yet"
                  description="Report execution history will appear here after you run a report."
                />
              ) : (
                <ul className="list-unstyled mb-0">
                  {recentRuns.map((run) => (
                    <li key={run.id} className="d-flex justify-content-between align-items-center py-2 border-bottom">
                      <div>
                        <div className="fw-medium">{run.reportName}</div>
                        <div className="small text-muted">
                          {run.rowCount} rows · {new Date(run.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <span className="badge bg-label-secondary text-capitalize">{run.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card border shadow-none mb-4">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h2 className="h6 mb-0">Scheduled reports</h2>
            <Link href="/reporting/scheduled/" className="small">
              Manage
            </Link>
          </div>
          {schedules.length === 0 ? (
            <AdminEmptyState
              title="No schedules"
              description="Create a recurring schedule from the Scheduled page."
            />
          ) : (
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Cron</th>
                    <th>Format</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>
                        <code className="small">{s.cronExpression}</code>
                      </td>
                      <td className="text-uppercase">{s.format}</td>
                      <td>{s.enabled ? "Enabled" : "Paused"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card border shadow-none">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h2 className="h6 mb-1">Report library preview</h2>
              <p className="text-muted small mb-0">Built-in and saved reports available to run and export.</p>
            </div>
            <Link href="/reporting/library/" className="btn btn-sm btn-outline-primary">
              Open library
            </Link>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Module</th>
                  <th>Category</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {libraryPreview.map((report) => (
                  <tr key={report.key}>
                    <td>
                      <div className="fw-medium">{report.name}</div>
                      <div className="small text-muted">{report.description}</div>
                    </td>
                    <td>{report.module ?? "—"}</td>
                    <td>{report.category ?? "—"}</td>
                    <td className="text-end">
                      <Link
                        href={`/reporting/library/?q=${encodeURIComponent(report.name)}`}
                        className="btn btn-sm btn-outline-primary"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
