"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import {
  getPrintAnalyticsFailures,
  getPrintAnalyticsPrinters,
  getPrintAnalyticsSummary,
  getPrintAnalyticsVolume,
  type PrintAnalyticsFailures,
  type PrintAnalyticsPrinters,
  type PrintAnalyticsSummary,
  type PrintAnalyticsVolume,
} from "@/lib/print-api";
import { formatAdminDate } from "@/lib/platform-admin";

function defaultFromIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function PrintManagerAnalyticsPanel() {
  const { hasAnyPermission } = useAuth();
  const canView = hasAnyPermission([
    "industrial.printer.view",
    "industrial.printer.print",
    "industrial.admin",
  ]);

  const [from, setFrom] = useState(defaultFromIso);
  const [to, setTo] = useState(() => new Date().toISOString());
  const [moduleFilter, setModuleFilter] = useState("");
  const [summary, setSummary] = useState<PrintAnalyticsSummary | null>(null);
  const [volume, setVolume] = useState<PrintAnalyticsVolume | null>(null);
  const [failures, setFailures] = useState<PrintAnalyticsFailures | null>(null);
  const [printers, setPrinters] = useState<PrintAnalyticsPrinters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      from,
      to,
      ...(moduleFilter.trim() ? { module: moduleFilter.trim() } : {}),
    }),
    [from, to, moduleFilter],
  );

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [s, v, f, p] = await Promise.all([
        getPrintAnalyticsSummary(query),
        getPrintAnalyticsVolume(query),
        getPrintAnalyticsFailures(query),
        getPrintAnalyticsPrinters(query),
      ]);
      setSummary(s);
      setVolume(v);
      setFailures(f);
      setPrinters(p);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }, [canView, query]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canView) {
    return <p className="text-muted mb-0">You do not have permission to view print analytics.</p>;
  }

  const maxDayJobs = Math.max(1, ...(volume?.byDay.map((d) => d.jobs) ?? [1]));

  return (
    <div>
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <div>
          <label className="form-label small mb-1">From</label>
          <input
            type="datetime-local"
            className="form-control form-control-sm"
            value={from.slice(0, 16)}
            onChange={(e) => setFrom(new Date(e.target.value).toISOString())}
          />
        </div>
        <div>
          <label className="form-label small mb-1">To</label>
          <input
            type="datetime-local"
            className="form-control form-control-sm"
            value={to.slice(0, 16)}
            onChange={(e) => setTo(new Date(e.target.value).toISOString())}
          />
        </div>
        <div>
          <label className="form-label small mb-1">Module</label>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="All modules"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {loading && !summary ? (
        <p className="text-muted">Loading analytics…</p>
      ) : summary ? (
        <>
          <div className="row g-3 mb-4">
            <div className="col-6 col-md-3">
              <div className="card border shadow-none">
                <div className="card-body py-3">
                  <div className="text-muted small text-uppercase">Jobs</div>
                  <div className="fs-4 fw-semibold">{summary.totals.jobs}</div>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border shadow-none">
                <div className="card-body py-3">
                  <div className="text-muted small text-uppercase">Labels printed</div>
                  <div className="fs-4 fw-semibold">{summary.totals.labelsPrinted}</div>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border shadow-none border-danger">
                <div className="card-body py-3">
                  <div className="text-muted small text-uppercase">Failure rate</div>
                  <div className="fs-4 fw-semibold">{summary.totals.failureRate}%</div>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border shadow-none">
                <div className="card-body py-3">
                  <div className="text-muted small text-uppercase">Retry rate</div>
                  <div className="fs-4 fw-semibold">{summary.totals.retryRate}%</div>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border shadow-none">
                <div className="card-body py-3">
                  <div className="text-muted small text-uppercase">Reprints</div>
                  <div className="fs-4 fw-semibold">{summary.totals.reprints}</div>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border shadow-none">
                <div className="card-body py-3">
                  <div className="text-muted small text-uppercase">Avg queue</div>
                  <div className="fs-4 fw-semibold">
                    {formatMs(summary.totals.averageQueueMs)}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border shadow-none">
                <div className="card-body py-3">
                  <div className="text-muted small text-uppercase">Avg print</div>
                  <div className="fs-4 fw-semibold">
                    {formatMs(summary.totals.averagePrintMs)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="row g-3 mb-4">
            <div className="col-lg-7">
              <div className="card border shadow-none h-100">
                <div className="card-header">
                  <h6 className="mb-0">Volume by day</h6>
                </div>
                <div className="card-body">
                  {(volume?.byDay.length ?? 0) === 0 ? (
                    <p className="text-muted mb-0">No jobs in this range.</p>
                  ) : (
                    <div className="d-flex align-items-end gap-1" style={{ minHeight: 120 }}>
                      {volume!.byDay.map((d) => (
                        <div
                          key={d.date}
                          className="flex-fill text-center"
                          title={`${d.date}: ${d.jobs} jobs, ${d.labels} labels, ${d.failed} failed`}
                        >
                          <div
                            className="bg-primary rounded-top mx-auto"
                            style={{
                              height: `${Math.max(4, Math.round((d.jobs / maxDayJobs) * 100))}px`,
                              width: "100%",
                              maxWidth: 18,
                            }}
                          />
                          <div className="small text-muted" style={{ fontSize: 10 }}>
                            {d.date.slice(5)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="card border shadow-none h-100">
                <div className="card-header">
                  <h6 className="mb-0">Jobs by module</h6>
                </div>
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th>Module</th>
                        <th>Jobs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.byModule.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="text-muted">
                            No data
                          </td>
                        </tr>
                      ) : (
                        summary.byModule.map((row) => (
                          <tr key={row.module}>
                            <td>{row.module}</td>
                            <td>{row.count}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-lg-6">
              <div className="card border shadow-none">
                <div className="card-header">
                  <h6 className="mb-0">Printer utilization</h6>
                </div>
                <div className="table-responsive" style={{ maxHeight: 320, overflow: "auto" }}>
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th>Printer</th>
                        <th>Jobs</th>
                        <th>Fail %</th>
                        <th>Util %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(printers?.printers.length ?? 0) === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-muted">
                            No printer activity
                          </td>
                        </tr>
                      ) : (
                        printers!.printers.map((p) => (
                          <tr key={p.printerId ?? p.printerName}>
                            <td>{p.printerName}</td>
                            <td>{p.jobs}</td>
                            <td>{p.failureRate}%</td>
                            <td>{p.utilizationPercent}%</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="card border shadow-none">
                <div className="card-header d-flex justify-content-between">
                  <h6 className="mb-0">Failure report</h6>
                  <span className="small text-muted">
                    {failures?.totalFailed ?? 0} failed · {failures?.failureRate ?? 0}%
                  </span>
                </div>
                <div className="table-responsive" style={{ maxHeight: 320, overflow: "auto" }}>
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Printer</th>
                        <th>Code</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(failures?.recent.length ?? 0) === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-muted">
                            No failures in range
                          </td>
                        </tr>
                      ) : (
                        failures!.recent.map((f) => (
                          <tr key={f.id}>
                            <td className="small">{formatAdminDate(f.createdAt)}</td>
                            <td>{f.printerName || "—"}</td>
                            <td className="font-monospace small">{f.errorCode || "—"}</td>
                            <td className="small text-muted text-truncate" style={{ maxWidth: 180 }}>
                              {f.errorMessage || "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
