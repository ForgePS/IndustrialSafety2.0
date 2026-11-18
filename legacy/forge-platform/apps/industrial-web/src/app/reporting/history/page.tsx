"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@forge/web-kit";
import { AdminEmptyState } from "@/components/admin-action-dropdown";
import { fetchHistory, type ReportExecutionRow } from "@/lib/reporting-api";

export default function ReportingHistoryPage() {
  const [items, setItems] = useState<ReportExecutionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchHistory();
      setItems(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="mb-4 d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div>
          <p className="settings-admin-sidebar__eyebrow mb-2">Compliance & exports</p>
          <h1 className="h4 mb-1">Report history</h1>
          <p className="text-muted mb-0">Recent executions and audit trail.</p>
        </div>
        <button type="button" className="btn btn-outline-secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="card border shadow-none">
        {loading ? (
          <div className="card-body text-muted">Loading history…</div>
        ) : items.length === 0 ? (
          <div className="card-body">
            <AdminEmptyState
              title="No runs yet"
              description="Run a report from the library to see history here."
              action={
                <Link href="/reporting/library/" className="btn btn-sm btn-outline-primary">
                  Browse library
                </Link>
              }
            />
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Status</th>
                  <th>Rows</th>
                  <th>Duration</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="fw-medium">{row.reportName}</div>
                      <div className="small text-muted">
                        <code>{row.reportKey}</code>
                      </div>
                    </td>
                    <td>
                      <span className="badge bg-label-secondary text-capitalize">{row.status}</span>
                    </td>
                    <td>{row.rowCount}</td>
                    <td>{row.durationMs != null ? `${row.durationMs} ms` : "—"}</td>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
