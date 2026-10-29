"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@forge/web-kit";
import { getCadOperationsSummary } from "@/lib/rms-api";
import {
  DashboardEmptyState,
  DashboardErrorState,
  DashboardLoadingState,
} from "../DashboardStates";
import type { DashboardWidgetComponentProps } from "../types";

export function CadConflictsWidget({ onRefreshRequest }: DashboardWidgetComponentProps) {
  const { me } = useAuth();
  const [openConflicts, setOpenConflicts] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!me?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const summary = await getCadOperationsSummary(me.tenantId);
      setOpenConflicts(summary.openConflicts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load CAD conflicts");
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
      <DashboardEmptyState title="Sign in required" description="Sign in to view CAD conflicts." />
    );
  }
  if (loading) return <DashboardLoadingState label="Loading conflicts" />;
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

  return (
    <div>
      <p style={{ marginTop: 0, fontSize: 28, fontWeight: 700 }}>{openConflicts ?? 0}</p>
      <p>Open CAD conflicts requiring attention.</p>
      <Link href="/cad/conflicts/">Open conflict queue</Link>
    </div>
  );
}
