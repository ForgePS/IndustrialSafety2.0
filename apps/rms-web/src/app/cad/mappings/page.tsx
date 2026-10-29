"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@forge/web-kit";
import { FeatureGate } from "@/components/feature-gate";
import {
  listCadUnknownPersonnel,
  listCadUnknownUnits,
  resolveCadUnknownPersonnel,
  resolveCadUnknownUnit,
  type CadUnknownPersonnel,
  type CadUnknownUnit,
} from "@/lib/rms-api";
import styles from "../../page.module.css";

function CadMappingsInner() {
  const { me } = useAuth();
  const [units, setUnits] = useState<CadUnknownUnit[]>([]);
  const [personnel, setPersonnel] = useState<CadUnknownPersonnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [unitRows, personnelRows] = await Promise.all([
        listCadUnknownUnits(me.tenantId),
        listCadUnknownPersonnel(me.tenantId),
      ]);
      setUnits(unitRows);
      setPersonnel(personnelRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mapping queues");
    } finally {
      setLoading(false);
    }
  }, [me?.tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function ignoreUnit(row: CadUnknownUnit) {
    if (!me?.tenantId) return;
    try {
      await resolveCadUnknownUnit(me.tenantId, row.id, {
        status: "IGNORED_WITH_REASON",
        resolutionReason: "Ignored from mapping UI",
        recordVersion: row.recordVersion,
        externalAgency: true,
        mappingType: "EXTERNAL",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve unknown unit");
    }
  }

  async function ignorePersonnel(row: CadUnknownPersonnel) {
    if (!me?.tenantId) return;
    try {
      await resolveCadUnknownPersonnel(me.tenantId, row.id, {
        status: "IGNORED_WITH_REASON",
        resolutionReason: "Ignored from mapping UI",
        recordVersion: row.recordVersion,
        externalAgency: true,
        mappingType: "EXTERNAL",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve unknown personnel");
    }
  }

  return (
    <FeatureGate flag="cadEnabled" title="CAD Unit / Personnel Mapping">
      <section className={styles.page}>
        <h1>Unit and personnel mapping</h1>
        <p className={styles.lead}>
          Unknown CAD entities awaiting mapping. External / ignore is available without Forge IDs.
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}
        {loading ? <p className={styles.muted}>Loading…</p> : null}
        <div className={styles.panel}>
          <h2>Unknown units</h2>
          {units.length === 0 ? <p className={styles.muted}>No unknown units.</p> : null}
          {units.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Source unit</th>
                  <th>Callsign</th>
                  <th>Count</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {units.map((row) => (
                  <tr key={row.id}>
                    <td className={styles.mono}>{row.sourceUnitId}</td>
                    <td>{row.sourceUnitCallsign ?? "—"}</td>
                    <td className={styles.mono}>{row.occurrenceCount}</td>
                    <td>{row.status}</td>
                    <td>
                      {row.status === "OPEN" ? (
                        <button
                          type="button"
                          className={styles.buttonSecondary}
                          onClick={() => void ignoreUnit(row)}
                        >
                          Mark external / ignore
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
        <div className={styles.panel}>
          <h2>Unknown personnel</h2>
          {personnel.length === 0 ? <p className={styles.muted}>No unknown personnel.</p> : null}
          {personnel.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Source ID</th>
                  <th>Name</th>
                  <th>Count</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {personnel.map((row) => (
                  <tr key={row.id}>
                    <td className={styles.mono}>{row.sourcePersonnelId}</td>
                    <td>{row.sourceName ?? "—"}</td>
                    <td className={styles.mono}>{row.occurrenceCount}</td>
                    <td>{row.status}</td>
                    <td>
                      {row.status === "OPEN" ? (
                        <button
                          type="button"
                          className={styles.buttonSecondary}
                          onClick={() => void ignorePersonnel(row)}
                        >
                          Mark external / ignore
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </section>
    </FeatureGate>
  );
}

export default function CadMappingsPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <CadMappingsInner />
    </Suspense>
  );
}
