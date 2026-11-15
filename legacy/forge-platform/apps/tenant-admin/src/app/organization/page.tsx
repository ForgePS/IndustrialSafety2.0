"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet } from "@/lib/api";
import styles from "../page.module.css";

type Organization = {
  id: string;
  name: string;
  status: string;
  organizationKey?: string;
};

function OrganizationInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canReadOrgs = hasPermission("platform.organization.read");
  const [rows, setRows] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !canReadOrgs) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await apiGet<Organization[]>(`/api/v1/tenants/${tenantId}/organizations`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canReadOrgs]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Organization</h1>
        <TenantRequired />
      </section>
    );
  }

  const q = tenantQuery(tenantId);

  return (
    <section className={styles.page}>
      <h1>Organization</h1>
      <p className={styles.lead}>Tenant organizations and profile settings.</p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      <div className={styles.panel}>
        <h2>Organizations</h2>
        {!canReadOrgs ? (
          <p className={styles.muted}>Organization list requires platform.organization.read.</p>
        ) : rows.length === 0 ? (
          <p className={styles.muted}>No organizations found.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.status}</td>
                  <td className={styles.mono}>{row.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <nav className={styles.linkRow}>
        <Link href={`/studio/organization-profile${q}`}>Studio · Org profile</Link>
        <Link href={`/studio/tenant-profile${q}`}>Studio · Tenant profile</Link>
      </nav>
    </section>
  );
}

export default function OrganizationPage() {
  return (
    <TenantPageGate
      title="Organization"
      anyOf={["tenant.configuration.update", "platform.organization.read"]}
    >
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <OrganizationInner />
      </Suspense>
    </TenantPageGate>
  );
}
