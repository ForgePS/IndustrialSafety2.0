"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@forge/web-kit";
import {
  formatReportCell,
  runReport,
  toReportDateTime,
  type ReportRunResult,
} from "@/lib/reporting-api";

export default function ReportingAnalyticsPage() {
  const [result, setResult] = useState<ReportRunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body: { dateFrom?: string; dateTo?: string; limit?: number } = { limit: 100 };
      const from = toReportDateTime(dateFrom, false);
      const to = toReportDateTime(dateTo, true);
      if (from) body.dateFrom = from;
      if (to) body.dateTo = to;
      const run = await runReport("safety.monthly_stats", body);
      setResult(run);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load analytics");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const metricRows = result?.rows ?? [];

  return (
    <>
      <div className="mb-4 d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div>
          <p className="settings-admin-sidebar__eyebrow mb-2">Admin</p>
          <h1 className="h4 mb-1">Analytics</h1>
          <p className="text-muted mb-0">Monthly safety statistics from the reporting engine.</p>
        </div>
        <Link href="/reporting/library/?q=Monthly%20Safety" className="btn btn-outline-primary">
          Open in library
        </Link>
      </div>

      <div className="card border shadow-none mb-3">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-3">
              <label className="form-label" htmlFor="analytics-from">
                Date from
              </label>
              <input
                id="analytics-from"
                type="date"
                className="form-control"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label" htmlFor="analytics-to">
                Date to
              </label>
              <input
                id="analytics-to"
                type="date"
                className="form-control"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading}
                onClick={() => void load()}
              >
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="row g-3 mb-4">
        {loading && !result
          ? [1, 2].map((i) => (
              <div key={i} className="col-6 col-md-3">
                <div className="card border shadow-none h-100">
                  <div className="card-body">
                    <div className="text-muted small">Loading…</div>
                    <p className="display-6 mb-0 lh-1">…</p>
                  </div>
                </div>
              </div>
            ))
          : metricRows.map((row, idx) => (
              <div key={idx} className="col-6 col-md-3">
                <div className="card border shadow-none h-100 reporting-kpi-card">
                  <div className="card-body">
                    <div className="text-muted small mb-2">{formatReportCell(row.metric)}</div>
                    <p className="display-6 mb-0 lh-1">{formatReportCell(row.value)}</p>
                  </div>
                </div>
              </div>
            ))}
      </div>

      <div className="card border shadow-none">
        <div className="card-body">
          <h2 className="h6 mb-3">safety.monthly_stats</h2>
          {result ? (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    {result.columns.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.length === 0 ? (
                    <tr>
                      <td colSpan={Math.max(result.columns.length, 1)} className="text-muted">
                        No metrics for this range.
                      </td>
                    </tr>
                  ) : (
                    result.rows.map((row, idx) => (
                      <tr key={idx}>
                        {result.columns.map((col) => (
                          <td key={col.key}>{formatReportCell(row[col.key])}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : !loading ? (
            <p className="text-muted mb-0">No analytics data loaded.</p>
          ) : (
            <p className="text-muted mb-0">Loading…</p>
          )}
        </div>
      </div>
    </>
  );
}
