"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useTenantId } from "@/hooks/use-tenant-id";
import { apiGetResult, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type AuditEvent = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: string;
  riskLevel: string;
  actorUserId: string | null;
  correlationId?: string;
  occurredAt: string;
};

const PAGE_SIZE = 25;

function AuditInner() {
  const tenantId = useTenantId();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(
    async (nextPage: number) => {
      if (!tenantId) return;
      const gen = ++generation.current;
      setLoading(true);
      setError(null);
      try {
        const result = await apiGetResult<AuditEvent[]>(
          `/api/v1/tenants/${tenantId}/audit-events`,
          { query: { page: String(nextPage), pageSize: String(PAGE_SIZE) } },
        );
        if (gen !== generation.current) return;
        setEvents(result.data);
        setTotal(result.meta?.total ?? result.data.length);
        setPage(nextPage);
      } catch (err) {
        if (gen !== generation.current) return;
        setError(err instanceof Error ? err.message : "Failed to load audit events");
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [tenantId],
  );

  useEffect(() => {
    setEvents([]);
    setTotal(0);
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
      setExportNote(`Export ${result.exportId} · ${result.count} events · ${result.exportedAt}`);
      await load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Audit</h1>
        <TenantRequired />
      </section>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className={styles.page}>
      <h1>Audit</h1>
      <p className={styles.lead}>
        Recent audited actions · <span className={styles.mono}>{tenantId}</span>
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {exportNote ? <p className={styles.muted}>{exportNote}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      <div className={styles.actions} style={{ marginBottom: "1rem" }}>
        <button type="button" onClick={() => void exportEvents()} disabled={busy}>
          Export (JSON)
        </button>
        <button
          type="button"
          className={styles.buttonSecondary}
          disabled={page <= 1 || loading}
          onClick={() => void load(page - 1)}
        >
          Previous
        </button>
        <span className={styles.muted}>
          Page {page} / {pageCount} · {total} total
        </span>
        <button
          type="button"
          className={styles.buttonSecondary}
          disabled={page >= pageCount || loading}
          onClick={() => void load(page + 1)}
        >
          Next
        </button>
      </div>

      <div className={styles.panel}>
        {events.length === 0 ? (
          <p className={styles.muted}>No audit events.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Occurred</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Result</th>
                <th>Risk</th>
                <th>Correlation</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className={styles.mono}>{event.occurredAt}</td>
                  <td>{event.action}</td>
                  <td>
                    {event.resourceType}
                    {event.resourceId ? (
                      <>
                        <br />
                        <span className={styles.mono}>{event.resourceId}</span>
                      </>
                    ) : null}
                  </td>
                  <td>{event.result}</td>
                  <td>{event.riskLevel}</td>
                  <td className={styles.mono}>{event.correlationId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default function AuditPage() {
  return (
    <TenantPageGate title="Audit" permission="platform.audit.read">
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <AuditInner />
      </Suspense>
    </TenantPageGate>
  );
}
