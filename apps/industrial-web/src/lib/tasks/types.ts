export type WorkspaceTask = {
  id: string;
  title: string;
  status: string;
  priority?: string | null;
  overdue?: boolean;
  assigneeName?: string | null;
  assigneePersonnelId?: string | null;
  deadlineDate?: string | null;
  dueDate?: string | null;
  createdByUserId?: string | null;
};

export type TasksWidgetView =
  | "my-tasks"
  | "today"
  | "week"
  | "overdue"
  | "assigned-to-me"
  | "assigned-by-me";

export const TASKS_WIDGET_VIEWS: readonly TasksWidgetView[] = [
  "my-tasks",
  "today",
  "week",
  "overdue",
  "assigned-to-me",
  "assigned-by-me",
] as const;

export function isTasksWidgetView(value: string | undefined | null): value is TasksWidgetView {
  return (
    value === "my-tasks" ||
    value === "today" ||
    value === "week" ||
    value === "overdue" ||
    value === "assigned-to-me" ||
    value === "assigned-by-me"
  );
}

/** Map widget view → industrial tasks list `view` query (omit for default active). */
export function tasksApiViewParam(view: TasksWidgetView): string | null {
  if (view === "overdue") return "overdue";
  if (view === "assigned-to-me") return "assigned";
  if (view === "assigned-by-me" || view === "my-tasks") return "mine";
  return null; // today / week use default active list + client filter
}

export function taskDueDate(task: WorkspaceTask): string | null {
  const raw = task.deadlineDate || task.dueDate || null;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

export function isTaskTerminal(status: string): boolean {
  const s = status.toLowerCase();
  return s === "completed" || s === "cancelled" || s === "complete" || s === "canceled";
}

export function nextTaskAction(status: string): "acknowledge" | "start" | "complete" {
  const s = status.toLowerCase();
  if (s === "assigned") return "acknowledge";
  if (s === "acknowledged") return "start";
  return "complete";
}

export function taskActionLabel(status: string): string {
  const action = nextTaskAction(status);
  if (action === "acknowledge") return "Acknowledge";
  if (action === "start") return "Start";
  return "Complete";
}

export function tasksCreateHref(): string {
  return "/modules/tasks?create=1";
}

export function taskHref(taskId: string): string {
  return `/modules/tasks?taskId=${encodeURIComponent(taskId)}`;
}

export function tasksViewAllHref(view: TasksWidgetView): string {
  if (view === "overdue") return "/modules/tasks?view=overdue";
  if (view === "assigned-to-me") return "/modules/tasks?view=assigned";
  if (view === "assigned-by-me" || view === "my-tasks") return "/modules/tasks?view=mine";
  if (view === "today") return "/modules/tasks?view=today";
  if (view === "week") return "/modules/tasks?view=week";
  return "/modules/tasks";
}

export function priorityLabel(priority: string | null | undefined): string {
  const p = String(priority ?? "").trim();
  if (!p) return "Normal";
  return p;
}
