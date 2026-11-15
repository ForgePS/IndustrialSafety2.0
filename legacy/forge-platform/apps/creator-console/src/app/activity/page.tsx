"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ActivityTimeline, EmptyState, ErrorState, ForgePageHeader, LoadingState } from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { apiGet } from "@/lib/api";
import { humanActivityTitle } from "@/lib/presentation";
import styles from "../page.module.css";

type AnalyticsOverview = {
  recentActivity: Array<{
    occurredAt: string;
    action: string;
    resourceType: string;
    result: string;
    tenantKey: string | null;
  }>;
};

function ActivityInner() {
  const [items, setItems] = useState<
    Array<{ id: string; title: string; detail?: string; at?: string; tone?: "danger" | "neutral" }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const overview = await apiGet<AnalyticsOverview>("/api/v1/platform/analytics/overview");
      setItems(
        overview.recentActivity.map((event, index) => ({
          id: `${event.occurredAt}-${index}`,
          title: humanActivityTitle(event.action, event.resourceType, event.result),
          ...(event.tenantKey ? { detail: `Customer · ${event.tenantKey}` } : {}),
          at: new Date(event.occurredAt).toLocaleString(),
          tone: event.result.toLowerCase().includes("fail")
            ? ("danger" as const)
            : ("neutral" as const),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't load activity.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.page}>
      <ForgePageHeader title="Activity" subtitle="Recent platform activity in plain language." />
      {error ? (
        <ErrorState
          title="Activity unavailable"
          description={error}
          action={
            <button type="button" className="forge-btn" onClick={() => void load()}>
              Try again
            </button>
          }
        />
      ) : null}
      {loading ? <LoadingState label="Loading activity…" /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No recent activity"
          description="Actions across customers will appear here."
        />
      ) : null}
      {!loading && items.length > 0 ? <ActivityTimeline items={items} /> : null}
      <p className={styles.linkRow}>
        <Link href="/audit/">Open detailed audit log</Link>
      </p>
    </section>
  );
}

export default function ActivityPage() {
  return (
    <PlatformPageGate title="Activity" anyOf={["platform.analytics.read", "platform.audit.read"]}>
      <ActivityInner />
    </PlatformPageGate>
  );
}
