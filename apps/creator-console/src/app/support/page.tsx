"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  ErrorState,
  ForgePageHeader,
  LoadingState,
  StatusBadge,
} from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { tenantDetailHref } from "@/hooks/use-tenant-id";
import { apiGet } from "@/lib/api";
import { customerStatusTone, humanCustomerStatus } from "@/lib/presentation";
import styles from "../page.module.css";

type Tenant = {
  id: string;
  displayName: string;
  status: string;
  updatedAt?: string;
};

function SupportInner() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await apiGet<Tenant[]>("/api/v1/platform/tenants");
      setTenants(
        all.filter((t) => ["SUSPENDED", "ONBOARDING", "TRIAL"].includes(t.status.toUpperCase())),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't load support customers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Customer Support"
        subtitle="Customers that may need attention. Start a support session when you need audited access."
      />
      {error ? <ErrorState title="Support list unavailable" description={error} /> : null}
      {loading ? <LoadingState label="Loading…" /> : null}
      {!loading && tenants.length === 0 ? (
        <EmptyState
          title="No customers need attention"
          description="Trial, onboarding, and suspended customers appear here."
          action={
            <Link className="forge-btn" href="/customers/">
              Browse customers
            </Link>
          }
        />
      ) : null}
      {tenants.length > 0 ? (
        <div className={styles.panel} style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={tenantDetailHref(t.id)}>{t.displayName}</Link>
                  </td>
                  <td>
                    <StatusBadge tone={customerStatusTone(t.status)}>
                      {humanCustomerStatus(t.status)}
                    </StatusBadge>
                  </td>
                  <td className={styles.actions}>
                    <Link href={tenantDetailHref(t.id)}>Open Customer</Link>
                    <Link href={`${tenantDetailHref(t.id)}&tab=printing`}>Print Health</Link>
                    <Link href={`${tenantDetailHref(t.id)}&tab=audit`}>View Activity</Link>
                    <Link href="/support/sessions/">Start Support Session</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export default function SupportPage() {
  return (
    <PlatformPageGate title="Customer Support" permission="platform.tenant.read">
      <SupportInner />
    </PlatformPageGate>
  );
}
