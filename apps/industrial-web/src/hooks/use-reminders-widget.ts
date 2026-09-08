"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import {
  isReminderPending,
  isRemindersWidgetView,
  type RemindersWidgetView,
  type WorkspaceReminder,
} from "@/lib/reminders/types";
import {
  filterRemindersForWidgetView,
  snoozeRemindAt,
  snoozeRemindAtTomorrowMorning,
  summarizeReminders,
} from "@/lib/reminders/widget-filter";

type Status = "loading" | "loaded" | "empty" | "error";

export type RemindersWidgetSummary = {
  today: number;
  upcoming: number;
  overdue: number;
  sent: number;
  active: number;
};

export type RemindersWidgetData = {
  status: Status;
  error: string | null;
  reminders: WorkspaceReminder[];
  summary: RemindersWidgetSummary;
  refresh: () => Promise<void>;
  snooze: (reminder: WorkspaceReminder, mode?: "1h" | "tomorrow") => Promise<void>;
  dismiss: (reminder: WorkspaceReminder) => Promise<void>;
  busyId: string | null;
};

function resolveView(view: string | undefined): RemindersWidgetView {
  return isRemindersWidgetView(view) ? view : "upcoming";
}

/**
 * Loads reminders for a workspace widget via the existing reminders API.
 * Views are applied client-side (API only filters by status).
 */
export function useRemindersWidgetData(
  viewProp: string | undefined,
  enabled: boolean,
): RemindersWidgetData {
  const view = resolveView(viewProp);
  const [allItems, setAllItems] = useState<WorkspaceReminder[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setAllItems([]);
      setStatus("empty");
      setError(null);
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const data = await apiGet<{ items: WorkspaceReminder[] }>("/api/v1/industrial/reminders");
      const items = data.items ?? [];
      setAllItems(items);
      const filtered = filterRemindersForWidgetView(items, view);
      setStatus(filtered.length === 0 ? "empty" : "loaded");
    } catch (err) {
      setAllItems([]);
      setError(err instanceof ApiError ? err.message : "Unable to load reminders.");
      setStatus("error");
    }
  }, [enabled, view]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reminders = useMemo(
    () => filterRemindersForWidgetView(allItems, view),
    [allItems, view],
  );
  const summary = useMemo(() => summarizeReminders(allItems), [allItems]);

  const snooze = useCallback(
    async (reminder: WorkspaceReminder, mode: "1h" | "tomorrow" = "1h") => {
      if (!isReminderPending(reminder.status)) return;
      setBusyId(reminder.id);
      setError(null);
      try {
        const next =
          mode === "tomorrow" ? snoozeRemindAtTomorrowMorning(new Date()) : snoozeRemindAt(new Date(), 1);
        await apiSend(`/api/v1/industrial/reminders/${encodeURIComponent(reminder.id)}`, "PATCH", {
          remindAt: next.toISOString(),
        });
        await refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Unable to snooze reminder.");
        throw err;
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const dismiss = useCallback(
    async (reminder: WorkspaceReminder) => {
      if (!isReminderPending(reminder.status)) return;
      setBusyId(reminder.id);
      setError(null);
      try {
        await apiSend(
          `/api/v1/industrial/reminders/${encodeURIComponent(reminder.id)}/cancel`,
          "POST",
          {},
        );
        await refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Unable to dismiss reminder.");
        throw err;
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  return {
    status: status === "loading" || status === "error" ? status : reminders.length === 0 ? "empty" : "loaded",
    error,
    reminders,
    summary,
    refresh,
    snooze,
    dismiss,
    busyId,
  };
}

/** Compact card status: "3 today · 1 overdue". */
export function useRemindersCompactStatus(enabled: boolean): {
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
      const data = await apiGet<{ items: WorkspaceReminder[] }>("/api/v1/industrial/reminders");
      const summary = summarizeReminders(data.items ?? []);
      if (summary.active === 0 && summary.sent === 0) {
        setStatus("empty");
        setLabel("You're all caught up");
      } else {
        setStatus("loaded");
        if (summary.overdue > 0) {
          setLabel(`${summary.today} today · ${summary.overdue} overdue`);
        } else if (summary.today > 0) {
          setLabel(`${summary.today} today`);
        } else {
          setLabel(`${summary.upcoming} upcoming`);
        }
      }
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
