"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../../page.module.css";

type AiOverview = {
  flags: Record<string, boolean>;
  sensitiveDataEnabled: boolean;
};

const FLAG_LABELS: Array<{ key: string; label: string; danger?: boolean }> = [
  { key: "ai.narrative.enabled", label: "Master" },
  { key: "ai.narrative.rms.enabled", label: "RMS" },
  { key: "ai.narrative.industrial.enabled", label: "Industrial", danger: true },
  { key: "ai.narrative.academy.enabled", label: "Academy", danger: true },
  { key: "ai.narrative.rewrite.enabled", label: "Rewrite" },
  { key: "ai.narrative.quality_check.enabled", label: "Quality check" },
  { key: "ai.narrative.voice_input.enabled", label: "Voice input", danger: true },
  { key: "ai.narrative.sensitive_data.enabled", label: "Sensitive data", danger: true },
  { key: "ai.narrative.analytics.enabled", label: "Analytics" },
];

function Inner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead =
    hasPermission("platform.ai.narrative.manage") || hasPermission("platform.ai.usage.view");
  const canWrite =
    hasPermission("platform.ai.narrative.manage") || hasPermission("platform.feature.manage");
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const overview = await apiGet<AiOverview>("/api/v1/ai/management/overview", {
        query: { tenantId },
      });
      setFlags(overview.flags);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feature status");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setFlag(key: string, next: boolean, danger?: boolean) {
    if (!tenantId || !canWrite) return;
    if (
      danger &&
      next &&
      !window.confirm(
        `Enable ${key}? Industrial/Academy/voice/sensitive flags require product-owner authorization.`,
      )
    ) {
      return;
    }
    setBusyKey(key);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/features/${key}`, "PUT", {
        value: next,
        reason: next ? "creator_ai_feature_enable" : "creator_ai_feature_disable",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update feature flag");
    } finally {
      setBusyKey(null);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>AI Feature Status</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>AI Feature Status</h1>
      <p className={styles.lead}>
        Effective tenant overrides for <span className={styles.mono}>{tenantId}</span>. Defaults
        remain false elsewhere. Do not enable AI on Phase 4 synthetic CAD tenants.{" "}
        <Link href={`/ai${tenantQuery(tenantId)}`}>Overview</Link>
      </p>
      {!canRead ? <p className={styles.error}>Missing platform AI permission</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}
      <div className={styles.panel}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Flag</th>
              <th>Effective</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {FLAG_LABELS.map((row) => {
              const on = Boolean(flags[row.key]);
              return (
                <tr key={row.key}>
                  <td>
                    {row.label}
                    <div className={styles.mono}>{row.key}</div>
                  </td>
                  <td>{on ? "TRUE" : "false"}</td>
                  <td>
                    {canWrite ? (
                      <button
                        type="button"
                        className={styles.buttonSecondary}
                        disabled={busyKey === row.key}
                        onClick={() => void setFlag(row.key, !on, row.danger)}
                      >
                        {on ? "Disable" : "Enable"}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
