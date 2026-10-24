"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@forge/web-kit";
import { REVIEW_STATUSES } from "@/lib/constants";
import { listIncidents, type IncidentSummary } from "@/lib/rms-api";
import {
  DashboardEmptyState,
  DashboardErrorState,
  DashboardLoadingState,
} from "../DashboardStates";
import type { DashboardWidgetComponentProps } from "../types";

export function ReviewQueueWidget({ onRefreshRequest }: DashboardWidgetComponentProps) {
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
      const result = await listIncidents(me.tenantId, { page: "1", pageSize: "100" });
      setItems(
        result.data.filter((row) =>
          REVIEW_STATUSES.includes(row.status as (typeof REVIEW_STATUSES)[number]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review queue");
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
        description="Sign in to view the review queue."
      />
    );
  }
  if (loading) return <DashboardLoadingState label="Loading review queue" />;
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
        title="Queue empty"
        description="No incidents are currently in review statuses."
      />
    );
  }

  return (
    <ul className="rms-fx-widget__list">
      {items.slice(0, 8).map((incident) => (
        <li key={incident.id}>
          <Link href={`/incidents/${incident.id}/?section=REVIEW`}>{incident.incidentNumber}</Link>
          <span> — {incident.status}</span>
        </li>
      ))}
    </ul>
  );
}
