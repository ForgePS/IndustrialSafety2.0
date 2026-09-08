"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import {
  addDays,
  endOfDay,
  formatDayLabel,
  sameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toLocalDateValue,
  toLocalInputValue,
} from "@/lib/calendar/dates";
import type { CalendarCategory, CalendarEvent } from "@/lib/calendar/types";

type Category = CalendarCategory;

type TaskOption = { id: string; title?: string | null; status?: string };

type ViewMode = "month" | "week" | "day" | "agenda";

const REMINDER_PRESETS = [
  { label: "15 min", minutes: 15 },
  { label: "1 hour", minutes: 60 },
  { label: "1 day", minutes: 1440 },
] as const;

function rangeForView(anchor: Date, view: ViewMode): { from: Date; to: Date } {
  if (view === "day") return { from: startOfDay(anchor), to: endOfDay(anchor) };
  if (view === "agenda") return { from: startOfDay(anchor), to: endOfDay(addDays(anchor, 13)) };
  if (view === "week") {
    const start = startOfWeek(anchor);
    return { from: start, to: endOfDay(addDays(start, 6)) };
  }
  const monthStart = startOfMonth(anchor);
  const gridStart = startOfWeek(monthStart);
  return { from: gridStart, to: endOfDay(addDays(gridStart, 41)) };
}

function recurrenceLabel(rule?: string | null): string {
  if (!rule) return "None";
  const u = rule.toUpperCase();
  if (u.includes("DAILY")) return "Daily";
  if (u.includes("WEEKLY")) return "Weekly";
  if (u.includes("MONTHLY")) return "Monthly";
  return "None";
}

export function CalendarWorkspace({ moduleName }: { moduleName: string }) {
  const searchParams = useSearchParams();
  const deepLinkHandled = useRef(false);
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [items, setItems] = useState<CalendarEvent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [recurrenceRule, setRecurrenceRule] = useState("NONE");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [reminderOffsets, setReminderOffsets] = useState<number[]>([15]);
  const [saving, setSaving] = useState(false);

  const range = useMemo(() => rangeForView(anchor, view), [anchor, view]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      });
      if (categoryFilter) qs.set("categoryId", categoryFilter);
      const [eventsRes, catsRes, tasksRes] = await Promise.all([
        apiGet<{ items: CalendarEvent[] }>(`/api/v1/industrial/calendar/events?${qs}`),
        apiGet<{ items: Category[] }>("/api/v1/industrial/calendar/categories"),
        apiGet<{ items: TaskOption[] }>("/api/v1/industrial/tasks").catch(() => ({ items: [] })),
      ]);
      setItems(eventsRes.items ?? []);
      setCategories(catsRes.items ?? []);
      setTasks(tasksRes.items ?? []);
      return eventsRes.items ?? [];
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load calendar");
      return [] as CalendarEvent[];
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, categoryFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const eventsOnSelected = useMemo(() => {
    return items.filter((ev) => {
      if (!ev.startsAt) return false;
      const start = new Date(ev.startsAt);
      const end = ev.endsAt ? new Date(ev.endsAt) : start;
      const dayStart = startOfDay(selected).getTime();
      const dayEnd = endOfDay(selected).getTime();
      return start.getTime() <= dayEnd && end.getTime() >= dayStart;
    });
  }, [items, selected]);

  const agendaItems = useMemo(() => {
    return [...items]
      .filter((ev) => ev.startsAt)
      .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
  }, [items]);

  function openCreate(day: Date) {
    const start = new Date(day);
    start.setHours(9, 0, 0, 0);
    const end = new Date(day);
    end.setHours(10, 0, 0, 0);
    setEditing(null);
    setTitle("");
    setDescription("");
    setStartsAt(toLocalInputValue(start.toISOString()));
    setEndsAt(toLocalInputValue(end.toISOString()));
    setAllDay(false);
    setTaskId("");
    setCategoryId(categoryFilter || categories[0]?.id || "");
    setRecurrenceRule("NONE");
    setRecurrenceUntil("");
    setReminderOffsets([15]);
    setSelected(startOfDay(day));
  }

  function openEdit(ev: CalendarEvent) {
    setEditing(ev);
    setTitle(ev.title ?? "");
    setDescription(ev.description ?? "");
    setStartsAt(toLocalInputValue(ev.startsAt));
    setEndsAt(toLocalInputValue(ev.endsAt));
    setAllDay(Boolean(ev.allDay));
    setTaskId(ev.taskId ?? "");
    setCategoryId(ev.categoryId ?? "");
    const rule = (ev.recurrenceRule ?? "").toUpperCase();
    setRecurrenceRule(
      rule.includes("DAILY") ? "DAILY" : rule.includes("WEEKLY") ? "WEEKLY" : rule.includes("MONTHLY") ? "MONTHLY" : "NONE",
    );
    setRecurrenceUntil(toLocalDateValue(ev.recurrenceUntil));
    setReminderOffsets([]);
  }

  // Deep links from workspace widget: ?create=1&date=YYYY-MM-DD or ?eventId=
  useEffect(() => {
    if (deepLinkHandled.current || loading) return;
    const create = searchParams.get("create");
    const eventId = searchParams.get("eventId");
    const dateParam = searchParams.get("date");

    if (create === "1") {
      deepLinkHandled.current = true;
      let day = startOfDay(new Date());
      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        const [y, m, d] = dateParam.split("-").map(Number);
        if (y && m && d) day = startOfDay(new Date(y, m - 1, d));
      }
      openCreate(day);
      return;
    }

    if (!eventId) return;

    deepLinkHandled.current = true;
    const match = items.find(
      (ev) => ev.id === eventId || ev.sourceEventId === eventId || ev.id.startsWith(`${eventId}:`),
    );
    if (match) {
      openEdit(match);
      return;
    }

    void (async () => {
      try {
        const ev = await apiGet<CalendarEvent>(
          `/api/v1/industrial/calendar/events/${encodeURIComponent(eventId)}`,
        );
        openEdit(ev);
      } catch {
        setError("Could not open the requested event.");
      }
    })();
    // One-shot deep-link handling after initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [searchParams, loading, items]);

  function toggleReminder(minutes: number) {
    setReminderOffsets((prev) =>
      prev.includes(minutes) ? prev.filter((m) => m !== minutes) : [...prev, minutes].sort((a, b) => a - b),
    );
  }

  async function saveEvent() {
    if (!title.trim() || !startsAt || !endsAt) {
      setError("Title, start, and end are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        allDay,
        taskId: taskId || null,
        categoryId: categoryId || null,
        recurrenceRule: recurrenceRule === "NONE" ? null : recurrenceRule,
        recurrenceUntil: recurrenceUntil ? new Date(`${recurrenceUntil}T23:59:59`).toISOString() : null,
      };
      if (!editing && reminderOffsets.length) {
        payload.reminderOffsetsMinutes = reminderOffsets;
        payload.createDefaultReminder = false;
      } else if (!editing) {
        payload.createDefaultReminder = true;
      } else if (reminderOffsets.length) {
        payload.reminderOffsetsMinutes = reminderOffsets;
      }

      if (editing) {
        const id = editing.sourceEventId || editing.id.split(":")[0]!;
        await apiSend(`/api/v1/industrial/calendar/events/${encodeURIComponent(id)}`, "PATCH", payload);
      } else {
        await apiSend("/api/v1/industrial/calendar/events", "POST", payload);
      }
      setEditing(null);
      setTitle("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save event");
    } finally {
      setSaving(false);
    }
  }

  async function archiveEvent(ev: CalendarEvent) {
    const id = ev.sourceEventId || ev.id.split(":")[0]!;
    setSaving(true);
    setError("");
    try {
      await apiSend(`/api/v1/industrial/calendar/events/${encodeURIComponent(id)}/archive`, "POST", {});
      if (editing && (editing.id === ev.id || editing.sourceEventId === id)) setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to archive event");
    } finally {
      setSaving(false);
    }
  }

  async function linkTask(ev: CalendarEvent) {
    const id = ev.sourceEventId || ev.id.split(":")[0]!;
    setSaving(true);
    setError("");
    try {
      await apiSend(`/api/v1/industrial/calendar/events/${encodeURIComponent(id)}/link-task`, "POST", {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create linked task");
    } finally {
      setSaving(false);
    }
  }

  function shiftAnchor(delta: number) {
    if (view === "day" || view === "agenda") setAnchor(addDays(anchor, delta * (view === "agenda" ? 14 : 1)));
    else if (view === "week") setAnchor(addDays(anchor, delta * 7));
    else setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1));
  }

  const monthCells = useMemo(() => {
    const cells: Date[] = [];
    let cursor = startOfWeek(startOfMonth(anchor));
    for (let i = 0; i < 42; i++) {
      cells.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return cells;
  }, [anchor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const headerLabel =
    view === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : view === "week"
        ? `${formatDayLabel(weekDays[0]!)} – ${formatDayLabel(weekDays[6]!)}`
        : view === "agenda"
          ? `${formatDayLabel(range.from)} – ${formatDayLabel(range.to)}`
          : formatDayLabel(anchor);

  function countForDay(day: Date): number {
    return items.filter((ev) => {
      if (!ev.startsAt) return false;
      const start = new Date(ev.startsAt);
      const end = ev.endsAt ? new Date(ev.endsAt) : start;
      return start.getTime() <= endOfDay(day).getTime() && end.getTime() >= startOfDay(day).getTime();
    }).length;
  }

  return (
    <div className="container-xxl flex-grow-1 container-p-y">
      <ModuleWorkspaceHeader
        title={moduleName}
        description="Schedule events with categories, recurrence, and linked tasks. Reminders fire before start."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="btn-group" role="group" aria-label="Calendar view">
          {(["month", "week", "day", "agenda"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`btn btn-sm ${view === mode ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => {
                setView(mode);
                if (mode === "day") setAnchor(selected);
              }}
            >
              {mode[0]!.toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => shiftAnchor(-1)}>
          Prev
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => {
            const today = startOfDay(new Date());
            setAnchor(today);
            setSelected(today);
          }}
        >
          Today
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => shiftAnchor(1)}>
          Next
        </button>
        <span className="fw-semibold ms-1">{headerLabel}</span>
        <button type="button" className="btn btn-sm btn-primary ms-auto" onClick={() => openCreate(selected)}>
          New event
        </button>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          className={`btn btn-sm ${!categoryFilter ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setCategoryFilter("")}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`btn btn-sm ${categoryFilter === c.id ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => setCategoryFilter(c.id)}
          >
            <span
              className="d-inline-block rounded-circle me-1"
              style={{ width: 10, height: 10, background: c.color }}
            />
            {c.name}
          </button>
        ))}
      </div>

      {view === "month" ? (
        <div className="card mb-4">
          <div className="card-body p-2">
            <div
              className="small text-muted mb-1"
              style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}
            >
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center">
                  {d}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {monthCells.map((day) => {
                const inMonth = day.getMonth() === anchor.getMonth();
                const isSelected = sameDay(day, selected);
                const isToday = sameDay(day, new Date());
                const count = countForDay(day);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={`w-100 border rounded-1 p-2 text-start ${
                      isSelected ? "border-primary bg-label-primary" : "bg-body"
                    } ${!inMonth ? "opacity-50" : ""}`}
                    style={{ minHeight: 72 }}
                    onClick={() => {
                      setSelected(startOfDay(day));
                      setAnchor(day);
                    }}
                    onDoubleClick={() => openCreate(day)}
                  >
                    <div className={`small ${isToday ? "text-primary fw-bold" : ""}`}>{day.getDate()}</div>
                    {count > 0 ? (
                      <div className="badge bg-label-primary mt-1">
                        {count} event{count === 1 ? "" : "s"}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {view === "week" ? (
        <div className="row g-2 mb-4">
          {weekDays.map((day) => {
            const isSelected = sameDay(day, selected);
            const count = countForDay(day);
            return (
              <div key={day.toISOString()} className="col">
                <button
                  type="button"
                  className={`w-100 border rounded-1 p-3 text-start ${
                    isSelected ? "border-primary bg-label-primary" : "bg-body"
                  }`}
                  onClick={() => {
                    setSelected(startOfDay(day));
                    setAnchor(day);
                  }}
                  onDoubleClick={() => openCreate(day)}
                >
                  <div className="fw-semibold small">{formatDayLabel(day)}</div>
                  <div className="text-muted small">
                    {count} event{count === 1 ? "" : "s"}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {view === "agenda" ? (
        <div className="card mb-4">
          <div className="card-header">
            <h5 className="mb-0">Agenda</h5>
          </div>
          <div className="card-body">
            {agendaItems.length === 0 ? (
              <p className="text-muted mb-0">No upcoming events in this range.</p>
            ) : (
              <ul className="list-group list-group-flush">
                {agendaItems.map((ev) => (
                  <li
                    key={ev.id}
                    className="list-group-item d-flex justify-content-between align-items-start gap-2 px-0"
                  >
                    <div>
                      <div className="fw-semibold">
                        {ev.category ? (
                          <span
                            className="d-inline-block rounded-circle me-2"
                            style={{ width: 10, height: 10, background: ev.category.color }}
                          />
                        ) : null}
                        {ev.title}
                        {ev.isOccurrence ? <span className="badge bg-label-secondary ms-2">Recurring</span> : null}
                      </div>
                      <div className="small text-muted">
                        {ev.startsAt ? new Date(ev.startsAt).toLocaleString() : "—"}
                        {ev.category ? ` · ${ev.category.name}` : ""}
                      </div>
                    </div>
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => openEdit(ev)}>
                      Edit
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {view !== "agenda" ? (
        <div className="row g-4">
          <div className="col-lg-7">
            <div className="card">
              <div className="card-header">
                <h5 className="mb-0">Events · {formatDayLabel(selected)}</h5>
              </div>
              <div className="card-body">
                {eventsOnSelected.length === 0 ? (
                  <p className="text-muted mb-0">No events this day.</p>
                ) : (
                  <ul className="list-group list-group-flush">
                    {eventsOnSelected.map((ev) => (
                      <li
                        key={ev.id}
                        className="list-group-item d-flex justify-content-between align-items-start gap-2 px-0"
                      >
                        <div>
                          <div className="fw-semibold">
                            {ev.category ? (
                              <span
                                className="d-inline-block rounded-circle me-2"
                                style={{ width: 10, height: 10, background: ev.category.color }}
                              />
                            ) : null}
                            {ev.title}
                          </div>
                          <div className="small text-muted">
                            {ev.allDay
                              ? "All day"
                              : `${ev.startsAt ? new Date(ev.startsAt).toLocaleString() : "—"} → ${
                                  ev.endsAt ? new Date(ev.endsAt).toLocaleString() : "—"
                                }`}
                            {ev.recurrenceRule ? ` · ${recurrenceLabel(ev.recurrenceRule)}` : ""}
                          </div>
                          {ev.taskId ? (
                            <div className="small">
                              <Link href="/modules/tasks/">Linked task</Link>
                            </div>
                          ) : null}
                        </div>
                        <div className="btn-group btn-group-sm">
                          {!ev.taskId ? (
                            <button
                              type="button"
                              className="btn btn-outline-success"
                              disabled={saving}
                              onClick={() => void linkTask(ev)}
                            >
                              + Task
                            </button>
                          ) : null}
                          <button type="button" className="btn btn-outline-primary" onClick={() => openEdit(ev)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-danger"
                            disabled={saving}
                            onClick={() => void archiveEvent(ev)}
                          >
                            Archive
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="col-lg-5">
            <div className="card">
              <div className="card-header">
                <h5 className="mb-0">{editing ? "Edit event" : "Create event"}</h5>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label" htmlFor="cal-title">
                    Title
                  </label>
                  <input
                    id="cal-title"
                    className="form-control"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Event title"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="cal-desc">
                    Description
                  </label>
                  <textarea
                    id="cal-desc"
                    className="form-control"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="cal-cat">
                    Category
                  </label>
                  <select
                    id="cal-cat"
                    className="form-select"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">None</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="cal-start">
                    Starts
                  </label>
                  <input
                    id="cal-start"
                    type="datetime-local"
                    className="form-control"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="cal-end">
                    Ends
                  </label>
                  <input
                    id="cal-end"
                    type="datetime-local"
                    className="form-control"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </div>
                <div className="form-check mb-3">
                  <input
                    id="cal-allday"
                    className="form-check-input"
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="cal-allday">
                    All day
                  </label>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="cal-recur">
                    Recurrence
                  </label>
                  <select
                    id="cal-recur"
                    className="form-select"
                    value={recurrenceRule}
                    onChange={(e) => setRecurrenceRule(e.target.value)}
                  >
                    <option value="NONE">None</option>
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>
                {recurrenceRule !== "NONE" ? (
                  <div className="mb-3">
                    <label className="form-label" htmlFor="cal-until">
                      Repeat until (optional)
                    </label>
                    <input
                      id="cal-until"
                      type="date"
                      className="form-control"
                      value={recurrenceUntil}
                      onChange={(e) => setRecurrenceUntil(e.target.value)}
                    />
                  </div>
                ) : null}
                <div className="mb-3">
                  <div className="form-label">Reminders before start</div>
                  <div className="d-flex flex-wrap gap-2">
                    {REMINDER_PRESETS.map((p) => (
                      <button
                        key={p.minutes}
                        type="button"
                        className={`btn btn-sm ${
                          reminderOffsets.includes(p.minutes) ? "btn-primary" : "btn-outline-secondary"
                        }`}
                        onClick={() => toggleReminder(p.minutes)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {editing ? (
                    <div className="form-text">Selecting presets adds new reminders on save.</div>
                  ) : null}
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="cal-task">
                    Linked task (optional)
                  </label>
                  <select
                    id="cal-task"
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
                <div className="d-flex gap-2">
                  <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveEvent()}>
                    {saving ? "Saving…" : editing ? "Save changes" : "Create event"}
                  </button>
                  {editing || title ? (
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => {
                        setEditing(null);
                        setTitle("");
                        setDescription("");
                        setTaskId("");
                        setReminderOffsets([15]);
                      }}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
