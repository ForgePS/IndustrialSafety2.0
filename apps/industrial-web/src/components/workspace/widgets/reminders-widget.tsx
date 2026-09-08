"use client";

import Link from "next/link";
import { useRemindersCompactStatus, useRemindersWidgetData } from "@/hooks/use-reminders-widget";
import {
  isReminderPending,
  isRemindersWidgetView,
  reminderDisplayTitle,
  reminderHref,
  remindersCreateHref,
  remindersViewAllHref,
  type RemindersWidgetView,
  type WorkspaceReminder,
} from "@/lib/reminders/types";
import { formatReminderWhen } from "@/lib/reminders/widget-filter";
import type { WorkspaceWidgetSize } from "@/lib/workspace/types";
import { WORKSPACE_VIEW_LABELS } from "@/lib/workspace/types";

const VIEW_TABS: RemindersWidgetView[] = ["today", "upcoming", "sent", "overdue"];

type Props = {
  size: WorkspaceWidgetSize;
  view: string | undefined;
  onViewChange: (view: string) => void;
  moduleRoute: string;
};

function ReminderRow({
  reminder,
  busy,
  showActions,
  onSnooze,
  onDismiss,
}: {
  reminder: WorkspaceReminder;
  busy: boolean;
  showActions: boolean;
  onSnooze: (mode: "1h" | "tomorrow") => void;
  onDismiss: () => void;
}) {
  const pending = isReminderPending(reminder.status);
  const when = formatReminderWhen(reminder);
  const title = reminderDisplayTitle(reminder);

  return (
    <div className="forge-ws-reminder-row py-2 border-bottom">
      <div className="d-flex align-items-start justify-content-between gap-2">
        <div className="min-w-0">
          <Link
            href={reminderHref(reminder)}
            className="d-block small fw-semibold text-heading text-truncate text-decoration-none"
            title={title}
          >
            <span className="text-muted me-2 text-nowrap">{when}</span>
            {title}
          </Link>
          <div className="small text-muted">
            <span className="text-uppercase me-2">{reminder.status}</span>
            {reminder.channel}
          </div>
        </div>
      </div>
      {showActions && pending ? (
        <div className="d-flex flex-wrap gap-1 mt-1">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={busy}
            onClick={() => onSnooze("1h")}
          >
            Snooze
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={busy}
            onClick={() => onSnooze("tomorrow")}
          >
            Tomorrow
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            disabled={busy}
            onClick={onDismiss}
            title="Dismiss clears this pending reminder (cancel)"
          >
            Dismiss
          </button>
          <Link href={reminderHref(reminder)} className="btn btn-sm btn-outline-secondary">
            Open
          </Link>
        </div>
      ) : (
        <div className="mt-1">
          <Link href={reminderHref(reminder)} className="btn btn-sm btn-outline-secondary">
            Open
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Live Reminders workspace widget.
 * Snooze → PATCH remindAt; Dismiss → cancel (existing reminder lifecycle).
 */
export function RemindersWorkspaceWidget({ size, view: viewProp, onViewChange, moduleRoute }: Props) {
  const view: RemindersWidgetView = isRemindersWidgetView(viewProp) ? viewProp : "upcoming";
  const { status, error, reminders, summary, refresh, snooze, dismiss, busyId } =
    useRemindersWidgetData(view, true);

  const showTabs = size !== "compact";
  const showActions = size === "medium" || size === "wide" || size === "large" || size === "full";
  const maxRows = size === "medium" ? 5 : size === "wide" ? 8 : 12;
  const visible = reminders.slice(0, maxRows);

  return (
    <div className="forge-ws-reminders d-flex flex-column h-100">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        {showTabs ? (
          <div className="btn-group btn-group-sm flex-wrap" role="group" aria-label="Reminders view">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`btn ${view === tab ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => onViewChange(tab)}
              >
                {WORKSPACE_VIEW_LABELS[tab] ?? tab}
              </button>
            ))}
          </div>
        ) : null}
        <Link href={remindersCreateHref()} className="btn btn-sm btn-outline-primary">
          + Reminder
        </Link>
      </div>

      {showTabs && status !== "error" && status !== "loading" ? (
        <div className="d-flex flex-wrap gap-3 small mb-2">
          <span>
            <strong>{summary.today}</strong> Today
          </span>
          <span>
            <strong>{summary.upcoming}</strong> Upcoming
          </span>
          <span className={summary.overdue > 0 ? "text-danger" : undefined}>
            <strong>{summary.overdue}</strong> Overdue
          </span>
        </div>
      ) : null}

      <div className="flex-grow-1 overflow-auto forge-ws-reminders-scroll">
        {status === "loading" ? <p className="text-muted small mb-0">Loading reminders…</p> : null}

        {status === "error" ? (
          <div>
            <p className="text-danger small mb-2">{error ?? "Unable to load reminders."}</p>
            <div className="d-flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void refresh()}>
                Try Again
              </button>
              <Link href={moduleRoute} className="btn btn-sm btn-outline-primary">
                Open Reminders
              </Link>
            </div>
          </div>
        ) : null}

        {status === "empty" ? (
          <div className="text-center py-2">
            <p className="text-muted small mb-2">You&apos;re all caught up.</p>
            <Link href={remindersCreateHref()} className="btn btn-sm btn-outline-primary">
              + Create Reminder
            </Link>
          </div>
        ) : null}

        {status === "loaded"
          ? visible.map((reminder) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                busy={busyId === reminder.id}
                showActions={showActions}
                onSnooze={(mode) => void snooze(reminder, mode)}
                onDismiss={() => void dismiss(reminder)}
              />
            ))
          : null}
      </div>

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2 pt-2 border-top">
        <span className="text-muted small">
          {status === "loaded" ? `${reminders.length} shown` : "\u00a0"}
        </span>
        <Link href={remindersViewAllHref(view)} className="small">
          View Reminders →
        </Link>
      </div>
    </div>
  );
}

/** Live compact caption. */
export function RemindersCompactCaption({ fallback }: { fallback: string }) {
  const { label, status } = useRemindersCompactStatus(true);
  if (status === "loading") return <>Loading…</>;
  if (status === "error") return <>{fallback}</>;
  return <>{label}</>;
}
