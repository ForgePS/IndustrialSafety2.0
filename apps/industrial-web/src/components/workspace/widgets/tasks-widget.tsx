"use client";

import Link from "next/link";
import { useTasksCompactStatus, useTasksWidgetData } from "@/hooks/use-tasks-widget";
import {
  isTaskTerminal,
  isTasksWidgetView,
  priorityLabel,
  taskActionLabel,
  taskHref,
  tasksCreateHref,
  tasksViewAllHref,
  type TasksWidgetView,
  type WorkspaceTask,
} from "@/lib/tasks/types";
import { formatTaskDueLabel } from "@/lib/tasks/widget-filter";
import type { WorkspaceWidgetSize } from "@/lib/workspace/types";
import { WORKSPACE_VIEW_LABELS } from "@/lib/workspace/types";

const VIEW_TABS: TasksWidgetView[] = [
  "my-tasks",
  "today",
  "week",
  "overdue",
  "assigned-to-me",
];

type Props = {
  size: WorkspaceWidgetSize;
  view: string | undefined;
  onViewChange: (view: string) => void;
  moduleRoute: string;
};

function TaskRow({
  task,
  busy,
  onComplete,
  onAdvance,
  showActions,
}: {
  task: WorkspaceTask;
  busy: boolean;
  onComplete: () => void;
  onAdvance: () => void;
  showActions: boolean;
}) {
  const done = isTaskTerminal(task.status);
  const priority = priorityLabel(task.priority);
  const due = formatTaskDueLabel(task);

  return (
    <div className="forge-ws-task-row d-flex align-items-start gap-2 py-1">
      <input
        type="checkbox"
        className="form-check-input mt-1 flex-shrink-0"
        checked={done}
        disabled={busy || done}
        aria-label={`Complete ${task.title}`}
        onChange={() => {
          if (!done) onComplete();
        }}
      />
      <div className="min-w-0 flex-grow-1">
        <Link
          href={taskHref(task.id)}
          className={`d-block small text-truncate text-decoration-none ${done ? "text-decoration-line-through text-muted" : "text-heading fw-semibold"}`}
          title={task.title}
        >
          {task.title}
        </Link>
        <div className="d-flex flex-wrap gap-2 small text-muted">
          <span className={task.overdue ? "text-danger" : undefined}>{due}</span>
          <span className="text-uppercase">{priority}</span>
          {task.assigneeName ? <span className="text-truncate">{task.assigneeName}</span> : null}
        </div>
      </div>
      {showActions && !done ? (
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary flex-shrink-0"
          disabled={busy}
          onClick={onAdvance}
        >
          {taskActionLabel(task.status)}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Live Tasks workspace widget — today / week / overdue / assigned views
 * with direct complete via existing task action API.
 */
export function TasksWorkspaceWidget({ size, view: viewProp, onViewChange, moduleRoute }: Props) {
  const view: TasksWidgetView = isTasksWidgetView(viewProp) ? viewProp : "today";
  const { status, error, tasks, summary, refresh, runAction, busyId } = useTasksWidgetData(view, true);

  const showTabs = size !== "compact";
  const showRowActions = size === "large" || size === "wide" || size === "full";
  const maxRows = size === "medium" ? 5 : size === "wide" ? 8 : 12;
  const visible = tasks.slice(0, maxRows);

  return (
    <div className="forge-ws-tasks d-flex flex-column h-100">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        {showTabs ? (
          <div className="btn-group btn-group-sm flex-wrap" role="group" aria-label="Tasks view">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`btn ${view === tab ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => onViewChange(tab)}
              >
                {tab === "assigned-to-me"
                  ? "Assigned"
                  : tab === "my-tasks"
                    ? "My Tasks"
                    : tab === "week"
                      ? "Week"
                      : (WORKSPACE_VIEW_LABELS[tab] ?? tab)}
              </button>
            ))}
          </div>
        ) : null}
        <Link href={tasksCreateHref()} className="btn btn-sm btn-outline-primary">
          + Task
        </Link>
      </div>

      {(size === "medium" || size === "wide" || size === "large" || size === "full") &&
      status !== "error" &&
      status !== "loading" ? (
        <div className="d-flex flex-wrap gap-3 small mb-2">
          <span>
            <strong>{summary.dueToday}</strong> Due Today
          </span>
          <span>
            <strong>{summary.dueThisWeek}</strong> This Week
          </span>
          <span className={summary.overdue > 0 ? "text-danger" : undefined}>
            <strong>{summary.overdue}</strong> Overdue
          </span>
        </div>
      ) : null}

      <div className="flex-grow-1 overflow-auto forge-ws-tasks-scroll">
        {status === "loading" ? <p className="text-muted small mb-0">Loading tasks…</p> : null}

        {status === "error" ? (
          <div>
            <p className="text-danger small mb-2">{error ?? "Unable to load tasks."}</p>
            <div className="d-flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void refresh()}>
                Try Again
              </button>
              <Link href={moduleRoute} className="btn btn-sm btn-outline-primary">
                Open Tasks
              </Link>
            </div>
          </div>
        ) : null}

        {status === "empty" ? (
          <div className="text-center py-2">
            <p className="text-muted small mb-2">No open tasks.</p>
            <Link href={tasksCreateHref()} className="btn btn-sm btn-outline-primary">
              + Create Task
            </Link>
          </div>
        ) : null}

        {status === "loaded"
          ? visible.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                busy={busyId === task.id}
                showActions={showRowActions}
                onComplete={() => void runAction(task, "complete")}
                onAdvance={() => void runAction(task)}
              />
            ))
          : null}
      </div>

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2 pt-2 border-top">
        <span className="text-muted small">
          {status === "loaded" ? `${tasks.length} shown` : "\u00a0"}
        </span>
        <Link href={tasksViewAllHref(view)} className="small">
          View All Tasks →
        </Link>
      </div>
    </div>
  );
}

/** Live compact caption: "5 open · 1 overdue". */
export function TasksCompactCaption({ fallback }: { fallback: string }) {
  const { label, status } = useTasksCompactStatus(true);
  if (status === "loading") return <>Loading…</>;
  if (status === "error") return <>{fallback}</>;
  return <>{label}</>;
}
