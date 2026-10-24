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
    products: Array<{ productCode: string; productName: string; status: string }>;
  };
};

function ProductsInner() {
  const tenantId = useTenantId();
  const [products, setProducts] = useState<Overview["entitlements"]["products"]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const overview = await apiGet<Overview>(`/api/v1/tenants/${tenantId}/billing/overview`);
      setProducts(overview.entitlements?.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
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
        <h1>Products</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Products</h1>
      <p className={styles.lead}>
        Entitled products · <Link href={`/modules${tenantQuery(tenantId)}`}>Modules</Link> ·{" "}
        <Link href={`/billing${tenantQuery(tenantId)}`}>Billing</Link>
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}
      <div className={styles.panel}>
        {products.length === 0 ? (
          <p className={styles.muted}>No product entitlements.</p>
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
              {products.map((row) => (
                <tr key={row.productCode}>
                  <td className={styles.mono}>{row.productCode}</td>
                  <td>{row.productName}</td>
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

export default function ProductsPage() {
  return (
    <TenantPageGate title="Products" anyOf={["tenant.billing.read", "platform.entitlement.manage"]}>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <ProductsInner />
      </Suspense>
    </TenantPageGate>
  );
}
