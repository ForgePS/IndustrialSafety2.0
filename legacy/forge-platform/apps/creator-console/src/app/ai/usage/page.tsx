"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet } from "@/lib/api";
import styles from "../../page.module.css";

type UsageRow = {
  id: string;
  product: string;
  outcome: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: string | null;
  latencyMs: number | null;
  occurredAt: string;
};

function Inner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead =
    hasPermission("ai.narrative.view_usage") || hasPermission("platform.ai.usage.view");
  const [items, setItems] = useState<UsageRow[]>([]);
  const [summary, setSummary] = useState<{
    monthRequestCount: number;
    monthInputTokens: number;
    monthOutputTokens: number;
  } | null>(null);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<{
        items: UsageRow[];
        summary: {
          monthRequestCount: number;
          monthInputTokens: number;
          monthOutputTokens: number;
        };
      }>("/api/v1/ai/usage", { query: { tenantId, limit: "100" } });
      setItems(result.items);
      setSummary(result.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage");
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
        <h1>AI Usage</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>AI Usage</h1>
      <p className={styles.lead}>
        Tenant-isolated usage for <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/ai${tenantQuery(tenantId)}`}>Overview</Link>
      </p>
      {!canRead ? <p className={styles.error}>Missing usage view permission</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}
      {summary ? (
        <div className={styles.panel}>
          <h2>This month</h2>
          <dl className={styles.dl}>
            <dt>Requests</dt>
            <dd>{summary.monthRequestCount}</dd>
            <dt>Input tokens</dt>
            <dd>{summary.monthInputTokens}</dd>
            <dt>Output tokens</dt>
            <dd>{summary.monthOutputTokens}</dd>
          </dl>
        </div>
      ) : null}
      <div className={styles.panel}>
        <h2>Recent events</h2>
        {items.length === 0 && !loading ? (
          <p className={styles.muted}>No usage recorded.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                <th>Outcome</th>
                <th>Tokens</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.occurredAt).toLocaleString()}</td>
                  <td>{row.product}</td>
                  <td>{row.outcome}</td>
                  <td>
                    {row.inputTokens}/{row.outputTokens}
                  </td>
                  <td>{row.latencyMs ?? "—"} ms</td>
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
