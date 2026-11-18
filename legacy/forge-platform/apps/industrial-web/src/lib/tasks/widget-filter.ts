import { addDays, endOfDay, startOfDay, startOfWeek } from "@/lib/calendar/dates";

type DueFields = {
  deadlineDate?: string | null;
  dueDate?: string | null;
  status: string;
  overdue?: boolean;
};

function taskDueRaw(task: DueFields): string | null {
  const raw = task.deadlineDate || task.dueDate || null;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

function dueDateOnly(task: DueFields): Date | null {
  const raw = taskDueRaw(task);
  if (!raw) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return startOfDay(d);
}

export function isDueToday(task: DueFields, now: Date = new Date()): boolean {
  const due = dueDateOnly(task);
  if (!due) return false;
  return due.getTime() === startOfDay(now).getTime();
}

export function isDueThisWeek(task: DueFields, now: Date = new Date()): boolean {
  const due = dueDateOnly(task);
  if (!due) return false;
  const weekStart = startOfWeek(now);
  const weekEnd = endOfDay(addDays(weekStart, 6));
  return due.getTime() >= weekStart.getTime() && due.getTime() <= weekEnd.getTime();
}

export function formatTaskDueLabel(task: DueFields, now: Date = new Date()): string {
  const due = dueDateOnly(task);
  if (!due) return "No due date";
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  if (due.getTime() === today.getTime()) return "Today";
  if (due.getTime() === tomorrow.getTime()) return "Tomorrow";
  return due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function filterTasksForWidgetView<T extends DueFields>(
  tasks: readonly T[],
  view: "today" | "week" | "all-active",
  now: Date = new Date(),
): T[] {
  if (view === "today") return tasks.filter((t) => isDueToday(t, now));
  if (view === "week") return tasks.filter((t) => isDueThisWeek(t, now));
  return [...tasks];
}

export function summarizeTasks(tasks: readonly DueFields[], now: Date = new Date()) {
  const open = tasks.filter((t) => {
    const s = t.status.toLowerCase();
    return s !== "completed" && s !== "cancelled" && s !== "complete" && s !== "canceled";
  });
  return {
    open: open.length,
    dueToday: open.filter((t) => isDueToday(t, now)).length,
    dueThisWeek: open.filter((t) => isDueThisWeek(t, now)).length,
    overdue: open.filter((t) => Boolean(t.overdue)).length,
  };
}
