import { addDays, endOfDay, startOfDay } from "@/lib/calendar/dates";
import {
  isReminderCancelled,
  isReminderPending,
  isReminderSent,
  type FieldReminder,
  type FieldRemindersView,
} from "@/lib/reminders/types";

function remindAtDate(reminder: FieldReminder): Date | null {
  if (!reminder.remindAt) return null;
  const d = new Date(reminder.remindAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isRemindAtToday(reminder: FieldReminder, now: Date = new Date()): boolean {
  const at = remindAtDate(reminder);
  if (!at) return false;
  return startOfDay(at).getTime() === startOfDay(now).getTime();
}

export function isUpcomingReminder(reminder: FieldReminder, now: Date = new Date()): boolean {
  if (!isReminderPending(reminder.status)) return false;
  const at = remindAtDate(reminder);
  if (!at) return false;
  return at.getTime() >= now.getTime();
}

export function isOverdueReminder(reminder: FieldReminder, now: Date = new Date()): boolean {
  if (isReminderCancelled(reminder.status)) return false;
  const at = remindAtDate(reminder);
  if (!at) return false;
  if (isReminderPending(reminder.status) && at.getTime() < now.getTime()) return true;
  if (isReminderSent(reminder.status) && at.getTime() < startOfDay(now).getTime()) return true;
  if (
    isReminderSent(reminder.status) &&
    isRemindAtToday(reminder, now) &&
    at.getTime() < now.getTime()
  ) {
    return true;
  }
  return false;
}

export function formatReminderWhen(reminder: FieldReminder, now: Date = new Date()): string {
  const at = remindAtDate(reminder);
  if (!at) return "—";
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  if (startOfDay(at).getTime() === today.getTime()) {
    return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (startOfDay(at).getTime() === tomorrow.getTime()) {
    return `Tomorrow ${at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  return at.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function filterRemindersForView(
  reminders: readonly FieldReminder[],
  view: FieldRemindersView,
  now: Date = new Date(),
): FieldReminder[] {
  const active = reminders.filter((r) => !isReminderCancelled(r.status));
  if (view === "all") return [...reminders];
  if (view === "sent") return reminders.filter((r) => isReminderSent(r.status));
  if (view === "today") return active.filter((r) => isRemindAtToday(r, now));
  if (view === "upcoming") {
    return active
      .filter((r) => isUpcomingReminder(r, now))
      .sort((a, b) => String(a.remindAt).localeCompare(String(b.remindAt)));
  }
  if (view === "overdue") return active.filter((r) => isOverdueReminder(r, now));
  return active;
}

export function snoozeRemindAt(from: Date = new Date(), hours = 1): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

export function snoozeRemindAtTomorrowMorning(from: Date = new Date()): Date {
  const d = addDays(startOfDay(from), 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

export function endOfToday(now: Date = new Date()): Date {
  return endOfDay(now);
}
