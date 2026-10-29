"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { PlatformPageGate } from "@/components/platform-page-gate";
import styles from "../page.module.css";

type AnalyticsOverview = {
  generatedAt: string;
  tenants: { total: number; active: number; trial: number; suspended: number };
  users: { totalMemberships: number; activeMemberships: number; suspendedMemberships: number };
  products: { catalogActive: number; tenantAssignmentsActive: number };
  modules: { adoption: Array<{ moduleCode: string; moduleName: string; tenantCount: number }> };
  onboarding: { inProgress: number; completed: number; failed: number; total: number };
  billing: { activeLike: number; trial: number; byStatus: Record<string, number> };
  recentActivity: Array<{
    occurredAt: string;
    action: string;
    resourceType: string;
    result: string;
    tenantKey: string | null;
  }>;
};

function AnalyticsInner() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<AnalyticsOverview>("/api/v1/platform/analytics/overview");
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.page}>
      <div className="forge-page-header">
        <div>
          <h1 className="forge-page-header__title">Platform analytics</h1>
          <p className="forge-page-header__subtitle">
            Creator-only SaaS aggregates. Product/industrial analytics are separate.
          </p>
        </div>
        <div className="forge-page-actions">
          <button
            type="button"
            className="forge-btn forge-btn--secondary"
            onClick={() => void load()}
          >
            Refresh
          </button>
          <Link className="forge-btn forge-btn--outline" href="/">
            Overview
          </Link>
        </div>
      </div>

      {loading ? <p className={styles.muted}>Loading analytics…</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {overview ? (
        <>
          <p className={styles.muted}>
            Generated {new Date(overview.generatedAt).toLocaleString()}
          </p>
          <div className="forge-metric-grid">
            <article className="forge-metric-card">
              <p className="forge-metric-card__label">Tenants</p>
              <p className="forge-metric-card__value">{overview.tenants.total}</p>
              <p className="forge-metric-card__hint">
                A {overview.tenants.active} / T {overview.tenants.trial} / S{" "}
                {overview.tenants.suspended}
              </p>
            </article>
            <article className="forge-metric-card">
              <p className="forge-metric-card__label">Active memberships</p>
              <p className="forge-metric-card__value">{overview.users.activeMemberships}</p>
            </article>
            <article className="forge-metric-card">
              <p className="forge-metric-card__label">Catalog products</p>
              <p className="forge-metric-card__value">{overview.products.catalogActive}</p>
            </article>
            <article className="forge-metric-card">
              <p className="forge-metric-card__label">Onboarding in progress</p>
              <p className="forge-metric-card__value">{overview.onboarding.inProgress}</p>
            </article>
            <article className="forge-metric-card">
              <p className="forge-metric-card__label">Active-like subscriptions</p>
              <p className="forge-metric-card__value">{overview.billing.activeLike}</p>
            </article>
          </div>

          <div className={styles.panel}>
            <h2>Module adoption</h2>
            {overview.modules.adoption.length === 0 ? (
              <p className={styles.muted}>No adoption data.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>Tenants</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.modules.adoption.map((row) => (
                    <tr key={row.moduleCode}>
                      <td>
                        {row.moduleName} <span className={styles.mono}>({row.moduleCode})</span>
                      </td>
                      <td>{row.tenantCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className={styles.panel}>
            <h2>Billing by status</h2>
            <ul>
              {Object.entries(overview.billing.byStatus).map(([status, n]) => (
                <li key={status}>
                  {status}: {n}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.panel}>
            <h2>Recent activity</h2>
            {overview.recentActivity.length === 0 ? (
              <p className={styles.muted}>No recent events.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Tenant</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recentActivity.map((e, i) => (
                    <tr key={`${e.occurredAt}-${i}`}>
                      <td className={styles.mono}>{e.occurredAt}</td>
                      <td>{e.action}</td>
                      <td className={styles.mono}>{e.tenantKey ?? "—"}</td>
                      <td>{e.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

export default function AnalyticsPage() {
  return (
    <PlatformPageGate title="Analytics" permission="platform.analytics.read">
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <AnalyticsInner />
      </Suspense>
    </PlatformPageGate>
  );
}
