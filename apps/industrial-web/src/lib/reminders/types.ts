export type WorkspaceReminder = {
  id: string;
  title?: string | null;
  eventId?: string | null;
  taskId?: string | null;
  remindAt: string | null;
  channel: string;
  status: string;
  sentAt?: string | null;
};

export type RemindersWidgetView = "today" | "upcoming" | "sent" | "overdue" | "all";

export const REMINDERS_WIDGET_VIEWS: readonly RemindersWidgetView[] = [
  "today",
  "upcoming",
  "sent",
  "overdue",
  "all",
] as const;

export function isRemindersWidgetView(value: string | undefined | null): value is RemindersWidgetView {
  return (
    value === "today" ||
    value === "upcoming" ||
    value === "sent" ||
    value === "overdue" ||
    value === "all"
  );
}

export function isReminderPending(status: string): boolean {
  return status.toUpperCase() === "PENDING";
}

export function isReminderSent(status: string): boolean {
  return status.toUpperCase() === "SENT";
}

export function isReminderCancelled(status: string): boolean {
  return status.toUpperCase() === "CANCELLED" || status.toUpperCase() === "CANCELED";
}

export function remindersCreateHref(): string {
  return "/modules/reminders?create=1";
}

export function reminderHref(reminder: WorkspaceReminder): string {
  if (reminder.taskId) {
    return `/modules/tasks?taskId=${encodeURIComponent(reminder.taskId)}`;
  }
  if (reminder.eventId) {
    return `/modules/calendar?eventId=${encodeURIComponent(reminder.eventId)}`;
  }
  return `/modules/reminders?reminderId=${encodeURIComponent(reminder.id)}`;
}

export function remindersViewAllHref(view: RemindersWidgetView): string {
  if (view === "sent") return "/modules/reminders?status=SENT";
  if (view === "all") return "/modules/reminders?status=";
  if (view === "upcoming" || view === "today" || view === "overdue") {
    return `/modules/reminders?view=${encodeURIComponent(view)}`;
  }
  return "/modules/reminders";
}

export function reminderDisplayTitle(reminder: WorkspaceReminder): string {
  const title = String(reminder.title ?? "").trim();
  return title || "Reminder";
}
