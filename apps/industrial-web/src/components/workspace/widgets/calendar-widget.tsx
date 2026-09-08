"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCalendarCompactStatus, useCalendarWidgetData } from "@/hooks/use-calendar-widget";
import {
  formatDayLabel,
  formatTimeLabel,
  sameDay,
  startOfDay,
  toDateKey,
} from "@/lib/calendar/dates";
import {
  calendarCreateHref,
  calendarEventHref,
  isCalendarWidgetView,
  type CalendarEvent,
  type CalendarWidgetView,
} from "@/lib/calendar/types";
import {
  countEventsForDay,
  eventsForDay,
  groupEventsByDay,
  monthGridDays,
  weekDays,
  threeDayDays,
} from "@/lib/calendar/widget-range";
import type { WorkspaceWidgetSize } from "@/lib/workspace/types";
import { WORKSPACE_VIEW_LABELS } from "@/lib/workspace/types";

const VIEW_TABS: CalendarWidgetView[] = ["today", "3-day", "week", "month"];

type Props = {
  size: WorkspaceWidgetSize;
  view: string | undefined;
  onViewChange: (view: string) => void;
  moduleRoute: string;
};

function EventRow({ event }: { event: CalendarEvent }) {
  const time = event.allDay ? "All day" : formatTimeLabel(event.startsAt);
  return (
    <Link
      href={calendarEventHref(event)}
      className="forge-ws-cal-event d-flex align-items-start gap-2 text-decoration-none py-1"
    >
      <span className="text-muted small text-nowrap" style={{ minWidth: "4.25rem" }}>
        {time || "—"}
      </span>
      <span className="min-w-0">
        <span className="d-block text-heading small text-truncate fw-semibold">{event.title}</span>
        {event.category?.name ? (
          <span className="d-block text-muted small text-truncate">{event.category.name}</span>
        ) : null}
      </span>
    </Link>
  );
}

function DayGroup({ day, events }: { day: Date; events: CalendarEvent[] }) {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today.getTime() + 86400000);
  const label = sameDay(day, today)
    ? "Today"
    : sameDay(day, tomorrow)
      ? "Tomorrow"
      : formatDayLabel(day);

  return (
    <div className="mb-2">
      <div className="small fw-semibold text-heading mb-1">{label}</div>
      {events.length === 0 ? (
        <p className="text-muted small mb-0">No events</p>
      ) : (
        events.map((ev) => <EventRow key={ev.id} event={ev} />)
      )}
    </div>
  );
}

function EmptySchedule() {
  return (
    <div className="text-center py-2">
      <p className="text-muted small mb-2">No events scheduled.</p>
      <Link href={calendarCreateHref()} className="btn btn-sm btn-outline-primary">
        + Create Event
      </Link>
    </div>
  );
}

function WeekBody({ events }: { events: CalendarEvent[] }) {
  const days = weekDays(new Date());
  return (
    <div className="forge-ws-cal-week">
      {days.map((day) => {
        const dayEvents = eventsForDay(events, day).slice(0, 3);
        const count = countEventsForDay(events, day);
        return (
          <div key={toDateKey(day)} className="forge-ws-cal-week-col mb-2">
            <div className="small fw-semibold text-muted mb-1">
              {day.toLocaleDateString(undefined, { weekday: "short" })}
              <span className="ms-1">{day.getDate()}</span>
              <span className="ms-1 fw-normal">
                · {count} {count === 1 ? "Event" : "Events"}
              </span>
            </div>
            {dayEvents.length === 0 ? (
              <p className="text-muted small mb-0">—</p>
            ) : (
              dayEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href={calendarEventHref(ev)}
                  className="d-block small text-truncate text-decoration-none mb-1"
                  title={ev.title}
                >
                  <span className="text-muted">{formatTimeLabel(ev.startsAt)} </span>
                  {ev.title}
                </Link>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonthBody({
  events,
  selected,
  onSelect,
}: {
  events: CalendarEvent[];
  selected: Date;
  onSelect: (day: Date) => void;
}) {
  const today = startOfDay(new Date());
  const cells = monthGridDays(today);
  const selectedEvents = eventsForDay(events, selected).slice(0, 6);

  return (
    <div>
      <div className="small text-muted mb-2 text-uppercase">
        {today.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
      </div>
      <div className="forge-ws-cal-month mb-2" role="grid" aria-label="Month">
        {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
          <div key={`${label}-${index}`} className="forge-ws-cal-month-head text-muted small text-center">
            {label}
          </div>
        ))}
        {cells.map((day) => {
          const count = countEventsForDay(events, day);
          const isToday = sameDay(day, today);
          const isSelected = sameDay(day, selected);
          const inMonth = day.getMonth() === today.getMonth();
          return (
            <button
              key={toDateKey(day)}
              type="button"
              role="gridcell"
              className={[
                "forge-ws-cal-month-cell btn btn-sm",
                isSelected ? "btn-primary" : "btn-outline-secondary",
                !inMonth ? "opacity-50" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={isToday ? "date" : undefined}
              aria-selected={isSelected}
              aria-label={`${formatDayLabel(day)}${count ? `, ${count} events` : ""}`}
              onClick={() => onSelect(day)}
            >
              <span className={isToday && !isSelected ? "fw-bold" : undefined}>{day.getDate()}</span>
              {count > 0 ? <span className="forge-ws-cal-dot" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <div className="small text-muted mb-1">Selected: {formatDayLabel(selected)}</div>
      {selectedEvents.length === 0 ? (
        <p className="text-muted small mb-0">No events</p>
      ) : (
        selectedEvents.map((ev) => <EventRow key={ev.id} event={ev} />)
      )}
    </div>
  );
}

function AgendaForView({
  view,
  events,
  maxPerDay,
}: {
  view: CalendarWidgetView;
  events: CalendarEvent[];
  maxPerDay: number;
}) {
  const today = startOfDay(new Date());

  if (view === "today") {
    const list = eventsForDay(events, today).slice(0, maxPerDay);
    if (list.length === 0) return <EmptySchedule />;
    return (
      <>
        {list.map((ev) => (
          <EventRow key={ev.id} event={ev} />
        ))}
      </>
    );
  }

  if (view === "3-day") {
    const groups = groupEventsByDay(events, threeDayDays(today));
    const any = groups.some((g) => g.events.length > 0);
    if (!any) return <EmptySchedule />;
    return (
      <>
        {groups.map(({ day, events: dayEvents }) => (
          <DayGroup key={toDateKey(day)} day={day} events={dayEvents.slice(0, maxPerDay)} />
        ))}
      </>
    );
  }

  if (view === "week") {
    if (events.length === 0) return <EmptySchedule />;
    return <WeekBody events={events} />;
  }

  return null;
}

/**
 * Live Calendar workspace widget — today / 3-day / week / month.
 */
export function CalendarWorkspaceWidget({ size, view: viewProp, onViewChange, moduleRoute }: Props) {
  const view: CalendarWidgetView = isCalendarWidgetView(viewProp) ? viewProp : "3-day";
  const { status, error, events, refresh } = useCalendarWidgetData(view, true);
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));

  const showTabs = size !== "compact";
  const maxPerDay = size === "medium" ? 4 : size === "wide" ? 6 : 8;
  const totalCount = useMemo(() => events.length, [events]);

  return (
    <div className="forge-ws-cal d-flex flex-column h-100">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        {showTabs ? (
          <div className="btn-group btn-group-sm flex-wrap" role="group" aria-label="Calendar view">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`btn ${view === tab ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => onViewChange(tab)}
              >
                {tab === "3-day" ? "3 Days" : (WORKSPACE_VIEW_LABELS[tab] ?? tab)}
              </button>
            ))}
          </div>
        ) : null}
        <Link href={calendarCreateHref()} className="btn btn-sm btn-outline-primary">
          + Event
        </Link>
      </div>

      <div className="flex-grow-1 overflow-auto forge-ws-cal-scroll">
        {status === "loading" ? <p className="text-muted small mb-0">Loading schedule…</p> : null}

        {status === "error" ? (
          <div>
            <p className="text-danger small mb-2">{error ?? "Unable to load schedule."}</p>
            <div className="d-flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void refresh()}>
                Try Again
              </button>
              <Link href={moduleRoute} className="btn btn-sm btn-outline-primary">
                Open Calendar
              </Link>
            </div>
          </div>
        ) : null}

        {status === "loaded" || status === "empty"
          ? view === "month"
            ? (
                <MonthBody events={events} selected={selectedDay} onSelect={setSelectedDay} />
              )
            : (
                <AgendaForView view={view} events={events} maxPerDay={maxPerDay} />
              )
          : null}
      </div>

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2 pt-2 border-top">
        <span className="text-muted small">
          {status === "loaded" ? `${totalCount} event${totalCount === 1 ? "" : "s"}` : "\u00a0"}
        </span>
        <Link href={moduleRoute} className="small">
          Open Calendar →
        </Link>
      </div>
    </div>
  );
}

/** Live compact caption: "3 events today" (falls back while loading/error). */
export function CalendarCompactCaption({ fallback }: { fallback: string }) {
  const { label, status } = useCalendarCompactStatus(true);
  if (status === "loading") return <>Loading…</>;
  if (status === "error") return <>{fallback}</>;
  return <>{label}</>;
}
