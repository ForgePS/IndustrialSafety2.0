"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchHealth, fetchReady, type HealthPayload, type ReadyPayload } from "@/lib/api";
import styles from "../page.module.css";

export default function HealthPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [ready, setReady] = useState<ReadyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            : "Health check failed",
        );
      }
      if (readyResult.status === "fulfilled") {
        setReady(readyResult.value);
      } else {
        setReady(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const consoleHealth = {
    status: "healthy",
    service: "creator-console",
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "local",
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
    timestamp: new Date().toISOString(),
  };

  return (
    <section className={styles.page}>
      <h1>Platform health</h1>
      <p className={styles.lead}>
        Live checks against platform-api <code>/health</code> and <code>/ready</code>.
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading health…</p> : null}

      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>API status</p>
          <p className={styles.statValue}>{health?.status ?? "—"}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Database</p>
          <p className={styles.statValue}>
            {ready?.checks.database ? "ready" : ready ? "not ready" : "—"}
          </p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Queue</p>
          <p className={styles.statValue}>Not available</p>
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Platform API</h2>
        {health ? (
          <pre className={styles.pre}>{JSON.stringify(health, null, 2)}</pre>
        ) : (
          <p className={styles.muted}>Platform API health unavailable.</p>
        )}
      </div>

      <div className={styles.panel}>
        <h2>Readiness</h2>
        {ready ? (
          <pre className={styles.pre}>{JSON.stringify(ready, null, 2)}</pre>
        ) : (
          <p className={styles.muted}>Readiness probe unavailable or database not ready.</p>
        )}
      </div>

      <div className={styles.panel}>
        <h2>Creator console</h2>
        <pre className={styles.pre}>{JSON.stringify(consoleHealth, null, 2)}</pre>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.buttonSecondary} onClick={() => void load()}>
          Refresh
        </button>
        <Link href="/">Back to dashboard</Link>
      </div>
    </section>
  );
}
