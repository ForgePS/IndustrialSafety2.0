"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@forge/web-kit";
import { getCadOperationsSummary, type CadOperationsSummary } from "@/lib/rms-api";
import {
  DashboardEmptyState,
  DashboardErrorState,
  DashboardLoadingState,
} from "../DashboardStates";
import type { DashboardWidgetComponentProps } from "../types";

export function CadStatusWidget({ onRefreshRequest }: DashboardWidgetComponentProps) {
  const { me } = useAuth();
  const [summary, setSummary] = useState<CadOperationsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!me?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      setSummary(await getCadOperationsSummary(me.tenantId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load CAD status");
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
      <DashboardEmptyState title="Sign in required" description="Sign in to view CAD status." />
    );
  }
  if (loading) return <DashboardLoadingState label="Loading CAD status" />;
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
  if (!summary) {
    return (
      <DashboardEmptyState
        title="No CAD summary"
        description="CAD operations summary was not available."
      />
    );
  }

  return (
    <div className="rms-fx-widget__meta">
      <div className="rms-fx-widget__meta-row">
        <span>Received</span>
        <span>{summary.messages.received}</span>
      </div>
      <div className="rms-fx-widget__meta-row">
        <span>Applied</span>
        <span>{summary.messages.applied}</span>
      </div>
      <div className="rms-fx-widget__meta-row">
        <span>Failed</span>
        <span>{summary.messages.failed}</span>
      </div>
      <div className="rms-fx-widget__meta-row">
        <span>Active links</span>
        <span>{summary.activeLinks}</span>
      </div>
    </div>
  );
}
