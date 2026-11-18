"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@forge/web-kit";
import {
  getModuleSummaryDefaultView,
  getModuleSummaryLoader,
  type ModuleSummaryPayload,
} from "@/lib/workspace/module-summary-loaders";

type Status = "loading" | "loaded" | "empty" | "error";

export type ModuleSummaryWidgetData = {
  status: Status;
  error: string | null;
  payload: ModuleSummaryPayload | null;
  refresh: () => Promise<void>;
};

/**
 * Loads a Phase 6 summary widget via the shared module loaders.
 */
export function useModuleSummaryWidget(
  moduleKey: string,
  view: string | undefined,
  enabled: boolean,
): ModuleSummaryWidgetData {
  const [payload, setPayload] = useState<ModuleSummaryPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const loader = getModuleSummaryLoader(moduleKey);
    if (!enabled || !loader) {
      setPayload(null);
      setStatus("empty");
      setError(null);
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const resolvedView = view || getModuleSummaryDefaultView(moduleKey);
      const next = await loader(resolvedView);
      setPayload(next);
      setStatus(next.rows.length === 0 ? "empty" : "loaded");
    } catch (err) {
      setPayload(null);
      setError(err instanceof ApiError ? err.message : "Unable to load widget data.");
      setStatus("error");
    }
  }, [enabled, moduleKey, view]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, error, payload, refresh };
}

/** Compact-tile caption only (no expanded list). */
export function useModuleSummaryCaption(
  moduleKey: string,
  enabled: boolean,
): { status: Status; label: string } {
  const data = useModuleSummaryWidget(moduleKey, undefined, enabled);
  if (!enabled) return { status: "empty", label: "" };
  if (data.status === "loading") return { status: "loading", label: "Loading…" };
  if (data.status === "error") return { status: "error", label: "Unavailable" };
  return {
    status: data.status,
    label: data.payload?.caption ?? "",
  };
}
