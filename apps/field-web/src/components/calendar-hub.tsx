"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { OrgContextBar } from "@/components/org-context-bar";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { fieldCalendarApi } from "@/lib/calendar-api";
import { formatDayLabel, toLocalInputValue } from "@/lib/calendar/dates";
import {
  daysForFieldCalendarView,
  filterEventsForLocation,
  groupEventsByDay,
  rangeForFieldCalendarView,
} from "@/lib/calendar/range";
import {
  eventDisplayWhen,
  FIELD_CALENDAR_VIEWS,
  isFieldCalendarView,
  type FieldCalendarEvent,
  type FieldCalendarView,
} from "@/lib/calendar/types";

function CalendarInner() {
  const router = useRouter();
  const search = useSearchParams();
  const org = useFieldOrgOptional();
  const { moduleEnabled } = useFieldPermissions();
  const locationId = org?.selection.locationId ?? "";
  const initialView = isFieldCalendarView(search.get("view")) ? search.get("view")! : "agenda";
  const focusId = String(search.get("eventId") ?? "").trim();
  const createMode = search.get("create") === "1";

  const [view, setView] = useState<FieldCalendarView>(initialView as FieldCalendarView);
  const [events, setEvents] = useState<FieldCalendarEvent[]>([]);
  const [selected, setSelected] = useState<FieldCalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [compose, setCompose] = useState(createMode);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(new Date().toISOString()));
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return toLocalInputValue(d.toISOString());
  });
  const [allDay, setAllDay] = useState(false);

  const enabled = moduleEnabled("CALENDAR");

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { from, to } = rangeForFieldCalendarView(view);
      const rows = await fieldCalendarApi.listEvents({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      setEvents(rows);
      if (focusId) {
        const fromList = rows.find(
          (ev) => ev.id === focusId || ev.sourceEventId === focusId || ev.id.startsWith(`${focusId}:`),
        );
        if (fromList) {
          setSelected(fromList);
        } else {
          try {
            const ev = await fieldCalendarApi.getEvent(focusId);
            setSelected(ev);
          } catch {
            setSelected(null);
          }
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load calendar");
    } finally {
      setLoading(false);
    }
  }, [enabled, view, focusId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(
    () => filterEventsForLocation(events, locationId),
    [events, locationId],
  );

  const grouped = useMemo(() => {
    const days = daysForFieldCalendarView(view);
    return groupEventsByDay(visible, days).filter((g) => g.events.length > 0 || view !== "agenda");
  }, [visible, view]);

  async function submitCreate() {
    const trimmed = title.trim();
    if (!trimmed || !startsAt) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: trimmed,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt || startsAt).toISOString(),
        allDay,
        createDefaultReminder: true,
      };
      if (description.trim()) body.description = description.trim();
      if (locationId) body.siteId = locationId;
      const created = await fieldCalendarApi.createEvent(body);
      setCompose(false);
      setTitle("");
      setDescription("");
      setSelected(created);
      await refresh();
      router.replace(`/calendar/?eventId=${encodeURIComponent(created.sourceEventId || created.id)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create event");
    } finally {
      setSaving(false);
    }
  }

  if (!enabled) {
    return (
      <>
        <h1 className="ff-page-title">Calendar</h1>
        <EmptyState
          title="Calendar not enabled"
          message="Ask an admin to enable the Calendar module for this company."
        />
      </>
    );
  }

  if (selected && !compose) {
    return (
      <>
        <button type="button" className="ff-link-btn" onClick={() => setSelected(null)}>
          ← Back to calendar
        </button>
        <h1 className="ff-page-title">{selected.title || "Event"}</h1>
        <p className="ff-page-body">{eventDisplayWhen(selected)}</p>
        {selected.startsAt ? (
          <p className="ff-hint ff-hint--left">
            {new Date(selected.startsAt).toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: selected.allDay ? undefined : "numeric",
              minute: selected.allDay ? undefined : "2-digit",
            })}
          </p>
        ) : null}
        {selected.description ? <p className="ff-page-body">{selected.description}</p> : null}
        {selected.category?.name ? (
          <p className="ff-hint ff-hint--left">Category: {selected.category.name}</p>
        ) : null}
        {selected.taskId ? (
          <button
            type="button"
            className="ff-btn ff-btn-secondary"
            style={{ marginTop: 12 }}
            onClick={() => router.push(`/tasks/item/${encodeURIComponent(selected.taskId!)}/`)}
          >
            Open related task
          </button>
        ) : null}
      </>
    );
  }

  return (
    <>
      <h1 className="ff-page-title">Calendar</h1>
      <p className="ff-page-body">Agenda and short-range views for your Location.</p>
      <OrgContextBar />

      <div className="ff-tabs" role="tablist" aria-label="Calendar view" style={{ marginTop: 12 }}>
        {FIELD_CALENDAR_VIEWS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={view === id ? "ff-tab ff-tab-active" : "ff-tab"}
            onClick={() => {
              setView(id);
              router.replace(`/calendar/?view=${encodeURIComponent(id)}`);
            }}
          >
            {id === "3-day" ? "3 Day" : id.charAt(0).toUpperCase() + id.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" className="ff-btn" onClick={() => setCompose(true)}>
          New event
        </button>
        <button type="button" className="ff-btn ff-btn-secondary" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {compose ? (
        <section className="ff-section" aria-labelledby="create-event-heading">
          <h2 id="create-event-heading" className="ff-section-title">
            New event
          </h2>
          <label className="ff-label" htmlFor="cal-title">
            Title
          </label>
          <input
            id="cal-title"
            className="ff-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title"
          />
          <label className="ff-label" htmlFor="cal-start">
            Starts
          </label>
          <input
            id="cal-start"
            className="ff-input"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <label className="ff-label" htmlFor="cal-end">
            Ends
          </label>
          <input
            id="cal-end"
            className="ff-input"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
          <label className="ff-check-row" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day
          </label>
          <label className="ff-label" htmlFor="cal-desc">
            Notes
          </label>
          <textarea
            id="cal-desc"
            className="ff-input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="ff-btn"
              disabled={saving || !title.trim()}
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

      {loading ? <LoadingState label="Loading calendar…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

      {!loading && !error ? (
        <div className="ff-task-list" style={{ marginTop: 12 }}>
          {grouped.every((g) => g.events.length === 0) ? (
            <EmptyState title="No events in this range" message="Create an event or widen the view." />
          ) : (
            grouped.map(({ day, events: dayEvents }) => (
              <section key={day.toISOString()} className="ff-section" aria-label={formatDayLabel(day)}>
                <h2 className="ff-section-title">{formatDayLabel(day)}</h2>
                {dayEvents.length === 0 ? (
                  <p className="ff-hint ff-hint--left">No events</p>
                ) : (
                  dayEvents.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      className="ff-task-card"
                      onClick={() => setSelected(ev)}
                    >
                      <span className="ff-task-card__title">{ev.title || "Event"}</span>
                      <span className="ff-task-card__meta">{eventDisplayWhen(ev)}</span>
                    </button>
                  ))
                )}
              </section>
            ))
          )}
        </div>
      ) : null}
    </>
  );
}

export function CalendarHub() {
  return (
    <Suspense fallback={<LoadingState label="Loading calendar…" />}>
      <CalendarInner />
    </Suspense>
  );
}
