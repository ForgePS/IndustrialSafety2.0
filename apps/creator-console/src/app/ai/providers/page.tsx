"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet } from "@/lib/api";
import styles from "../../page.module.css";

type ProviderRow = {
  id: string;
  providerKey: string;
  product: string;
  status: string;
  region: string | null;
  hasCredentials: boolean;
  credentialsLabel: string;
};

function Inner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead =
    hasPermission("platform.ai.narrative.manage") ||
    hasPermission("platform.ai.provider.manage") ||
    hasPermission("platform.ai.usage.view");
  const [items, setItems] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<{ items: ProviderRow[] }>("/api/v1/ai/providers", {
        query: { tenantId },
      });
      setItems(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>AI Providers</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>AI Providers</h1>
      <p className={styles.lead}>
        Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/ai${tenantQuery(tenantId)}`}>Overview</Link>
      </p>
      <p className={styles.muted}>
        Credential ARNs are never shown. Stub providers report &quot;no credentials&quot;.
      </p>
      {!canRead ? <p className={styles.error}>Missing provider view permission</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}
      <div className={styles.panel}>
        {items.length === 0 && !loading ? (
          <p className={styles.muted}>No provider configurations for this tenant.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Product</th>
                <th>Status</th>
                <th>Region</th>
                <th>Credentials</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td className={styles.mono}>{row.providerKey}</td>
                  <td>{row.product}</td>
                  <td>{row.status}</td>
                  <td>{row.region ?? "—"}</td>
                  <td>{row.credentialsLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <p className={styles.muted}>Loading…</p>
        </main>
      }
    >
      <Inner />
    </Suspense>
  );
}
