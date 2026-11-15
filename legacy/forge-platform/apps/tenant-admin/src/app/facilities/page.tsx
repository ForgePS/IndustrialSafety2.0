"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type Facility = {
  id: string;
  facilityKey: string;
  name: string;
  status: string;
  facilityType: string | null;
};

function FacilitiesInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead =
    hasPermission("tenant.facilities.read") || hasPermission("tenant.configuration.update");
  const canManage = hasPermission("tenant.facilities.manage");

  const [rows, setRows] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [facilityKey, setFacilityKey] = useState("");
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    if (!tenantId || !hasPermission("tenant.facilities.read")) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await apiGet<Facility[]>(`/api/v1/tenants/${tenantId}/facilities`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load facilities");
    } finally {
      setLoading(false);
    }
  }, [tenantId, hasPermission]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canManage) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/facilities`, "POST", {
        facilityKey: facilityKey.trim(),
        name: name.trim(),
        status: "ACTIVE",
      });
      setFacilityKey("");
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create facility");
    } finally {
      setSubmitting(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Facilities</h1>
        <TenantRequired />
      </section>
    );
  }

  const q = tenantQuery(tenantId);

  return (
    <section className={styles.page}>
      <h1>Facilities</h1>
      <p className={styles.lead}>
        Tenant facilities (SQL API). Studio remains available for config docs.
      </p>

      {!canRead ? <p className={styles.error}>Missing facilities read permission.</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {canManage ? (
        <div className={styles.panel}>
          <h2>Create facility</h2>
          <form className={styles.form} onSubmit={onCreate}>
            <div className={styles.formRow}>
              <label htmlFor="facilityKey">Key</label>
              <input
                id="facilityKey"
                required
                value={facilityKey}
                onChange={(e) => setFacilityKey(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="name">Name</label>
              <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className={styles.panel}>
        <h2>Facilities</h2>
        {rows.length === 0 ? (
          <p className={styles.muted}>
            No facilities from API (requires tenant.facilities.read), or none created yet.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Key</th>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={styles.mono}>{row.facilityKey}</td>
                  <td>{row.name}</td>
                  <td>{row.facilityType ?? "—"}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <nav className={styles.linkRow}>
        <Link href={`/studio/facilities${q}`}>Studio · Facilities</Link>
        <Link href={`/studio/locations${q}`}>Studio · Locations</Link>
      </nav>
    </section>
  );
}

export default function FacilitiesPage() {
  return (
    <TenantPageGate
      title="Facilities"
      anyOf={["tenant.facilities.read", "tenant.configuration.update"]}
    >
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <FacilitiesInner />
      </Suspense>
    </TenantPageGate>
  );
}
