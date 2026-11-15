"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet } from "@/lib/api";
import styles from "../page.module.css";

type Overview = {
  entitlements: {
    modules: Array<{ moduleCode: string; moduleName: string; status: string }>;
  };
};

function ModulesInner() {
  const tenantId = useTenantId();
  const [modules, setModules] = useState<Overview["entitlements"]["modules"]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const overview = await apiGet<Overview>(`/api/v1/tenants/${tenantId}/billing/overview`);
      setModules(overview.entitlements?.modules ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load modules");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Modules</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Modules</h1>
      <p className={styles.lead}>
        Entitled modules · <Link href={`/products${tenantQuery(tenantId)}`}>Products</Link>
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}
      <div className={styles.panel}>
        {modules.length === 0 ? (
          <p className={styles.muted}>No module entitlements.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((row) => (
                <tr key={row.moduleCode}>
                  <td className={styles.mono}>{row.moduleCode}</td>
                  <td>{row.moduleName}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default function ModulesPage() {
  return (
    <TenantPageGate title="Modules" anyOf={["tenant.billing.read", "platform.entitlement.manage"]}>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <ModulesInner />
      </Suspense>
    </TenantPageGate>
  );
}
