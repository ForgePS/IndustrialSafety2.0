"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import {
  isTasksWidgetView,
  nextTaskAction,
  tasksApiViewParam,
  type TasksWidgetView,
  type WorkspaceTask,
} from "@/lib/tasks/types";
import { filterTasksForWidgetView, summarizeTasks } from "@/lib/tasks/widget-filter";

type Status = "loading" | "loaded" | "empty" | "error";

export type TasksWidgetSummary = {
  open: number;
  dueToday: number;
  dueThisWeek: number;
  overdue: number;
};

export type TasksWidgetData = {
  status: Status;
  error: string | null;
  tasks: WorkspaceTask[];
  summary: TasksWidgetSummary;
  refresh: () => Promise<void>;
  runAction: (task: WorkspaceTask, action?: "acknowledge" | "start" | "complete") => Promise<void>;
  busyId: string | null;
};

function resolveView(view: string | undefined): TasksWidgetView {
  return isTasksWidgetView(view) ? view : "today";
}

/**
 * Loads tasks for a workspace widget view via the existing tasks API.
 * today/week filter client-side from the active list; other views use API `view`.
 */
export function useTasksWidgetData(viewProp: string | undefined, enabled: boolean): TasksWidgetData {
  const view = resolveView(viewProp);
  const [allActive, setAllActive] = useState<WorkspaceTask[]>([]);
  const [viewItems, setViewItems] = useState<WorkspaceTask[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setAllActive([]);
      setViewItems([]);
      setStatus("empty");
      setError(null);
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const apiView = tasksApiViewParam(view);
      const activeQs = new URLSearchParams({ pageSize: "200" });
      const viewQs = new URLSearchParams({ pageSize: "200" });
      if (apiView) viewQs.set("view", apiView);

      const [activeRes, viewRes] = await Promise.all([
        apiGet<{ items: WorkspaceTask[] }>(`/api/v1/industrial/tasks?${activeQs}`),
        apiView
          ? apiGet<{ items: WorkspaceTask[] }>(`/api/v1/industrial/tasks?${viewQs}`)
          : Promise.resolve(null),
      ]);

      const activeItems = activeRes.items ?? [];
      setAllActive(activeItems);

      let displayed: WorkspaceTask[];
      if (view === "today") {
        displayed = filterTasksForWidgetView(activeItems, "today");
      } else if (view === "week") {
        displayed = filterTasksForWidgetView(activeItems, "week");
      } else if (apiView && viewRes) {
        displayed = viewRes.items ?? [];
      } else {
        displayed = activeItems;
      }

      setViewItems(displayed);
      setStatus(displayed.length === 0 ? "empty" : "loaded");
    } catch (err) {
      setAllActive([]);
      setViewItems([]);
      setError(err instanceof ApiError ? err.message : "Unable to load tasks.");
      setStatus("error");
    }
  }, [enabled, view]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = useMemo(() => summarizeTasks(allActive), [allActive]);

  const runAction = useCallback(
    async (task: WorkspaceTask, action?: "acknowledge" | "start" | "complete") => {
      const resolved = action ?? nextTaskAction(task.status);
      setBusyId(task.id);
      setError(null);
      try {
        await apiSend(
          `/api/v1/industrial/tasks/${encodeURIComponent(task.id)}/${resolved}`,
          "POST",
          {},
        );
        await refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Unable to update task.");
        throw err;
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  return {
    status,
    error,
    tasks: viewItems,
    summary,
    refresh,
    runAction,
    busyId,
  };
}

/** Compact card status: "5 open · 1 overdue". */
export function useTasksCompactStatus(enabled: boolean): {
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
      const data = await apiGet<{ items: WorkspaceTask[] }>(
        `/api/v1/industrial/tasks?${new URLSearchParams({ pageSize: "200" })}`,
      );
      const summary = summarizeTasks(data.items ?? []);
      setStatus(summary.open === 0 ? "empty" : "loaded");
      if (summary.open === 0) {
        setLabel("No open tasks");
      } else if (summary.overdue > 0) {
        setLabel(`${summary.open} open · ${summary.overdue} overdue`);
      } else {
        setLabel(`${summary.open} open`);
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
