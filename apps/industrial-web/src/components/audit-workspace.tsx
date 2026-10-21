"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiSend, useAuth } from "@forge/web-kit";
import { AdminEmptyState } from "@/components/admin-action-dropdown";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import {
  canReadAuditLog,
  formatAdminDate,
  listAuditEvents,
  type AuditEventRow,
} from "@/lib/platform-admin";

const PAGE_SIZE = 25;

function riskBadge(level: string): string {
  const key = level.toUpperCase();
  if (key === "HIGH" || key === "CRITICAL") return "bg-label-danger";
  if (key === "MEDIUM") return "bg-label-warning";
  if (key === "LOW") return "bg-label-info";
  return "bg-label-secondary";
}

export function AuditWorkspace() {
  const { me, loading: authLoading } = useAuth();
  const tenantId = me?.tenantId ?? "";
  const canAccess = canReadAuditLog(me);

  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(
    async (nextPage: number) => {
      if (!tenantId || !canAccess) return;
      const gen = ++generation.current;
      setLoading(true);
      setError(null);
      try {
        const result = await listAuditEvents(tenantId, { page: nextPage, pageSize: PAGE_SIZE });
        if (gen !== generation.current) return;
        setEvents(result.events);
        setTotal(result.total);
        setPage(nextPage);
      } catch (err) {
        if (gen !== generation.current) return;
        setError(err instanceof ApiError ? err.message : "Failed to load audit events");
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [tenantId, canAccess],
  );

  useEffect(() => {
    void load(1);
    return () => {
      generation.current += 1;
    };
  }, [load]);

  async function exportEvents() {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    setExportNote(null);
    try {
      const result = await apiSend<{
        exportId: string;
        count: number;
        exportedAt: string;
      }>(`/api/v1/tenants/${tenantId}/audit-events/export`, "POST");
      setExportNote(
        `Export ${result.exportId} · ${result.count} events · ${formatAdminDate(result.exportedAt)}`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return <p className="text-muted mb-0">Loading audit log…</p>;
  }

  if (!canAccess) {
    return (
      <div className="alert alert-warning" role="alert">
        <h4 className="alert-heading">Audit log</h4>
        <p className="mb-0">You need audit read permission to view platform activity for this tenant.</p>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section aria-labelledby="audit-title">
      <ModuleWorkspaceHeader
        id="audit-title"
        eyebrow="Platform admin"
        title="Audit log"
        description="Review sign-ins, membership changes, permission updates, and other security-relevant events."
        onRefresh={() => void load(page)}
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger mb-4" role="alert">
          {error}
        </div>
      ) : null}
      {exportNote ? (
        <div className="alert alert-success mb-4" role="status">
          {exportNote}
        </div>
      ) : null}

      <div className="card">
        <div className="card-header d-flex flex-wrap align-items-center gap-2">
          <h6 className="mb-0 me-auto">Recent activity</h6>
          <button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => void exportEvents()}>
            <i className="bx bx-export me-1" />
            Export JSON
          </button>
        </div>
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Result</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {loading && events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted">
                    Loading audit events…
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <AdminEmptyState
                      title="No audit events yet"
                      description="Activity will appear here as admins and users make changes."
                    />
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id}>
                    <td className="text-nowrap small">{formatAdminDate(event.occurredAt)}</td>
                    <td>
                      <div className="fw-medium">{event.action}</div>
                      {event.correlationId ? (
                        <small className="text-muted font-monospace">{event.correlationId}</small>
                      ) : null}
                    </td>
                    <td>
                      <div>{event.resourceType}</div>
                      {event.resourceId ? (
                        <small className="text-muted font-monospace">{event.resourceId}</small>
                      ) : null}
                    </td>
                    <td>{event.result}</td>
                    <td>
                      <span className={`badge ${riskBadge(event.riskLevel)}`}>{event.riskLevel}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="card-footer d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span className="text-muted small">
            Page {page} of {pageCount} · {total} total events
          </span>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={page <= 1 || loading}
              onClick={() => void load(page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={page >= pageCount || loading}
              onClick={() => void load(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
