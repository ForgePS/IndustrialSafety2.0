"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@forge/web-kit";
import { listIncidents, type IncidentSummary } from "@/lib/rms-api";
import {
  DashboardEmptyState,
  DashboardErrorState,
  DashboardLoadingState,
} from "../DashboardStates";
import type { DashboardWidgetComponentProps } from "../types";

export function RecentIncidentsWidget({ onRefreshRequest }: DashboardWidgetComponentProps) {
  const { me } = useAuth();
  const [items, setItems] = useState<IncidentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!me?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listIncidents(me.tenantId, { page: "1", pageSize: "5" });
      setItems(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load incidents");
    } finally {
      setLoading(false);
      onRefreshRequest?.();
    }
  }, [me?.tenantId, onRefreshRequest]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  if (!me) {
    return (
      <DashboardEmptyState
        title="Sign in required"
        description="Sign in to view recent incidents."
      />
    );
  }
  if (loading) return <DashboardLoadingState label="Loading incidents" />;
  if (error) {
    return (
      <DashboardErrorState
        description={error}
        action={
          <button
            type="button"
            className="fx-btn fx-btn--secondary"
            onClick={() => setTick((n) => n + 1)}
          >
            Retry
          </button>
        }
      />
    );
  }
  if (items.length === 0) {
    return (
      <DashboardEmptyState
        title="No incidents"
        description="No recent incidents were returned for this tenant."
      />
    );
  }

  return (
    <ul className="rms-fx-widget__list">
      {items.map((incident) => (
        <li key={incident.id}>
          <Link href={`/incidents/${incident.id}/`}>{incident.incidentNumber}</Link>
          <span> — {incident.status}</span>
        </li>
      ))}
    </ul>
  );
}
