"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet } from "@/lib/api";
import styles from "../page.module.css";

type Permission = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
};

function PermissionsInner() {
  const tenantId = useTenantId();
  const [items, setItems] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await apiGet<Permission[]>(`/api/v1/tenants/${tenantId}/permissions`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load permissions");
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
        <h1>Permissions</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Permissions</h1>
      <p className={styles.lead}>
        Permission catalog · <Link href={`/roles${tenantQuery(tenantId)}`}>Roles</Link>
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      <div className={styles.panel}>
        {items.length === 0 ? (
          <p className={styles.muted}>No permissions.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td className={styles.mono}>{row.code}</td>
                  <td>{row.name}</td>
                  <td>{row.category ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default function PermissionsPage() {
  return (
    <TenantPageGate title="Permissions" permission="platform.permission.read">
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <PermissionsInner />
      </Suspense>
    </TenantPageGate>
  );
}
