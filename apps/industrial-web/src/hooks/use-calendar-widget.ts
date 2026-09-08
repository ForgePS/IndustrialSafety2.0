"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet } from "@forge/web-kit";
import { startOfDay } from "@/lib/calendar/dates";
import type { CalendarEvent, CalendarWidgetView } from "@/lib/calendar/types";
import { rangeForCalendarWidgetView } from "@/lib/calendar/widget-range";

type Status = "loading" | "loaded" | "empty" | "error";

export type CalendarWidgetData = {
  status: Status;
  error: string | null;
  events: CalendarEvent[];
  todayCount: number;
  refresh: () => Promise<void>;
};

/**
 * Loads calendar events for a workspace widget view via the existing events API.
 */
export function useCalendarWidgetData(view: CalendarWidgetView, enabled: boolean): CalendarWidgetData {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [todayCount, setTodayCount] = useState(0);

  const range = useMemo(() => rangeForCalendarWidgetView(view, new Date()), [view]);
  const todayRange = useMemo(() => rangeForCalendarWidgetView("today", new Date()), []);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setEvents([]);
      setStatus("empty");
      setError(null);
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const qs = new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      });
      const todayQs = new URLSearchParams({
        from: todayRange.from.toISOString(),
        to: todayRange.to.toISOString(),
      });

      const [primary, todayRes] = await Promise.all([
        apiGet<{ items: CalendarEvent[] }>(`/api/v1/industrial/calendar/events?${qs}`),
        view === "today"
          ? Promise.resolve(null)
          : apiGet<{ items: CalendarEvent[] }>(`/api/v1/industrial/calendar/events?${todayQs}`).catch(
              () => ({ items: [] as CalendarEvent[] }),
            ),
      ]);

      const items = primary.items ?? [];
      setEvents(items);
      const todayItems = todayRes?.items ?? (view === "today" ? items : []);
      setTodayCount(todayItems.length);
      setStatus(items.length === 0 ? "empty" : "loaded");
    } catch (err) {
      setEvents([]);
      setTodayCount(0);
      setError(err instanceof ApiError ? err.message : "Unable to load schedule.");
      setStatus("error");
    }
  }, [enabled, range.from, range.to, todayRange.from, todayRange.to, view]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, error, events, todayCount, refresh };
}

/** Compact card status only — fetches today's events. */
export function useCalendarCompactStatus(enabled: boolean): {
  status: Status;
  label: string;
  refresh: () => Promise<void>;
} {
  const [status, setStatus] = useState<Status>("loading");
  const [label, setLabel] = useState("Loading…");

  const refresh = useCallback(async () => {
    if (!enabled) {
      setStatus("empty");
      setLabel("Ready");
      return;
    }
    setStatus("loading");
    try {
      const day = startOfDay(new Date());
      const { from, to } = rangeForCalendarWidgetView("today", day);
      const data = await apiGet<{ items: CalendarEvent[] }>(
        `/api/v1/industrial/calendar/events?${new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
        })}`,
      );
      const count = data.items?.length ?? 0;
      setStatus(count === 0 ? "empty" : "loaded");
      setLabel(count === 0 ? "No events today" : `${count} event${count === 1 ? "" : "s"} today`);
    } catch {
      setStatus("error");
      setLabel("Unable to load");
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, label, refresh };
}
