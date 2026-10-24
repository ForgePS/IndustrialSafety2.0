"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchHealth, fetchReady, type HealthPayload, type ReadyPayload } from "@/lib/api";
import styles from "../page.module.css";

export default function DeploymentPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [ready, setReady] = useState<ReadyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "local";
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "(not configured)";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthResult, readyResult] = await Promise.allSettled([fetchHealth(), fetchReady()]);
      if (healthResult.status === "fulfilled") setHealth(healthResult.value);
      if (readyResult.status === "fulfilled") setReady(readyResult.value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deployment info");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deployment = {
    console: {
      environment: appEnv,
      version: appVersion,
      apiUrl,
      buildTimestamp: health?.timestamp ?? ready?.timestamp ?? null,
    },
    platformApi: health
      ? {
          environment: health.environment,
          version: health.version,
          lastHealthCheck: health.timestamp,
        }
      : null,
    readiness: ready,
  };

  return (
    <section className={styles.page}>
      <h1>Deployment information</h1>
      <p className={styles.lead}>
        Release, environment, and last-known deployment timestamps from live API probes.
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      <div className={styles.panel}>
        <h2>Environment</h2>
        <dl className={styles.dl}>
          <dt>Console environment</dt>
          <dd>{appEnv}</dd>
          <dt>Console version</dt>
          <dd>{appVersion}</dd>
          <dt>API URL</dt>
          <dd className={styles.mono}>{apiUrl}</dd>
          <dt>API environment</dt>
          <dd>{health?.environment ?? "—"}</dd>
          <dt>API version</dt>
          <dd>{health?.version ?? "—"}</dd>
          <dt>Last health check</dt>
          <dd className={styles.mono}>{health?.timestamp ?? "—"}</dd>
          <dt>Last readiness check</dt>
          <dd className={styles.mono}>{ready?.timestamp ?? "—"}</dd>
        </dl>
      </div>

      <div className={styles.panel}>
        <h2>Raw deployment payload</h2>
        <pre className={styles.pre}>{JSON.stringify(deployment, null, 2)}</pre>
      </div>

      <p className={styles.linkRow}>
        <Link href="/health">Platform health</Link>
        <Link href="/">Dashboard</Link>
      </p>
    </section>
  );
}
