"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import { AdminActionDropdown, AdminEmptyState } from "@/components/admin-action-dropdown";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import {
  cancelPrintJob,
  listPrintJobs,
  listPrinters,
  PRINT_QUEUE_TABS,
  printerDisplayName,
  reprintPrintJob,
  retryPrintJob,
  type ForgePrinter,
  type PrintJob,
  type PrintQueueTab,
} from "@/lib/print-api";
import { promptReprintCopies, promptReprintReason } from "@/lib/print-reprint-reason";
import { formatAdminDate } from "@/lib/platform-admin";

const TAB_LABELS: Record<PrintQueueTab, string> = {
  printing: "Printing",
  waiting: "Waiting",
  completed: "Completed",
  failed: "Failed",
};

function statusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "COMPLETED") return "bg-label-success";
  if (s === "SENT_TO_PRINTER") return "bg-label-info";
  if (s === "FAILED" || s === "EXPIRED") return "bg-label-danger";
  if (s === "CANCELLED") return "bg-label-secondary";
  if (s === "PRINTING" || s === "SPOOLING" || s === "TRANSMITTING") return "bg-label-primary";
  return "bg-label-warning";
}

function jobTitle(job: PrintJob): string {
  const parts = [job.module, job.recordType].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return `Job ${job.id.slice(0, 8)}`;
}

export function PrintQueueWorkspace({
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
  const canCancel = hasAnyPermission([
    "industrial.printer.cancel",
    "industrial.printer.print",
    "industrial.admin",
  ]);
  const canReprint = hasAnyPermission([
    "industrial.printer.reprint",
    "industrial.printer.print",
    "industrial.admin",
  ]);

  const [tab, setTab] = useState<PrintQueueTab>("printing");
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [printers, setPrinters] = useState<ForgePrinter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewJob, setViewJob] = useState<PrintJob | null>(null);
  const [errorJob, setErrorJob] = useState<PrintJob | null>(null);
  const generation = useRef(0);

  const printerMap = useMemo(() => {
    const map = new Map<string, ForgePrinter>();
    for (const p of printers) map.set(p.id, p);
    return map;
  }, [printers]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!canView) return;
      const gen = ++generation.current;
      if (!opts?.silent) setLoading(true);
      try {
        const [jobResult, printerRows] = await Promise.all([
          // Load recent jobs across statuses so Printing / Waiting / Completed / Failed tabs work.
          listPrintJobs({ pageSize: "100" }),
          listPrinters().catch(() => [] as ForgePrinter[]),
        ]);
        if (gen !== generation.current) return;
        setJobs(jobResult.items ?? []);
        setPrinters(printerRows);
        setError(null);
      } catch (err) {
        if (gen !== generation.current) return;
        setError(err instanceof ApiError ? err.message : "Could not load print queue.");
      } finally {
        if (gen === generation.current && !opts?.silent) setLoading(false);
      }
    },
    [canView],
  );

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (!canView) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void load({ silent: true });
    };
    const id = setInterval(tick, 3000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [canView, load]);

  const filtered = useMemo(() => {
    const allowed = new Set<string>(PRINT_QUEUE_TABS[tab]);
    return jobs.filter((j) => allowed.has(String(j.status ?? "").toUpperCase()));
  }, [jobs, tab]);

  const counts = useMemo(() => {
    const result: Record<PrintQueueTab, number> = {
      printing: 0,
      waiting: 0,
      completed: 0,
      failed: 0,
    };
    for (const job of jobs) {
      const status = String(job.status ?? "").toUpperCase();
      (Object.keys(PRINT_QUEUE_TABS) as PrintQueueTab[]).forEach((key) => {
        if ((PRINT_QUEUE_TABS[key] as readonly string[]).includes(status)) {
          result[key] += 1;
        }
      });
    }
    return result;
  }, [jobs]);

  async function onCancel(job: PrintJob) {
    if (!canCancel) return;
    setBusyId(job.id);
    try {
      await cancelPrintJob(job.id);
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Cancel failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function onRetry(job: PrintJob) {
    if (!canPrint) return;
    setBusyId(job.id);
    try {
      await retryPrintJob(job.id);
      setTab("waiting");
      await load({ silent: true });
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
    const copies = promptReprintCopies(job.copies || 1);
    if (copies == null) {
      setError("Reprint cancelled.");
      return;
    }
    setBusyId(job.id);
    try {
      await reprintPrintJob(job.id, { reason, copies });
      setTab("waiting");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reprint failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading) {
    return <p className="text-muted mb-0">Loading print queue…</p>;
  }

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        You need printer view permission to open Print Queue.
      </div>
    );
  }

  return (
    <section aria-labelledby="print-queue-title">
      {embedded ? null : (
        <ModuleWorkspaceHeader
          id="print-queue-title"
          eyebrow="System Tools"
          title={moduleName}
          description="Live print jobs queued for Forge Printer Bridge — refresh automatically while this page is visible."
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

      <ul className="nav nav-pills mb-3 flex-wrap gap-1" role="tablist">
        {(Object.keys(TAB_LABELS) as PrintQueueTab[]).map((key) => (
          <li className="nav-item" key={key}>
            <button
              type="button"
              className={`nav-link${tab === key ? " active" : ""}`}
              onClick={() => setTab(key)}
            >
              {TAB_LABELS[key]}
              <span className="badge bg-label-secondary ms-2">{counts[key]}</span>
            </button>
          </li>
        ))}
      </ul>

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
              {loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-muted">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <AdminEmptyState
                      title={`No ${TAB_LABELS[tab].toLowerCase()} jobs`}
                      description="Jobs appear here as the bridge claims and reports status."
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((job) => {
                  const printer = job.printerId ? printerMap.get(job.printerId) : undefined;
                  const status = String(job.status ?? "").toUpperCase();
                  const active = ![
                    "COMPLETED",
                    "SENT_TO_PRINTER",
                    "FAILED",
                    "CANCELLED",
                    "EXPIRED",
                  ].includes(status);
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
                              id: "cancel",
                              label: "Cancel",
                              icon: "bx-x",
                              tone: "warning",
                              hidden: !canCancel || !active,
                              onClick: () => void onCancel(job),
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
                  <dt className="col-4">Record</dt>
                  <dd className="col-8">
                    {viewJob.recordType || "—"}
                    {viewJob.recordId ? ` · ${viewJob.recordId.slice(0, 8)}…` : ""}
                  </dd>
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
