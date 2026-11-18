"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@forge/web-kit";
import type { FieldMyWorkResult } from "@/lib/my-work";

export function useMyWork() {
  const [data, setData] = useState<FieldMyWorkResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<FieldMyWorkResult>("/api/v1/industrial/my-work");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your tasks.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

export function useUnreadNotificationCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await apiGet<{ count: number }>(
          "/api/v1/industrial/my-notifications/unread-count",
        );
        if (!cancelled) setCount(Number(result.count ?? 0));
      } catch {
        if (!cancelled) setCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}
