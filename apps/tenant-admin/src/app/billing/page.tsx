"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { useAuth } from "@/hooks/use-auth";
import { useTenantId } from "@/hooks/use-tenant-id";
import { apiGet } from "@/lib/api";
import styles from "../page.module.css";

type Overview = {
  customer: { displayName: string; billingEmail: string | null } | null;
  subscription: {
    status: string;
    planCode: string | null;
    planName: string | null;
    billingInterval: string | null;
  } | null;
  invoices: Array<{
    id: string;
    status: string;
    amountDueCents: number;
    currency: string;
    hostedInvoiceUrl: string | null;
  }>;
  contracts: Array<{ id: string; name: string; status: string; renewalOn: string | null }>;
  entitlements: {
    products: Array<{ productCode: string; productName: string; status: string }>;
    modules: Array<{ moduleCode: string; moduleName: string; status: string }>;
  };
  paymentPortal: { available: boolean; url: string | null; message: string };
};

function BillingInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead =
    hasPermission("tenant.billing.read") || hasPermission("platform.entitlement.manage");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Overview>(`/api/v1/tenants/${tenantId}/billing/overview`);
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.page}>
      <h1>Billing</h1>
      <p className={styles.lead}>Tenant billing overview (read-only).</p>

      {!tenantId ? <p className={styles.error}>Select a tenant to continue.</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {overview ? (
        <>
          <div className={styles.panel}>
            <h2>Current plan</h2>
            <p>
              {overview.subscription?.planName ?? overview.subscription?.planCode ?? "No plan"} ·{" "}
              {overview.subscription?.status ?? "n/a"}
              {overview.subscription?.billingInterval
                ? ` · ${overview.subscription.billingInterval}`
                : ""}
            </p>
            <p className={styles.muted}>Contact: {overview.customer?.billingEmail ?? "Not set"}</p>
            <p>
              Payment portal:{" "}
              {overview.paymentPortal.available && overview.paymentPortal.url ? (
                <a href={overview.paymentPortal.url} target="_blank" rel="noreferrer">
                  Open
                </a>
              ) : (
                <span className={styles.muted}>{overview.paymentPortal.message}</span>
              )}
            </p>
          </div>

          <div className={styles.panel}>
            <h2>Products</h2>
            <ul>
              {overview.entitlements.products.length === 0 ? <li>None</li> : null}
              {overview.entitlements.products.map((p) => (
                <li key={p.productCode}>
                  {p.productName} ({p.status})
                </li>
              ))}
            </ul>
            <h2>Modules</h2>
            <ul>
              {overview.entitlements.modules.length === 0 ? <li>None</li> : null}
              {overview.entitlements.modules.map((m) => (
                <li key={m.moduleCode}>
                  {m.moduleName} ({m.status})
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.panel}>
            <h2>Contracts</h2>
            <ul>
              {overview.contracts.length === 0 ? <li>None</li> : null}
              {overview.contracts.map((c) => (
                <li key={c.id}>
                  {c.name} · {c.status}
                  {c.renewalOn ? ` · renews ${c.renewalOn}` : ""}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.panel}>
            <h2>Invoice history</h2>
            <ul>
              {overview.invoices.length === 0 ? <li>None</li> : null}
              {overview.invoices.map((inv) => (
                <li key={inv.id}>
                  {inv.status} · {(inv.amountDueCents / 100).toFixed(2)} {inv.currency}
                  {inv.hostedInvoiceUrl ? (
                    <>
                      {" "}
                      ·{" "}
                      <a href={inv.hostedInvoiceUrl} target="_blank" rel="noreferrer">
                        view
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default function TenantBillingPage() {
  return (
    <TenantPageGate title="Billing" anyOf={["tenant.billing.read", "platform.entitlement.manage"]}>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <BillingInner />
      </Suspense>
    </TenantPageGate>
  );
}
