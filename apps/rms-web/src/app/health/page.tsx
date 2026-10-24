"use client";

import { useEffect, useState } from "react";
import { apiFetchRaw } from "@forge/web-kit";
import { FxPanel, FxStatusBadge } from "@forge/fx-ui";
import { useRmsFxUtilitiesModule } from "@/fx/modules/use-utilities-module";
import styles from "../page.module.css";

type HealthPayload = {
  status: string;
  service: string;
  environment: string;
  version: string;
  timestamp: string;
};

function healthTone(status: string): "success" | "warning" | "danger" | "neutral" {
  const normalized = status.toLowerCase();
  if (normalized === "ok" || normalized === "healthy" || normalized === "up") return "success";
  if (normalized === "degraded") return "warning";
  if (normalized === "down" || normalized === "error" || normalized === "unhealthy")
    return "danger";
  return "neutral";
}

export default function HealthPage() {
  const { health: healthMode, loading: moduleFlagLoading } = useRmsFxUtilitiesModule();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetchRaw("/health");
        if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
        setHealth((await res.json()) as HealthPayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Health check failed");
      }
    })();
  }, []);

  const useFx = !moduleFlagLoading && healthMode === "fx";

  return (
    <section className={styles.page} data-testid={useFx ? "rms-fx-health" : "rms-legacy-health"}>
      <h1>Platform health</h1>
      {error ? <p className={styles.error}>{error}</p> : null}
      {useFx ? (
        health ? (
          <FxPanel title="API health">
            <p>
              Status:{" "}
              <FxStatusBadge tone={healthTone(health.status)}>{health.status}</FxStatusBadge>
            </p>
            <p>Service: {health.service}</p>
            <p>Environment: {health.environment}</p>
            <p>Version: {health.version}</p>
            <p className={styles.muted}>{health.timestamp}</p>
          </FxPanel>
        ) : (
          <p className={styles.muted}>Checking API health…</p>
        )
      ) : health ? (
        <div className={styles.panel}>
          <p>
            Status: <strong>{health.status}</strong>
          </p>
          <p>Service: {health.service}</p>
          <p>Environment: {health.environment}</p>
          <p>Version: {health.version}</p>
          <p className={styles.muted}>{health.timestamp}</p>
        </div>
      ) : (
        <p className={styles.muted}>Checking API health…</p>
      )}
    </section>
  );
}
