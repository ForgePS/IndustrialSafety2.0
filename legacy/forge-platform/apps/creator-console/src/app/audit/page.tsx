"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { tenantDetailHref } from "@/hooks/use-tenant-id";
import { TenantRequired } from "@/components/tenant-required";
import { apiGetResult } from "@/lib/api";
import styles from "../page.module.css";

type AuditEvent = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: string;
  riskLevel: string;
  actorUserId: string | null;
  correlationId: string | null;
  occurredAt: string;
};

const PAGE_SIZE = 25;

function AuditInner() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
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
        Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={tenantDetailHref(tenantId)}>Customer detail</Link>
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions} style={{ marginBottom: "0.75rem" }}>
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
        <h2>Recent events</h2>
        {loading ? <p className={styles.muted}>Loading…</p> : null}
        {!loading && events.length === 0 ? <p className={styles.muted}>No audit events.</p> : null}
        {events.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Occurred</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Result</th>
                <th>Risk</th>
                <th>Actor</th>
                <th>Correlation</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className={styles.mono}>
                    {typeof event.occurredAt === "string"
                      ? event.occurredAt
                      : String(event.occurredAt)}
                  </td>
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
                  <td className={styles.mono}>{event.actorUserId ?? "—"}</td>
                  <td className={styles.mono}>{event.correlationId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}

export default function AuditPage() {
  return (
    <PlatformPageGate title="Audit" permission="platform.audit.read">
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <AuditInner />
      </Suspense>
    </PlatformPageGate>
  );
}
