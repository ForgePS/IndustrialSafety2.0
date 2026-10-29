"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../../page.module.css";

type AiOverview = {
  entitlement: { aiNarrativeModulePresent: boolean; moduleCode: string };
  flags: Record<string, boolean>;
  policy: { status: string; product: string } | null;
  suspended: boolean;
  sensitiveDataEnabled: boolean;
};

function Inner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead =
    hasPermission("platform.ai.narrative.manage") || hasPermission("platform.ai.usage.view");
  const canSuspend =
    hasPermission("platform.ai.narrative.manage") || hasPermission("platform.ai.policy.manage");

  const [data, setData] = useState<AiOverview | null>(null);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<AiOverview>("/api/v1/ai/management/overview", { query: { tenantId } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tenant access");
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
        <h1>AI Tenant Access</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>AI Tenant Access</h1>
      <p className={styles.lead}>
        Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/ai${tenantQuery(tenantId)}`}>Overview</Link>
      </p>
      {!canRead ? <p className={styles.error}>Missing platform AI management permission</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}
      {data ? (
        <div className={styles.panel}>
          <dl className={styles.dl}>
            <dt>Module entitlement</dt>
            <dd>
              {data.entitlement.aiNarrativeModulePresent
                ? data.entitlement.moduleCode
                : "Not entitled"}
            </dd>
            <dt>Policy status</dt>
            <dd>
              {data.policy?.status ?? "None"} ({data.policy?.product ?? "—"})
            </dd>
            <dt>Suspended</dt>
            <dd>{data.suspended ? "Yes" : "No"}</dd>
            <dt>Sensitive data path</dt>
            <dd>{data.sensitiveDataEnabled ? "Enabled" : "Off (default)"}</dd>
            <dt>Master / RMS flags</dt>
            <dd>
              {data.flags["ai.narrative.enabled"] ? "on" : "off"} /{" "}
              {data.flags["ai.narrative.rms.enabled"] ? "on" : "off"}
            </dd>
          </dl>
          {canSuspend && !data.suspended ? (
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                void (async () => {
                  if (!window.confirm("Suspend AI for this tenant?")) return;
                  await apiSend(`/api/v1/ai/management/tenants/${tenantId}/suspend`, "POST");
                  await load();
                })();
              }}
            >
              Suspend access
            </button>
          ) : null}
          {canSuspend && data.suspended ? (
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                void (async () => {
                  if (!window.confirm("Unsuspend AI for this tenant?")) return;
                  await apiSend(`/api/v1/ai/management/tenants/${tenantId}/unsuspend`, "POST");
                  await load();
                })();
              }}
            >
              Unsuspend access
            </button>
          ) : null}
        </div>
      ) : null}
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
