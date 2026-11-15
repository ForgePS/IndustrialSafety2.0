"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { fetchHealth, fetchReady, type HealthPayload, type ReadyPayload } from "@/lib/api";
import styles from "../page.module.css";

function SystemInner() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [ready, setReady] = useState<ReadyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthResult, readyResult] = await Promise.allSettled([fetchHealth(), fetchReady()]);
      setHealth(healthResult.status === "fulfilled" ? healthResult.value : null);
      setReady(readyResult.status === "fulfilled" ? readyResult.value : null);
      if (healthResult.status === "rejected" && readyResult.status === "rejected") {
        setError("Platform health and readiness checks failed.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.page}>
      <h1>System</h1>
      <p className={styles.lead}>
        Platform health and operational shortcuts. API authorization remains authoritative.
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      <div className={styles.panel}>
        <h2>Health</h2>
        {health ? (
          <dl className={styles.dl}>
            <dt>Status</dt>
            <dd>{health.status}</dd>
            <dt>Service</dt>
            <dd>{health.service}</dd>
            <dt>Environment</dt>
            <dd>{health.environment}</dd>
            <dt>Version</dt>
            <dd className={styles.mono}>{health.version}</dd>
          </dl>
        ) : (
          <p className={styles.muted}>Health unavailable.</p>
        )}
      </div>

      <div className={styles.panel}>
        <h2>Readiness</h2>
        {ready ? (
          <pre className={styles.mono} style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(ready, null, 2)}
          </pre>
        ) : (
          <p className={styles.muted}>Readiness unavailable.</p>
        )}
      </div>

      <nav className={styles.linkRow}>
        <Link href="/health">Health detail</Link>
        <Link href="/deployment">Deployment</Link>
        <Link href="/migrations">Migrations</Link>
        <Link href="/audit">Audit</Link>
      </nav>
    </section>
  );
}

export default function SystemPage() {
  return (
    <PlatformPageGate title="System" permission="platform.tenant.read">
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <SystemInner />
      </Suspense>
    </PlatformPageGate>
  );
}
