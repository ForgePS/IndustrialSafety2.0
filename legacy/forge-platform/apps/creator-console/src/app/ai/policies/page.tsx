"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../../page.module.css";

type PolicyRow = {
  id: string;
  product: string;
  status: string;
  monthlyRequestQuota: number;
  dailyUserQuota: number;
  perRecordLimit: number;
  requireAcceptedTerms: boolean;
  termsAcceptedAt: string | null;
};

function Inner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead =
    hasPermission("ai.narrative.configure") ||
    hasPermission("platform.ai.policy.manage") ||
    hasPermission("platform.ai.narrative.manage");
  const canWrite =
    hasPermission("platform.ai.policy.manage") || hasPermission("platform.ai.narrative.manage");
  const [items, setItems] = useState<PolicyRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [monthly, setMonthly] = useState("100");
  const [daily, setDaily] = useState("20");
  const [perRecord, setPerRecord] = useState("10");
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<{ items: PolicyRow[] }>("/api/v1/ai/policies", {
        query: { tenantId },
      });
      setItems(result.items);
      const first = result.items[0];
      if (first) {
        setSelectedId((current) => current || first.id);
        setStatus(first.status);
        setMonthly(String(first.monthlyRequestQuota));
        setDaily(String(first.dailyUserQuota));
        setPerRecord(String(first.perRecordLimit));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load policies");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectPolicy(id: string) {
    setSelectedId(id);
    const row = items.find((item) => item.id === id);
    if (!row) return;
    setStatus(row.status);
    setMonthly(String(row.monthlyRequestQuota));
    setDaily(String(row.dailyUserQuota));
    setPerRecord(String(row.perRecordLimit));
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canWrite || !selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(
        `/api/v1/ai/policies/${selectedId}?tenantId=${encodeURIComponent(tenantId)}`,
        "PATCH",
        {
          status,
          monthlyRequestQuota: Number(monthly),
          dailyUserQuota: Number(daily),
          perRecordLimit: Number(perRecord),
        },
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update policy");
    } finally {
      setBusy(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>AI Policies</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>AI Policies</h1>
      <p className={styles.lead}>
        Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/ai${tenantQuery(tenantId)}`}>Overview</Link>
      </p>
      {!canRead ? <p className={styles.error}>Missing policy permission</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}
      <div className={styles.panel}>
        {items.length === 0 && !loading ? (
          <p className={styles.muted}>No AI policies for this tenant.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th>Monthly</th>
                <th>Daily / user</th>
                <th>Per record</th>
                <th>Terms</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button
                      type="button"
                      className={styles.buttonSecondary}
                      onClick={() => selectPolicy(row.id)}
                    >
                      {row.product}
                    </button>
                  </td>
                  <td>{row.status}</td>
                  <td>{row.monthlyRequestQuota}</td>
                  <td>{row.dailyUserQuota}</td>
                  <td>{row.perRecordLimit}</td>
                  <td>
                    {row.requireAcceptedTerms
                      ? row.termsAcceptedAt
                        ? "Accepted"
                        : "Required"
                      : "Not required"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canWrite && selectedId ? (
        <div className={styles.panel}>
          <h2>Edit policy</h2>
          <form className={styles.form} onSubmit={(event) => void onSave(event)}>
            <div className={styles.formRow}>
              <label htmlFor="policy-status">Status</label>
              <select
                id="policy-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
                <option value="DISABLED">DISABLED</option>
              </select>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="policy-monthly">Monthly request quota</label>
              <input
                id="policy-monthly"
                type="number"
                min={0}
                value={monthly}
                onChange={(event) => setMonthly(event.target.value)}
                required
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="policy-daily">Daily / user quota</label>
              <input
                id="policy-daily"
                type="number"
                min={0}
                value={daily}
                onChange={(event) => setDaily(event.target.value)}
                required
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="policy-record">Per-record limit</label>
              <input
                id="policy-record"
                type="number"
                min={0}
                value={perRecord}
                onChange={(event) => setPerRecord(event.target.value)}
                required
              />
            </div>
            <button type="submit" className={styles.button} disabled={busy}>
              Save policy
            </button>
          </form>
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
