"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@forge/web-kit";
import { FeatureGate } from "@/components/feature-gate";
import { listIncidents, type IncidentSummary } from "@/lib/rms-api";
import { REVIEW_STATUSES } from "@/lib/constants";
import { FxTable } from "@/fx/tables/FxTable";
import { FxTableEmpty } from "@/fx/tables/FxTableStates";
import { ensureTablesRegistered } from "@/fx/tables/register-all";
import { useRmsFxIncidentReviewModule } from "@/fx/modules/use-incident-review-module";
import styles from "../page.module.css";

function ReviewInner() {
  const { me } = useAuth();
  const { queue: queueMode, loading: moduleFlagLoading } = useRmsFxIncidentReviewModule();
  const [items, setItems] = useState<IncidentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureTablesRegistered();
  }, []);

  const load = useCallback(async () => {
    if (!me?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listIncidents(me.tenantId, { page: "1", pageSize: "100" });
      setItems(
        result.data.filter((row) =>
          REVIEW_STATUSES.includes(row.status as (typeof REVIEW_STATUSES)[number]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }, [me?.tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const useFx = !moduleFlagLoading && queueMode === "fx";

  return (
    <FeatureGate flag="officerReview" title="Review">
      <section
        className={styles.page}
        data-testid={useFx ? "rms-fx-review-queue" : "rms-legacy-review-queue"}
      >
        <h1>Officer review</h1>
        <p className={styles.lead}>Incidents awaiting review, approval, or correction.</p>
        {error ? <p className={styles.error}>{error}</p> : null}
        {useFx ? (
          <FxTable
            caption="Review queue"
            loading={loading}
            empty={
              <FxTableEmpty
                title="No incidents in review."
                description="Queue is empty for this tenant."
              />
            }
            rows={items}
            rowKey={(row) => row.id}
            columns={[
              {
                id: "number",
                header: "Number",
                accessor: (row) => <span className={styles.mono}>{row.incidentNumber}</span>,
              },
              { id: "status", header: "Status", accessor: (row) => row.status },
              { id: "date", header: "Date", accessor: (row) => row.incidentDate ?? "—" },
            ]}
            rowActions={(row) => <Link href={`/incidents/${row.id}/?section=REVIEW`}>Review</Link>}
          />
        ) : (
          <div className={styles.panel}>
            {loading ? <p className={styles.muted}>Loading…</p> : null}
            {!loading && items.length === 0 ? (
              <p className={styles.muted}>No incidents in review.</p>
            ) : null}
            {items.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((incident) => (
                    <tr key={incident.id}>
                      <td className={styles.mono}>{incident.incidentNumber}</td>
                      <td>{incident.status}</td>
                      <td>{incident.incidentDate ?? "—"}</td>
                      <td>
                        <Link href={`/incidents/${incident.id}/?section=REVIEW`}>Review</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        )}
      </section>
    </FeatureGate>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <ReviewInner />
    </Suspense>
  );
}
