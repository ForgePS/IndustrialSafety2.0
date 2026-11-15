"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type AiOverview = {
  tenantId: string;
  flags: Record<string, boolean>;
  entitlement: { aiNarrativeModulePresent: boolean; moduleCode: string };
  providers: Array<{
    id: string;
    providerKey: string;
    product: string;
    status: string;
    region: string | null;
    hasCredentials: boolean;
    credentialsLabel: string;
  }>;
  policy: {
    id: string;
    product: string;
    status: string;
    monthlyRequestQuota: number;
    dailyUserQuota: number;
    perRecordLimit: number;
    requireAcceptedTerms: boolean;
    termsAcceptedAt: string | null;
  } | null;
  usage: { monthRequestCount: number; totalRequestCount: number };
  sensitiveDataEnabled: boolean;
  suspended: boolean;
};

function OverviewInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead =
    hasPermission("platform.ai.narrative.manage") || hasPermission("platform.ai.usage.view");
  const canSuspend =
    hasPermission("platform.ai.narrative.manage") || hasPermission("platform.ai.policy.manage");

  const [data, setData] = useState<AiOverview | null>(null);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const overview = await apiGet<AiOverview>("/api/v1/ai/management/overview", {
        query: { tenantId },
      });
      setData(overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI overview");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  async function suspendTenant() {
    if (!tenantId || !canSuspend) return;
    if (!window.confirm("Suspend AI narrative policy for this tenant?")) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/ai/management/tenants/${tenantId}/suspend`, "POST");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suspend failed");
    } finally {
      setBusy(false);
    }
  }

  async function unsuspendTenant() {
    if (!tenantId || !canSuspend) return;
    if (!window.confirm("Reactivate AI narrative policy for this tenant?")) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/ai/management/tenants/${tenantId}/unsuspend`, "POST");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unsuspend failed");
    } finally {
      setBusy(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>AI Management</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>AI Management</h1>
      <p className={styles.lead}>
        Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/ai/feature-status${tenantQuery(tenantId)}`}>Feature Status</Link> ·{" "}
        <Link href={`/ai/providers${tenantQuery(tenantId)}`}>Providers</Link> ·{" "}
        <Link href={`/ai/tenant-access${tenantQuery(tenantId)}`}>Tenant Access</Link>
      </p>
      <p className={styles.muted}>
        Flags default off platform-wide. Do not enable for Phase 4 synthetic tenants without
        product-owner authorization.
      </p>

      {!canRead ? (
        <p className={styles.error}>
          Missing permission: platform.ai.narrative.manage or platform.ai.usage.view
        </p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {data ? (
        <>
          <div className={styles.panel}>
            <h2>Status</h2>
            <dl className={styles.dl}>
              <dt>Suspended</dt>
              <dd>{data.suspended ? "Yes" : "No"}</dd>
              <dt>AI_NARRATIVE entitlement</dt>
              <dd>{data.entitlement.aiNarrativeModulePresent ? "Present" : "Missing"}</dd>
              <dt>Sensitive data</dt>
              <dd>{data.sensitiveDataEnabled ? "Enabled" : "Off"}</dd>
              <dt>Master flag</dt>
              <dd>{data.flags["ai.narrative.enabled"] ? "On" : "Off"}</dd>
              <dt>RMS flag</dt>
              <dd>{data.flags["ai.narrative.rms.enabled"] ? "On" : "Off"}</dd>
            </dl>
            {canSuspend && !data.suspended ? (
              <button
                type="button"
                className={styles.button}
                disabled={busy}
                onClick={() => void suspendTenant()}
              >
                Suspend tenant AI
              </button>
            ) : null}
            {canSuspend && data.suspended ? (
              <button
                type="button"
                className={styles.button}
                disabled={busy}
                onClick={() => void unsuspendTenant()}
              >
                Unsuspend tenant AI
              </button>
            ) : null}
          </div>

          <div className={styles.panel}>
            <h2>Policy quotas</h2>
            {data.policy ? (
              <dl className={styles.dl}>
                <dt>Status</dt>
                <dd>{data.policy.status}</dd>
                <dt>Product</dt>
                <dd>{data.policy.product}</dd>
                <dt>Monthly</dt>
                <dd>{data.policy.monthlyRequestQuota}</dd>
                <dt>Daily / user</dt>
                <dd>{data.policy.dailyUserQuota}</dd>
                <dt>Per record</dt>
                <dd>{data.policy.perRecordLimit}</dd>
              </dl>
            ) : (
              <p className={styles.muted}>No policy configured.</p>
            )}
          </div>

          <div className={styles.panel}>
            <h2>Usage</h2>
            <dl className={styles.dl}>
              <dt>This month</dt>
              <dd>{data.usage.monthRequestCount}</dd>
              <dt>All time requests</dt>
              <dd>{data.usage.totalRequestCount}</dd>
            </dl>
          </div>

          <div className={styles.panel}>
            <h2>Providers</h2>
            {data.providers.length === 0 ? (
              <p className={styles.muted}>No provider configurations.</p>
            ) : (
              <ul>
                {data.providers.map((p) => (
                  <li key={p.id}>
                    <span className={styles.mono}>{p.providerKey}</span> · {p.status} ·{" "}
                    {p.credentialsLabel}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

export default function AiManagementOverviewPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <p className={styles.muted}>Loading…</p>
        </main>
      }
    >
      <OverviewInner />
    </Suspense>
  );
}
