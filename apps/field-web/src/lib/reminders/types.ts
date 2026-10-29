export type FieldReminder = {
  id: string;
  title?: string | null;
  eventId?: string | null;
  taskId?: string | null;
  remindAt: string | null;
  channel: string;
  status: string;
  sentAt?: string | null;
};

export type FieldRemindersView = "today" | "upcoming" | "overdue" | "sent" | "all";

export const FIELD_REMINDERS_VIEWS: readonly FieldRemindersView[] = [
  "today",
  "upcoming",
  "overdue",
  "sent",
  "all",
] as const;

export function isFieldRemindersView(
  value: string | undefined | null,
): value is FieldRemindersView {
  return (
    value === "today" ||
    value === "upcoming" ||
    value === "overdue" ||
    value === "sent" ||
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

export function reminderDisplayTitle(reminder: FieldReminder): string {
  const title = String(reminder.title ?? "").trim();
  return title || "Reminder";
}

/** Field deep-links for related work items. */
export function reminderOpenHref(reminder: FieldReminder): string {
  if (reminder.taskId) {
    return `/tasks/item/${encodeURIComponent(reminder.taskId)}/`;
  }
  if (reminder.eventId) {
    return `/calendar/?eventId=${encodeURIComponent(reminder.eventId)}`;
  }
  return `/reminders/?reminderId=${encodeURIComponent(reminder.id)}`;
}
