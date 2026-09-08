"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { filterRemindersForWidgetView } from "@/lib/reminders/widget-filter";
import type { RemindersWidgetView } from "@/lib/reminders/types";
import { isRemindersWidgetView } from "@/lib/reminders/types";

type Reminder = {
  id: string;
  title?: string | null;
  eventId?: string | null;
  taskId?: string | null;
  remindAt: string | null;
  channel: string;
  status: string;
  sentAt?: string | null;
};

type CalendarEvent = { id: string; title: string };
type TaskOption = { id: string; title?: string | null };

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RemindersWorkspace({ moduleName }: { moduleName: string }) {
  const searchParams = useSearchParams();
  const deepLinkHandled = useRef(false);
  const [items, setItems] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [widgetView, setWidgetView] = useState<RemindersWidgetView | null>(null);
  const [focusCreate, setFocusCreate] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [remindAt, setRemindAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return toLocalInputValue(d.toISOString());
  });
  const [channel, setChannel] = useState("IN_APP");
  const [eventId, setEventId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const to = new Date();
      to.setDate(to.getDate() + 90);
      const eventQs = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const [remindersRes, eventsRes, tasksRes] = await Promise.all([
        apiGet<{ items: Reminder[] }>(`/api/v1/industrial/reminders${qs}`),
        apiGet<{ items: CalendarEvent[] }>(`/api/v1/industrial/calendar/events?${eventQs}`).catch(
          () => ({ items: [] }),
        ),
        apiGet<{ items: TaskOption[] }>("/api/v1/industrial/tasks").catch(() => ({ items: [] })),
      ]);
      setItems(remindersRes.items ?? []);
      setEvents(eventsRes.items ?? []);
      setTasks(tasksRes.items ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load reminders");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (deepLinkHandled.current) return;
    const create = searchParams.get("create");
    const reminderId = searchParams.get("reminderId");
    const statusParam = searchParams.get("status");
    const viewParam = searchParams.get("view");

    if (statusParam !== null) {
      setStatusFilter(statusParam);
      setWidgetView(null);
    }

    if (viewParam && isRemindersWidgetView(viewParam)) {
      setWidgetView(viewParam);
      setStatusFilter("");
    }

    if (create === "1") {
      deepLinkHandled.current = true;
      setFocusCreate(true);
      return;
    }

    if (reminderId) {
      deepLinkHandled.current = true;
      setHighlightId(reminderId);
      setStatusFilter("");
      return;
    }

    if (statusParam !== null || viewParam) {
      deepLinkHandled.current = true;
    }
  }, [searchParams]);

  useEffect(() => {
    if (!focusCreate) return;
    document.getElementById("rem-title")?.focus();
    setFocusCreate(false);
  }, [focusCreate]);

  const filtered = useMemo(() => {
    let list = items;
    if (widgetView) {
      list = filterRemindersForWidgetView(list, widgetView);
    }
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const hay = `${r.title ?? ""} ${r.status} ${r.channel}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, filter, widgetView]);

  useEffect(() => {
    if (!highlightId || loading) return;
    document.getElementById(`reminder-row-${highlightId}`)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [highlightId, loading, filtered]);

  const eventTitle = useMemo(() => {
    const map = new Map(events.map((e) => [e.id, e.title]));
    return (id?: string | null) => (id ? map.get(id) ?? id.slice(0, 8) : null);
  }, [events]);

  const taskTitle = useMemo(() => {
    const map = new Map(tasks.map((t) => [t.id, t.title || t.id]));
    return (id?: string | null) => (id ? map.get(id) ?? id.slice(0, 8) : null);
  }, [tasks]);

  async function createReminder() {
    if (!remindAt || (!eventId && !taskId)) {
      setError("Remind time and an event or task link are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiSend("/api/v1/industrial/reminders", "POST", {
        title: title.trim() || null,
        remindAt: new Date(remindAt).toISOString(),
        channel,
        eventId: eventId || null,
        taskId: taskId || null,
      });
      setTitle("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create reminder");
    } finally {
      setSaving(false);
    }
  }

  async function cancelReminder(id: string) {
    setSaving(true);
    setError("");
    try {
      await apiSend(`/api/v1/industrial/reminders/${encodeURIComponent(id)}/cancel`, "POST", {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel reminder");
    } finally {
      setSaving(false);
    }
  }

  async function processDue() {
    setSaving(true);
    setError("");
    try {
      await apiSend("/api/v1/industrial/reminders/process-due", "POST", {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to process due reminders");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container-xxl flex-grow-1 container-p-y">
      <ModuleWorkspaceHeader
        title={moduleName}
        description="Create reminders linked to calendar events and/or tasks. Due reminders notify in-app (and email when channel allows)."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      {error ? <div className="alert alert-danger">{error}</div> : null}

      <FilterPanel
        searchId="reminders-filter"
        searchValue={filter}
        onSearchChange={setFilter}
        searchPlaceholder="Search reminders"
        statusId="reminders-status"
        statusValue={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={[
          { value: "", label: "All statuses" },
          { value: "PENDING", label: "Pending" },
          { value: "SENT", label: "Sent" },
          { value: "CANCELLED", label: "Cancelled" },
        ]}
        onSubmit={() => void load()}
        onClearAll={() => {
          setFilter("");
          setStatusFilter("");
        }}
      />

      <div className="row g-4 mt-1">
        <div className="col-lg-7">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Reminders</h5>
              <button type="button" className="btn btn-sm btn-outline-primary" disabled={saving} onClick={() => void processDue()}>
                Process due now
              </button>
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Title</th>
                    <th>Link</th>
                    <th>Channel</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-muted">
                        No reminders match.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r) => (
                      <tr
                        key={r.id}
                        id={`reminder-row-${r.id}`}
                        className={highlightId === r.id ? "table-active" : undefined}
                      >
                        <td className="text-nowrap small">
                          {r.remindAt ? new Date(r.remindAt).toLocaleString() : "—"}
                        </td>
                        <td>{r.title || "Reminder"}</td>
                        <td className="small">
                          {r.eventId ? <div>Event: {eventTitle(r.eventId)}</div> : null}
                          {r.taskId ? <div>Task: {taskTitle(r.taskId)}</div> : null}
                          {!r.eventId && !r.taskId ? "—" : null}
                        </td>
                        <td>{r.channel}</td>
                        <td>
                          <span
                            className={`badge ${
                              r.status === "SENT"
                                ? "bg-label-success"
                                : r.status === "CANCELLED"
                                  ? "bg-label-secondary"
                                  : "bg-label-warning"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="text-end">
                          {r.status === "PENDING" ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              disabled={saving}
                              onClick={() => void cancelReminder(r.id)}
                            >
                              Cancel
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-lg-5">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Create reminder</h5>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label" htmlFor="rem-title">
                  Title
                </label>
                <input
                  id="rem-title"
                  className="form-control"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Optional title"
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="rem-at">
                  Remind at
                </label>
                <input
                  id="rem-at"
                  type="datetime-local"
                  className="form-control"
                  value={remindAt}
                  onChange={(e) => setRemindAt(e.target.value)}
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="rem-channel">
                  Channel
                </label>
                <select
                  id="rem-channel"
                  className="form-select"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="IN_APP">In-app</option>
                  <option value="EMAIL">Email</option>
                  <option value="BOTH">Both</option>
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="rem-event">
                  Calendar event
                </label>
                <select
                  id="rem-event"
                  className="form-select"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                >
                  <option value="">None</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="rem-task">
                  Task
                </label>
                <select
                  id="rem-task"
                  className="form-select"
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                >
                  <option value="">None</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title || t.id}
                    </option>
                  ))}
                </select>
              </div>
              <p className="small text-muted">Link at least one event or task.</p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void createReminder()}
              >
                {saving ? "Saving…" : "Create reminder"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
