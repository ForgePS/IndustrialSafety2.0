"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ListControlsView, useAuth, useServerListControls } from "@forge/web-kit";
import { FeatureGate } from "@/components/feature-gate";
import { listIncidents, type IncidentSummary } from "@/lib/rms-api";
import { FxTable } from "@/fx/tables/FxTable";
import { FxTableEmpty } from "@/fx/tables/FxTableStates";
import { FxTableToolbar } from "@/fx/tables/FxTableToolbar";
import { ensureTablesRegistered } from "@/fx/tables/register-all";
import { useRmsFxIncidentModule } from "@/fx/modules/use-incident-module";
import styles from "../page.module.css";

function IncidentsInner() {
  const { me } = useAuth();
  const { list: listMode, loading: moduleFlagLoading } = useRmsFxIncidentModule();
  const controls = useServerListControls({ pageSize: 25, defaultSort: "created-desc" });
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
      const result = await listIncidents(me.tenantId, {
        page: String(controls.page),
        pageSize: String(controls.pageSize),
        ...(controls.search.trim() ? { search: controls.search.trim() } : {}),
      });
      setItems(result.data);
      controls.setTotal(result.meta?.pagination?.total ?? result.data.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load incidents");
    } finally {
      setLoading(false);
    }
    // granular controls fields only — full `controls` identity changes every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.tenantId, controls.page, controls.pageSize, controls.search, controls.setTotal]);

  useEffect(() => {
    void load();
  }, [load]);

  const useFx = !moduleFlagLoading && listMode === "fx";

  const listControls = (
    <ListControlsView
      search={controls.search}
      onSearchChange={controls.onSearchChange}
      searchLabel="Search incidents"
      sort={controls.sort}
      sortOptions={[
        { value: "created-desc", label: "Recently created" },
        { value: "number", label: "Incident number" },
      ]}
      onSortChange={controls.onSortChange}
      page={controls.page}
      pageSize={controls.pageSize}
      total={controls.total}
      onPageChange={controls.setPage}
    />
  );

  return (
    <FeatureGate flag="incidentShell" title="Incidents">
      <section className={styles.page}>
        <h1>Incidents</h1>
        <p className={styles.lead}>Manual NERIS incidents for your department.</p>
        <div className={styles.actions}>
          <Link href="/incidents/new/" className={styles.button}>
            New incident
          </Link>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        {useFx ? (
          <>
            <FxTableToolbar>{listControls}</FxTableToolbar>
            <FxTable
              caption="Incidents"
              loading={loading}
              empty={
                <FxTableEmpty
                  title="No incidents found."
                  description="Create a manual incident to get started."
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
                {
                  id: "description",
                  header: "Description",
                  accessor: (row) => row.dispatchDescription ?? row.primaryIncidentTypeCode ?? "—",
                },
              ]}
              rowActions={(row) => <Link href={`/incidents/${row.id}/`}>Open</Link>}
            />
          </>
        ) : (
          <>
            {listControls}
            <div className={styles.panel}>
              {loading ? <p className={styles.muted}>Loading…</p> : null}
              {!loading && items.length === 0 ? (
                <p className={styles.muted}>No incidents found.</p>
              ) : null}
              {items.length > 0 ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Description</th>
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
                          {incident.dispatchDescription ?? incident.primaryIncidentTypeCode ?? "—"}
                        </td>
                        <td>
                          <Link href={`/incidents/${incident.id}/`}>Open</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </>
        )}
      </section>
    </FeatureGate>
  );
}

export default function IncidentsPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <IncidentsInner />
    </Suspense>
  );
}
