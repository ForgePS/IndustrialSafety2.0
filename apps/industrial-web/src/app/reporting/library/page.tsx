"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { AdminEmptyState } from "@/components/admin-action-dropdown";
import {
  BUILT_IN_REPORTS,
  filterBuiltInReports,
  listReportCategories,
  listReportModules,
  sortBuiltInReports,
} from "@/lib/reporting-catalog";
import {
  downloadBase64,
  exportReport,
  favoriteReport,
  fetchLibraryReports,
  formatReportCell,
  requestExportDownload,
  runReport,
  toReportDateTime,
  unfavoriteReport,
  type LibraryReportItem,
  type ReportExportFormat,
  type ReportRunResult,
} from "@/lib/reporting-api";

function builtinFallback(filters: {
  search: string;
  category: string;
  module: string;
  reportType: string;
}): LibraryReportItem[] {
  const filtered = filterBuiltInReports(BUILT_IN_REPORTS, filters);
  return sortBuiltInReports(filtered, "name").map((r) => ({
    key: r.key,
    id: null,
    name: r.name,
    description: r.description,
    module: r.module,
    category: r.category,
    reportType: r.reportType,
    origin: "builtin",
    sourceKey: r.key,
    tags: [...r.tags],
    isFavorite: false,
  }));
}

function ReportLibraryInner() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  const [search, setSearch] = useState(initialQ);
  const [category, setCategory] = useState("");
  const [module, setModule] = useState("");
  const [reportType, setReportType] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "module" | "category">("name");
  const [items, setItems] = useState<LibraryReportItem[]>([]);
  const [usingFallback, setUsingFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [runTarget, setRunTarget] = useState<LibraryReportItem | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [year, setYear] = useState("");
  const [runResult, setRunResult] = useState<ReportRunResult | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState<ReportExportFormat | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchLibraryReports({
        search,
        category,
        module,
        reportType,
      });
      setItems(result.items);
      setUsingFallback(false);
    } catch (err) {
      setUsingFallback(true);
      setItems(builtinFallback({ search, category, module, reportType }));
      setError(
        err instanceof ApiError
          ? `${err.message} — showing built-in catalog offline.`
          : "API unavailable — showing built-in catalog.",
      );
    } finally {
      setLoading(false);
    }
  }, [search, category, module, reportType]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load();
    }, 200);
    return () => window.clearTimeout(handle);
  }, [load]);

  const categories = useMemo(() => {
    const fromItems = [...new Set(items.map((r) => r.category).filter(Boolean) as string[])];
    return fromItems.length ? fromItems.sort((a, b) => a.localeCompare(b)) : listReportCategories();
  }, [items]);

  const modules = useMemo(() => {
    const fromItems = [...new Set(items.map((r) => r.module).filter(Boolean) as string[])];
    return fromItems.length ? fromItems.sort((a, b) => a.localeCompare(b)) : listReportModules();
  }, [items]);

  const rows = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      const left = (a[sortBy] ?? "") as string;
      const right = (b[sortBy] ?? "") as string;
      const cmp = left.localeCompare(right);
      return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
    });
    return copy;
  }, [items, sortBy]);

  function runBody() {
    const body: {
      dateFrom?: string;
      dateTo?: string;
      year?: number;
      limit?: number;
    } = { limit: 1000 };
    const from = toReportDateTime(dateFrom, false);
    const to = toReportDateTime(dateTo, true);
    if (from) body.dateFrom = from;
    if (to) body.dateTo = to;
    const y = year.trim() ? Number(year) : undefined;
    if (y && Number.isFinite(y)) body.year = y;
    return body;
  }

  async function onToggleFavorite(report: LibraryReportItem) {
    setBusyKey(report.key);
    setMessage(null);
    try {
      if (report.isFavorite) {
        await unfavoriteReport(report.key);
      } else {
        await favoriteReport(report.key);
      }
      setItems((prev) =>
        prev.map((r) => (r.key === report.key ? { ...r, isFavorite: !r.isFavorite } : r)),
      );
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to update favorite");
    } finally {
      setBusyKey(null);
    }
  }

  function openRun(report: LibraryReportItem) {
    setRunTarget(report);
    setRunResult(null);
    setMessage(null);
  }

  async function onRun() {
    if (!runTarget) return;
    setRunBusy(true);
    setMessage(null);
    try {
      const result = await runReport(runTarget.key, runBody());
      setRunResult(result);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to run report");
    } finally {
      setRunBusy(false);
    }
  }

  async function onExport(format: ReportExportFormat) {
    if (!runTarget) return;
    setExportBusy(format);
    setMessage(null);
    try {
      const result = await exportReport(runTarget.key, { ...runBody(), format });
      if (result.contentBase64) {
        downloadBase64(result.filename, result.contentType, result.contentBase64);
        setMessage(`Downloaded ${result.filename}`);
      } else if (result.downloadUrl) {
        const download = await requestExportDownload(result.exportId);
        window.open(download.downloadUrl, "_blank", "noopener,noreferrer");
        setMessage(`Large export ready — opened download for ${result.filename}`);
      } else {
        setMessage(`Export ${result.exportId} created. Download it from Exports.`);
      }
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to export report");
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <>
      <div className="mb-4">
        <p className="settings-admin-sidebar__eyebrow mb-2">Library</p>
        <h1 className="h4 mb-1">Report library</h1>
        <p className="text-muted mb-0">
          Built-in and saved reports. Search, filter, run, export, and favorite.
        </p>
      </div>

      {error ? (
        <div className="alert alert-warning" role="status">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-info" role="status">
          {message}
        </div>
      ) : null}

      <div className="card border shadow-none mb-3">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label" htmlFor="report-search">
                Search
              </label>
              <input
                id="report-search"
                className="form-control"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reports…"
              />
            </div>
            <div className="col-md-2">
              <label className="form-label" htmlFor="report-category">
                Category
              </label>
              <select
                id="report-category"
                className="form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label" htmlFor="report-module">
                Module
              </label>
              <select
                id="report-module"
                className="form-select"
                value={module}
                onChange={(e) => setModule(e.target.value)}
              >
                <option value="">All</option>
                {modules.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label" htmlFor="report-type">
                Type
              </label>
              <select
                id="report-type"
                className="form-select"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                <option value="">All</option>
                <option value="standard">Standard</option>
                <option value="compliance">Compliance</option>
                <option value="operational">Operational</option>
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label" htmlFor="report-sort">
                Sort
              </label>
              <select
                id="report-sort"
                className="form-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "name" | "module" | "category")}
              >
                <option value="name">Name</option>
                <option value="module">Module</option>
                <option value="category">Category</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card border shadow-none mb-3">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>Report name</th>
                <th>Module</th>
                <th>Category</th>
                <th>Type</th>
                <th>Origin</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-muted">
                    Loading library…
                  </td>
                </tr>
              ) : (
                rows.map((report) => (
                  <tr key={report.key}>
                    <td>
                      <div className="fw-medium">{report.name}</div>
                      <div className="small text-muted">{report.description}</div>
                    </td>
                    <td>{report.module ?? "—"}</td>
                    <td>{report.category ?? "—"}</td>
                    <td className="text-capitalize">{report.reportType}</td>
                    <td className="text-capitalize">{report.origin}</td>
                    <td className="text-end text-nowrap">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary me-1"
                        disabled={usingFallback || busyKey === report.key}
                        title={report.isFavorite ? "Remove favorite" : "Add favorite"}
                        onClick={() => void onToggleFavorite(report)}
                      >
                        <i className={`bx ${report.isFavorite ? "bxs-star" : "bx-star"}`} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={usingFallback}
                        onClick={() => openRun(report)}
                      >
                        Run
                      </button>
                      <Link
                        href={`/reporting/scheduled/?report=${encodeURIComponent(report.id ?? report.key)}`}
                        className="btn btn-sm btn-outline-secondary ms-1"
                      >
                        Schedule
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 ? (
          <div className="card-body">
            <AdminEmptyState
              title="No reports match"
              description="Try clearing filters or searching a different module."
              action={
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => {
                    setSearch("");
                    setCategory("");
                    setModule("");
                    setReportType("");
                  }}
                >
                  Clear filters
                </button>
              }
            />
          </div>
        ) : (
          <div className="card-footer bg-transparent small text-muted">
            Showing {rows.length} report{rows.length === 1 ? "" : "s"}
            {usingFallback ? " (offline catalog)" : ""}
          </div>
        )}
      </div>

      {runTarget ? (
        <div className="card border shadow-none">
          <div className="card-body">
            <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
              <div>
                <h2 className="h6 mb-1">Run: {runTarget.name}</h2>
                <p className="text-muted small mb-0">
                  <code>{runTarget.key}</code>
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => {
                  setRunTarget(null);
                  setRunResult(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="row g-3 align-items-end mb-3">
              <div className="col-md-3">
                <label className="form-label" htmlFor="run-date-from">
                  Date from
                </label>
                <input
                  id="run-date-from"
                  type="date"
                  className="form-control"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="run-date-to">
                  Date to
                </label>
                <input
                  id="run-date-to"
                  type="date"
                  className="form-control"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label" htmlFor="run-year">
                  Year
                </label>
                <input
                  id="run-year"
                  type="number"
                  className="form-control"
                  placeholder="e.g. 2026"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
              <div className="col-md-4 d-flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={runBusy}
                  onClick={() => void onRun()}
                >
                  {runBusy ? "Running…" : "Run report"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  disabled={!!exportBusy}
                  onClick={() => void onExport("csv")}
                >
                  {exportBusy === "csv" ? "…" : "CSV"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  disabled={!!exportBusy}
                  onClick={() => void onExport("xlsx")}
                >
                  {exportBusy === "xlsx" ? "…" : "XLSX"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  disabled={!!exportBusy}
                  onClick={() => void onExport("pdf")}
                >
                  {exportBusy === "pdf" ? "…" : "PDF"}
                </button>
              </div>
            </div>

            {runResult ? (
              <>
                <p className="small text-muted mb-2">
                  {runResult.rows.length} row{runResult.rows.length === 1 ? "" : "s"} · execution{" "}
                  <code>{runResult.executionId}</code>
                </p>
                <div className="table-responsive" style={{ maxHeight: 420 }}>
                  <table className="table table-sm table-striped mb-0">
                    <thead>
                      <tr>
                        {runResult.columns.map((col) => (
                          <th key={col.key}>{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {runResult.rows.length === 0 ? (
                        <tr>
                          <td colSpan={Math.max(runResult.columns.length, 1)} className="text-muted">
                            No rows returned for these parameters.
                          </td>
                        </tr>
                      ) : (
                        runResult.rows.map((row, idx) => (
                          <tr key={idx}>
                            {runResult.columns.map((col) => (
                              <td key={col.key}>{formatReportCell(row[col.key])}</td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function ReportLibraryPage() {
  return (
    <Suspense fallback={<p className="text-muted mb-0">Loading library…</p>}>
      <ReportLibraryInner />
    </Suspense>
  );
}
