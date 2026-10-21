"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { OrgContextBar } from "@/components/org-context-bar";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { fieldRemindersApi } from "@/lib/reminders-api";
import {
  filterRemindersForView,
  formatReminderWhen,
  snoozeRemindAt,
  snoozeRemindAtTomorrowMorning,
} from "@/lib/reminders/filter";
import {
  FIELD_REMINDERS_VIEWS,
  isFieldRemindersView,
  isReminderPending,
  reminderDisplayTitle,
  reminderOpenHref,
  type FieldReminder,
  type FieldRemindersView,
} from "@/lib/reminders/types";
import { useMyWork } from "@/hooks/use-my-work";

function RemindersInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { moduleEnabled } = useFieldPermissions();
  const { data: myWork } = useMyWork();
  const initialView = isFieldRemindersView(search.get("view")) ? search.get("view")! : "upcoming";
  const focusId = String(search.get("reminderId") ?? "").trim();
  const createMode = search.get("create") === "1";

  const [view, setView] = useState<FieldRemindersView>(initialView as FieldRemindersView);
  const [items, setItems] = useState<FieldReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [compose, setCompose] = useState(createMode);
  const [title, setTitle] = useState("");
  const [taskId, setTaskId] = useState("");
  const [remindAt, setRemindAt] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  });
  const [saving, setSaving] = useState(false);

  const enabled = moduleEnabled("REMINDERS");

  const taskOptions = useMemo(() => {
    return (myWork?.items ?? [])
      .filter((item) => item.kind === "task")
      .slice(0, 40)
      .map((item) => ({ id: item.id, title: item.title || "Task" }));
  }, [myWork?.items]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fieldRemindersApi.list();
      setItems(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load reminders");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => filterRemindersForView(items, view), [items, view]);

  const focused = useMemo(() => {
    if (!focusId) return null;
    return items.find((r) => r.id === focusId) ?? null;
  }, [items, focusId]);

  async function snooze(id: string, when: Date) {
    setBusyId(id);
    setError(null);
    try {
      await fieldRemindersApi.snooze(id, when);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not snooze reminder");
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await fieldRemindersApi.cancel(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not dismiss reminder");
    } finally {
      setBusyId(null);
    }
  }

  async function submitCreate() {
    if (!taskId || !remindAt) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        taskId,
        remindAt: new Date(remindAt).toISOString(),
        channel: "IN_APP",
      };
      if (title.trim()) body.title = title.trim();
      await fieldRemindersApi.create(body);
      setCompose(false);
      setTitle("");
      await refresh();
      router.replace("/reminders/?view=upcoming");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create reminder");
    } finally {
      setSaving(false);
    }
  }

  if (!enabled) {
    return (
      <>
        <h1 className="ff-page-title">Reminders</h1>
        <EmptyState
          title="Reminders not enabled"
          message="Ask an admin to enable the Reminders module for this company."
        />
      </>
    );
  }

  return (
    <>
      <h1 className="ff-page-title">Reminders</h1>
      <p className="ff-page-body">Complete, snooze, or open the related item.</p>
      <OrgContextBar />

      <div className="ff-tabs" role="tablist" aria-label="Reminder view" style={{ marginTop: 12 }}>
        {FIELD_REMINDERS_VIEWS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={view === id ? "ff-tab ff-tab-active" : "ff-tab"}
            onClick={() => {
              setView(id);
              router.replace(`/reminders/?view=${encodeURIComponent(id)}`);
            }}
          >
            {id.charAt(0).toUpperCase() + id.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" className="ff-btn" onClick={() => setCompose(true)}>
          New reminder
        </button>
        <button type="button" className="ff-btn ff-btn-secondary" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {compose ? (
        <section className="ff-section" aria-labelledby="create-reminder-heading">
          <h2 id="create-reminder-heading" className="ff-section-title">
            New reminder
          </h2>
          <p className="ff-hint ff-hint--left">Reminders must link to a task (or calendar event).</p>
          <label className="ff-label" htmlFor="rem-task">
            Task
          </label>
          <select
            id="rem-task"
            className="ff-input"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          >
            <option value="">Select a task…</option>
            {taskOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <label className="ff-label" htmlFor="rem-when">
            Remind at
          </label>
          <input
            id="rem-when"
            className="ff-input"
            type="datetime-local"
            value={remindAt}
            onChange={(e) => setRemindAt(e.target.value)}
          />
          <label className="ff-label" htmlFor="rem-title">
            Title (optional)
          </label>
          <input
            id="rem-title"
            className="ff-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Reminder title"
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="ff-btn"
              disabled={saving || !taskId}
              onClick={() => void submitCreate()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="ff-btn ff-btn-secondary"
              disabled={saving}
              onClick={() => setCompose(false)}
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {focused ? (
        <p className="ff-hint ff-hint--left" style={{ marginTop: 8 }}>
          Showing focus: {reminderDisplayTitle(focused)}
        </p>
      ) : null}

      {loading ? <LoadingState label="Loading reminders…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

      {!loading && !error ? (
        <div className="ff-task-list" style={{ marginTop: 12 }}>
          {visible.length === 0 ? (
            <EmptyState title="No reminders" message="Nothing in this view right now." />
          ) : (
            visible.map((reminder) => {
              const pending = isReminderPending(reminder.status);
              const busy = busyId === reminder.id;
              return (
                <article key={reminder.id} className="ff-task-card" style={{ display: "block" }}>
                  <button
                    type="button"
                    className="ff-link-btn"
                    style={{ textAlign: "left", width: "100%" }}
                    onClick={() => router.push(reminderOpenHref(reminder))}
                  >
                    <span className="ff-task-card__title">{reminderDisplayTitle(reminder)}</span>
                    <span className="ff-task-card__meta">
                      {formatReminderWhen(reminder)} · {reminder.status}
                    </span>
                  </button>
                  {pending ? (
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="ff-btn ff-btn-secondary"
                        disabled={busy}
                        onClick={() => void snooze(reminder.id, snoozeRemindAt(new Date(), 1))}
                      >
                        Snooze 1h
                      </button>
                      <button
                        type="button"
                        className="ff-btn ff-btn-secondary"
                        disabled={busy}
                        onClick={() => void snooze(reminder.id, snoozeRemindAtTomorrowMorning())}
                      >
                        Tomorrow
                      </button>
                      <button
                        type="button"
                        className="ff-btn ff-btn-secondary"
                        disabled={busy}
                        onClick={() => void dismiss(reminder.id)}
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        className="ff-btn"
                        disabled={busy}
                        onClick={() => router.push(reminderOpenHref(reminder))}
                      >
                        Open
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="ff-btn ff-btn-secondary"
                      style={{ marginTop: 8 }}
                      onClick={() => router.push(reminderOpenHref(reminder))}
                    >
                      Open related
                    </button>
                  )}
                </article>
              );
            })
          )}
        </div>
      ) : null}
    </>
  );
}

export function RemindersHub() {
  return (
    <Suspense fallback={<LoadingState label="Loading reminders…" />}>
      <RemindersInner />
    </Suspense>
  );
}
