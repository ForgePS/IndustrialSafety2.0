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
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { listSubscriptions, type TenantSubscription } from "@/lib/api";
import { unavailableLabel } from "@/lib/presentation";
import styles from "../page.module.css";

type SubscriptionRow = TenantSubscription;

function RenewalsInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead =
    hasPermission("platform.entitlement.manage") || hasPermission("tenant.billing.read");
  const [rows, setRows] = useState<SubscriptionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!tenantId || !canRead) {
        setRows([]);
        return;
      }
      const list = await listSubscriptions(tenantId);
      setRows(list.filter((row) => row.status !== "CANCELED"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't load renewals.");
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Renewals"
        subtitle="Upcoming subscription renewals for the selected customer context."
      />
      {!tenantId ? <TenantRequired /> : null}
      {error ? <ErrorState title="Renewals unavailable" description={error} /> : null}
      {loading ? <LoadingState label="Loading renewals…" /> : null}
      {!loading && rows && rows.length === 0 ? (
        <EmptyState
          title="No renewals to show"
          description="Subscriptions with renewal dates appear here when billing data is available for the selected customer."
          action={
            <Link className="forge-btn" href="/subscriptions/">
              View subscriptions
            </Link>
          }
        />
      ) : null}
      {rows && rows.length > 0 ? (
        <div className={styles.panel} style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Status</th>
                <th>Renewal date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const renewAt = row.renewsAt ?? row.currentPeriodEnd;
                return (
                  <tr key={row.id}>
                    <td>{row.planName ?? "Subscription"}</td>
                    <td>
                      <StatusBadge>{row.status ?? "Unknown"}</StatusBadge>
                    </td>
                    <td>{renewAt ? new Date(renewAt).toLocaleDateString() : unavailableLabel()}</td>
                    <td>
                      <Link href={`/subscriptions${tenantId ? tenantQuery(tenantId) : ""}`}>
                        Manage
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export default function RenewalsPage() {
  return (
    <PlatformPageGate
      title="Renewals"
      anyOf={["platform.entitlement.manage", "tenant.billing.read"]}
    >
      <RenewalsInner />
    </PlatformPageGate>
  );
}
