"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import {
  getPrintBatch,
  listPrintBatches,
  type PrintBatch,
  type PrintBatchDetail,
} from "@/lib/print-api";
import { formatAdminDate } from "@/lib/platform-admin";

function statusBadge(status: string): string {
  const s = status.toUpperCase();
  if (s === "COMPLETED") return "bg-label-success";
  if (s === "PARTIAL") return "bg-label-warning";
  if (s === "FAILED" || s === "CANCELLED") return "bg-label-danger";
  if (s === "PRINTING" || s === "QUEUED") return "bg-label-primary";
  return "bg-label-secondary";
}

function progressLabel(b: PrintBatch): string {
  const done = b.completedJobs + b.failedJobs;
  return `${done} / ${b.totalJobs}`;
}

export function PrintManagerBatchesPanel() {
  const { hasAnyPermission } = useAuth();
  const canView = hasAnyPermission([
    "industrial.printer.view",
    "industrial.printer.print",
    "industrial.admin",
  ]);

  const [batches, setBatches] = useState<PrintBatch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PrintBatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const rows = await listPrintBatches();
      setBatches(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load batches.");
    } finally {
      setLoading(false);
    }
  }, [canView]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const next = await getPrintBatch(id);
      setDetail(next);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load batch detail.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
    const active = batches.find((b) => b.id === selectedId);
    if (!active || active.status === "PRINTING" || active.status === "QUEUED") {
      const timer = window.setInterval(() => {
        void loadDetail(selectedId);
        void load();
      }, 2500);
      return () => window.clearInterval(timer);
    }
    return undefined;
  }, [selectedId, batches, loadDetail, load]);

  if (!canView) {
    return <p className="text-muted mb-0">You do not have permission to view print batches.</p>;
  }

  const failedJobs = (detail?.jobs ?? []).filter((j) => {
    const s = String(j.status ?? "").toUpperCase();
    return s === "FAILED" || s === "CANCELLED" || s === "EXPIRED";
  });

  return (
    <div>
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <p className="text-muted small mb-3">
        Batch progress and failures stay visible — failed items are never dropped from the batch.
        Stop-on-fail cancels remaining jobs after the first failure; continue-on-error finishes the
        batch as PARTIAL when some jobs fail.
      </p>

      <div className="row g-3">
        <div className="col-lg-5">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h6 className="mb-0">Recent batches</h6>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => void load()}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
          <div className="card border shadow-none">
            <div className="table-responsive" style={{ maxHeight: 480, overflow: "auto" }}>
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Progress</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && batches.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-muted">
                        Loading…
                      </td>
                    </tr>
                  ) : batches.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-muted">
                        No batches yet. Select multiple fleet assets and use Print Labels.
                      </td>
                    </tr>
                  ) : (
                    batches.map((b) => (
                      <tr
                        key={b.id}
                        className={selectedId === b.id ? "table-active" : undefined}
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelectedId(b.id)}
                      >
                        <td>
                          <div className="font-monospace small">{b.id.slice(0, 8)}</div>
                          <div className="small text-muted">{formatAdminDate(b.createdAt)}</div>
                          <div className="small text-muted">
                            {b.stopOnFail ? "Stop on fail" : "Continue on error"}
                          </div>
                        </td>
                        <td>
                          <div className="small">{progressLabel(b)}</div>
                          <div className="small text-muted">
                            ✓ {b.completedJobs} · ✗ {b.failedJobs}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${statusBadge(b.status)}`}>{b.status}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          {!detail ? (
            <div className="text-muted">Select a batch to view job progress and failures.</div>
          ) : (
            <>
              <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
                <h6 className="mb-0 me-auto">
                  Batch <span className="font-monospace">{detail.id.slice(0, 8)}</span>
                </h6>
                <span className={`badge ${statusBadge(detail.status)}`}>{detail.status}</span>
              </div>
              <div className="row g-2 mb-3">
                <div className="col-4">
                  <div className="border rounded p-2">
                    <div className="text-muted small">Completed</div>
                    <div className="fs-5 fw-semibold text-success">{detail.completedJobs}</div>
                  </div>
                </div>
                <div className="col-4">
                  <div className="border rounded p-2">
                    <div className="text-muted small">Failed / cancelled</div>
                    <div className="fs-5 fw-semibold text-danger">{detail.failedJobs}</div>
                  </div>
                </div>
                <div className="col-4">
                  <div className="border rounded p-2">
                    <div className="text-muted small">Pending</div>
                    <div className="fs-5 fw-semibold">
                      {Math.max(
                        0,
                        detail.totalJobs - detail.completedJobs - detail.failedJobs,
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {failedJobs.length > 0 ? (
                <div className="alert alert-warning py-2" role="status">
                  {failedJobs.length} job(s) failed or were cancelled — listed below with error
                  details.
                </div>
              ) : null}

              <div className="card border shadow-none">
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th>Job</th>
                        <th>Record</th>
                        <th>Status</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.jobs ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-muted">
                            No jobs linked.
                          </td>
                        </tr>
                      ) : (
                        (detail.jobs ?? []).map((j) => (
                          <tr key={j.id}>
                            <td className="font-monospace small">{j.id.slice(0, 8)}</td>
                            <td className="small">
                              {[j.module, j.recordType].filter(Boolean).join(" · ") || "—"}
                              {j.recordId ? (
                                <div className="text-muted font-monospace">
                                  {j.recordId.slice(0, 8)}
                                </div>
                              ) : null}
                            </td>
                            <td>
                              <span className={`badge ${statusBadge(j.status)}`}>{j.status}</span>
                            </td>
                            <td className="small text-danger">
                              {j.errorCode || j.errorMessage || "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
