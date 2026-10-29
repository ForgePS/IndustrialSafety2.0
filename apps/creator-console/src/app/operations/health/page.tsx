"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ForgePageHeader, ForgeStatusCard, LoadingState } from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { fetchHealth, fetchReady, type HealthPayload, type ReadyPayload } from "@/lib/api";
import styles from "../../page.module.css";

function OperationsHealthInner() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [ready, setReady] = useState<ReadyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthResult, readyResult] = await Promise.allSettled([fetchHealth(), fetchReady()]);
      if (healthResult.status === "fulfilled") {
        setHealth(healthResult.value);
      } else {
        setHealth(null);
        setError(
          healthResult.reason instanceof Error
            ? healthResult.reason.message
            : "We couldn't check platform health.",
        );
      }
      setReady(readyResult.status === "fulfilled" ? readyResult.value : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apiOk =
    health != null && ["ok", "healthy", "up"].includes(String(health.status).toLowerCase());
  const dbOk = ready?.checks.database === true;

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="System Health"
        subtitle="Business-friendly status for Forge services. Technical probes stay optional."
      />

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <LoadingState label="Checking health…" /> : null}

      <div className={styles.statGrid}>
        <ForgeStatusCard
          title="Forge Platform"
          status={apiOk ? "Healthy" : health ? "Needs attention" : "Unavailable"}
        />
        <ForgeStatusCard
          title="Authentication"
          status={apiOk ? "Healthy" : "Unavailable"}
          detail="Sign-in service"
        />
        <ForgeStatusCard
          title="Database"
          status={dbOk ? "Healthy" : ready ? "Needs attention" : "Unavailable"}
        />
        <ForgeStatusCard
          title="Background processing"
          status="Unavailable"
          detail="No queue probe exposed yet"
        />
        <ForgeStatusCard title="Email" status="Unavailable" detail="Open Email for setup status" />
        <ForgeStatusCard title="Alerts" status="Unavailable" detail="Alert feed not connected" />
      </div>

      <p className={styles.linkRow}>
        <button
          type="button"
          className="forge-btn forge-btn--outline"
          onClick={() => setShowTechnical((v) => !v)}
        >
          {showTechnical ? "Hide technical details" : "View technical details"}
        </button>
        <button
          type="button"
          className="forge-btn forge-btn--secondary"
          onClick={() => void load()}
        >
          Refresh
        </button>
        <Link href="/email/">Email service</Link>
      </p>

      {showTechnical ? (
        <>
          <div className={styles.panel}>
            <h2>Technical — health probe</h2>
            {health ? (
              <pre className={styles.pre}>{JSON.stringify(health, null, 2)}</pre>
            ) : (
              <p className={styles.muted}>Unavailable</p>
            )}
          </div>
          <div className={styles.panel}>
            <h2>Technical — readiness probe</h2>
            {ready ? (
              <pre className={styles.pre}>{JSON.stringify(ready, null, 2)}</pre>
            ) : (
              <p className={styles.muted}>Unavailable</p>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

export default function OperationsHealthPage() {
  return (
    <PlatformPageGate title="System Health" permission="platform.tenant.read">
      <OperationsHealthInner />
    </PlatformPageGate>
  );
}
