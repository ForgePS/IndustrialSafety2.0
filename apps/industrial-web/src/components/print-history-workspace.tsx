"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import { AdminActionDropdown, AdminEmptyState } from "@/components/admin-action-dropdown";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import {
  listPrintJobs,
  listPrinters,
  printerDisplayName,
  reprintPrintJob,
  retryPrintJob,
  type ForgePrinter,
  type PrintJob,
} from "@/lib/print-api";
import { promptReprintReason } from "@/lib/print-reprint-reason";
import { formatAdminDate } from "@/lib/platform-admin";

function statusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "COMPLETED") return "bg-label-success";
  if (s === "SENT_TO_PRINTER") return "bg-label-info";
  if (s === "FAILED" || s === "EXPIRED") return "bg-label-danger";
  if (s === "CANCELLED") return "bg-label-secondary";
  return "bg-label-warning";
}

function jobTitle(job: PrintJob): string {
  const parts = [job.module, job.recordType].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return `Job ${job.id.slice(0, 8)}`;
}

function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function PrintHistoryWorkspace({
  moduleName,
  embedded = false,
}: {
  moduleName: string;
  embedded?: boolean;
}) {
  const { hasAnyPermission, loading: authLoading } = useAuth();
  const canView = hasAnyPermission([
    "industrial.printer.view",
    "industrial.printer.print",
    "industrial.admin",
  ]);
  const canPrint = hasAnyPermission(["industrial.printer.print", "industrial.admin"]);
  const canReprint = hasAnyPermission([
    "industrial.printer.reprint",
    "industrial.printer.print",
    "industrial.admin",
  ]);

  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [printers, setPrinters] = useState<ForgePrinter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewJob, setViewJob] = useState<PrintJob | null>(null);
  const [errorJob, setErrorJob] = useState<PrintJob | null>(null);

  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  }, []);
  const defaultTo = useMemo(() => toDateInputValue(new Date()), []);

  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [statusFilter, setStatusFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [printerFilter, setPrinterFilter] = useState("");

  const printerMap = useMemo(() => {
    const map = new Map<string, ForgePrinter>();
    for (const p of printers) map.set(p.id, p);
    return map;
  }, [printers]);

  const moduleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const job of jobs) {
      if (job.module) set.add(job.module);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const [jobResult, printerRows] = await Promise.all([
        listPrintJobs({
          history: "1",
          pageSize: "100",
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(printerFilter ? { printerId: printerFilter } : {}),
        }),
        listPrinters().catch(() => [] as ForgePrinter[]),
      ]);
      setJobs(jobResult.items ?? []);
      setPrinters(printerRows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load print history.");
    } finally {
      setLoading(false);
    }
  }, [canView, statusFilter, printerFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    return jobs.filter((job) => {
      if (moduleFilter && job.module !== moduleFilter) return false;
      const created = job.createdAt ? new Date(job.createdAt).getTime() : NaN;
      if (fromMs != null && Number.isFinite(created) && created < fromMs) return false;
      if (toMs != null && Number.isFinite(created) && created > toMs) return false;
      return true;
    });
  }, [jobs, moduleFilter, dateFrom, dateTo]);

  async function onRetry(job: PrintJob) {
    if (!canPrint) return;
    setBusyId(job.id);
    try {
      await retryPrintJob(job.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Retry failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function onReprint(job: PrintJob) {
    if (!canReprint) return;
    const reason = promptReprintReason();
    if (!reason) {
      setError("Reprint cancelled — a valid reprint reason is required.");
      return;
    }
    setBusyId(job.id);
    try {
      await reprintPrintJob(job.id, { reason });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reprint failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading) {
    return <p className="text-muted mb-0">Loading print history…</p>;
  }

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        You need printer view permission to open Print History.
      </div>
    );
  }

  return (
    <section aria-labelledby="print-history-title">
      {embedded ? null : (
        <ModuleWorkspaceHeader
          id="print-history-title"
          eyebrow="System Tools"
          title={moduleName}
          description="Historical print jobs with filters by date, status, module, and printer."
          onRefresh={() => void load()}
          refreshing={loading}
        />
      )}
      {embedded ? (
        <div className="d-flex justify-content-end mb-3">
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="card border shadow-none mb-3">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-sm-6 col-lg-2">
              <label className="form-label" htmlFor="ph-date-from">
                From
              </label>
              <input
                id="ph-date-from"
                type="date"
                className="form-control"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="col-sm-6 col-lg-2">
              <label className="form-label" htmlFor="ph-date-to">
                To
              </label>
              <input
                id="ph-date-to"
                type="date"
                className="form-control"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="col-sm-6 col-lg-2">
              <label className="form-label" htmlFor="ph-status">
                Status
              </label>
              <select
                id="ph-status"
                className="form-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="COMPLETED">Completed</option>
                <option value="SENT_TO_PRINTER">Sent to printer</option>
                <option value="FAILED">Failed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="EXPIRED">Expired</option>
                <option value="PRINT_RESULT_UNKNOWN">Result unknown</option>
              </select>
            </div>
            <div className="col-sm-6 col-lg-3">
              <label className="form-label" htmlFor="ph-module">
                Module
              </label>
              <select
                id="ph-module"
                className="form-select"
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
              >
                <option value="">All</option>
                {moduleOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-sm-6 col-lg-3">
              <label className="form-label" htmlFor="ph-printer">
                Printer
              </label>
              <select
                id="ph-printer"
                className="form-select"
                value={printerFilter}
                onChange={(e) => setPrinterFilter(e.target.value)}
              >
                <option value="">All</option>
                {printers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {printerDisplayName(p)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card border shadow-none">
        <div className="table-responsive">
          <table className="table mb-0">
            <thead>
              <tr>
                <th>Job</th>
                <th>Date</th>
                <th>User / module</th>
                <th>Printer</th>
                <th>Connection</th>
                <th>Copies</th>
                <th>Status</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-muted">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <AdminEmptyState
                      title="No print history"
                      description="Completed, failed, and cancelled jobs will appear here."
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((job) => {
                  const printer = job.printerId ? printerMap.get(job.printerId) : undefined;
                  const status = String(job.status ?? "").toUpperCase();
                  return (
                    <tr key={job.id}>
                      <td>
                        <div className="fw-semibold">{jobTitle(job)}</div>
                        <div className="text-muted small font-monospace">{job.id.slice(0, 8)}</div>
                      </td>
                      <td>{formatAdminDate(job.createdAt)}</td>
                      <td>
                        <div>{job.module || "—"}</div>
                        <div className="text-muted small">
                          {job.requestedBy ? `${job.requestedBy.slice(0, 8)}…` : "—"}
                        </div>
                      </td>
                      <td>{printer ? printerDisplayName(printer) : "—"}</td>
                      <td>{printer?.connectionType?.replace(/_/g, " ") || "—"}</td>
                      <td>{job.copies}</td>
                      <td>
                        <span className={`badge ${statusBadgeClass(status)}`}>
                          {status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="text-end">
                        <AdminActionDropdown
                          busy={busyId === job.id}
                          items={[
                            {
                              id: "view",
                              label: "View",
                              icon: "bx-show",
                              onClick: () => setViewJob(job),
                            },
                            {
                              id: "retry",
                              label: "Retry",
                              icon: "bx-refresh",
                              hidden: !canPrint || !["FAILED", "EXPIRED"].includes(status),
                              onClick: () => void onRetry(job),
                            },
                            {
                              id: "reprint",
                              label: "Reprint",
                              icon: "bx-printer",
                              hidden:
                                !canReprint || !["COMPLETED", "SENT_TO_PRINTER"].includes(status),
                              onClick: () => void onReprint(job),
                            },
                            {
                              id: "error",
                              label: "View Error",
                              icon: "bx-error",
                              tone: "danger",
                              hidden: !job.errorMessage && status !== "FAILED",
                              onClick: () => setErrorJob(job),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewJob ? (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setViewJob(null)}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") setViewJob(null);
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
          <div
            className="modal-dialog modal-dialog-centered"
            role="document"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Print job</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setViewJob(null)}
                />
              </div>
              <div className="modal-body">
                <dl className="row mb-0 small">
                  <dt className="col-4">ID</dt>
                  <dd className="col-8 font-monospace">{viewJob.id}</dd>
                  <dt className="col-4">Status</dt>
                  <dd className="col-8">{String(viewJob.status).replace(/_/g, " ")}</dd>
                  <dt className="col-4">Module</dt>
                  <dd className="col-8">{viewJob.module || "—"}</dd>
                  <dt className="col-4">Copies</dt>
                  <dd className="col-8">{viewJob.copies}</dd>
                  <dt className="col-4">Created</dt>
                  <dd className="col-8">{formatAdminDate(viewJob.createdAt)}</dd>
                  <dt className="col-4">Completed</dt>
                  <dd className="col-8">{formatAdminDate(viewJob.completedAt)}</dd>
                </dl>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-primary" onClick={() => setViewJob(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {errorJob ? (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setErrorJob(null)}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") setErrorJob(null);
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
          <div
            className="modal-dialog modal-dialog-centered"
            role="document"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Print error</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setErrorJob(null)}
                />
              </div>
              <div className="modal-body">
                {errorJob.errorCode ? (
                  <p className="small text-muted mb-2">Code: {errorJob.errorCode}</p>
                ) : null}
                <div className="alert alert-danger mb-0" role="alert">
                  {errorJob.errorMessage || "No error details were recorded for this job."}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-primary" onClick={() => setErrorJob(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
