export type FieldWorkKind = "training" | "corrective_action" | "task" | "inspection";

export type FieldWorkItem = {
  kind: FieldWorkKind;
  id: string;
  title: string;
  subtitle: string | null;
  dueAt: string | null;
  priority: string | null;
  status: string;
  estimatedMinutes: number | null;
  href: string;
  locationId?: string | null;
  locationName: string | null;
  divisionName?: string | null;
  departmentName?: string | null;
};

export type FieldMyWorkResult = {
  items: FieldWorkItem[];
  counts: {
    totalOpen: number;
    overdue: number;
    dueToday: number;
    dueNow: number;
    training: number;
    correctiveActions: number;
    tasks: number;
  };
  personnelId: string | null;
};

export type TaskDueTab = "all" | "today" | "overdue" | "completed";

/** Spec My Work kind filters. */
export type TaskKindFilter =
  | "all"
  | "tasks"
  | "inspections"
  | "corrective_actions"
  | "training";

export type DueBucket = "overdue" | "dueNow" | "dueToday" | "upcoming" | "none";

function startOfLocalDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfLocalDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function classifyDue(dueAt: string | null, now = new Date()): DueBucket {
  if (!dueAt) return "none";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "none";
  if (due.getTime() < now.getTime()) return "overdue";
  const sod = startOfLocalDay(now).getTime();
  const eod = endOfLocalDay(now).getTime();
  const t = due.getTime();
  if (t <= now.getTime() + 2 * 60 * 60 * 1000) return "dueNow";
  if (t >= sod && t <= eod) return "dueToday";
  return "upcoming";
}

export function formatDueLabel(dueAt: string | null, now = new Date()): string {
  if (!dueAt) return "No due date";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "No due date";
  const bucket = classifyDue(dueAt, now);
  if (bucket === "overdue") return "Overdue";
  const sameDay =
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate();
  if (sameDay) {
    return `Due ${due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  return `Due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function kindLabel(kind: FieldWorkKind): string {
  if (kind === "training") return "Training";
  if (kind === "corrective_action") return "Corrective Action";
  if (kind === "inspection") return "Inspection";
  return "Task";
}

export function statusLabel(status: string): string {
  const raw = status.trim();
  if (!raw) return "Unknown";
  const key = raw.toUpperCase().replace(/\s+/g, "_");
  const map: Record<string, string> = {
    NOT_STARTED: "Not Started",
    OPEN: "Not Started",
    ASSIGNED: "Not Started",
    ACTIVE: "In Progress",
    IN_PROGRESS: "In Progress",
    WAITING: "Waiting",
    SUBMITTED: "Submitted",
    APPROVED: "Approved",
    RETURNED: "Returned",
    COMPLETED: "Completed",
    PASSED: "Completed",
    DONE: "Completed",
    OVERDUE: "Overdue",
    CANCELLED: "Cancelled",
    CANCELED: "Cancelled",
  };
  if (map[key]) return map[key];
  return raw
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isCompletedStatus(status: string): boolean {
  return /complete|passed|done/i.test(status);
}

/** @deprecated use TaskDueTab */
export type TaskTab = TaskDueTab;

export function filterTasksForKind(
  items: FieldWorkItem[],
  kind: TaskKindFilter,
): FieldWorkItem[] {
  if (kind === "all") return items;
  if (kind === "tasks") return items.filter((item) => item.kind === "task");
  if (kind === "training") return items.filter((item) => item.kind === "training");
  if (kind === "corrective_actions") {
    return items.filter((item) => item.kind === "corrective_action");
  }
  if (kind === "inspections") {
    return items.filter((item) => item.kind === "inspection");
  }
  return [];
}

export function filterTasksForLocation(
  items: FieldWorkItem[],
  locationId: string | null | undefined,
): FieldWorkItem[] {
  if (!locationId) return items;
  return items.filter((item) => {
    if (!item.locationId) return true; // keep unscoped work visible
    return item.locationId === locationId;
  });
}

export function filterTasksForDivision(
  items: FieldWorkItem[],
  divisionName: string | null | undefined,
): FieldWorkItem[] {
  if (!divisionName) return items;
  return items.filter((item) => {
    if (!item.divisionName) return true;
    return item.divisionName === divisionName;
  });
}

export function filterTasksForTab(
  items: FieldWorkItem[],
  tab: TaskDueTab,
  now = new Date(),
): FieldWorkItem[] {
  if (tab === "completed") {
    return items.filter((item) => isCompletedStatus(item.status));
  }
  const open = items.filter((item) => !isCompletedStatus(item.status));
  if (tab === "all") return open;
  if (tab === "overdue") return open.filter((item) => classifyDue(item.dueAt, now) === "overdue");
  return open.filter((item) => {
    const bucket = classifyDue(item.dueAt, now);
    return bucket === "overdue" || bucket === "dueNow" || bucket === "dueToday";
  });
}

export function groupOpenTasks(items: FieldWorkItem[], now = new Date()) {
  const dueNow: FieldWorkItem[] = [];
  const dueToday: FieldWorkItem[] = [];
  const upcoming: FieldWorkItem[] = [];
  for (const item of items) {
    if (isCompletedStatus(item.status)) continue;
    const bucket = classifyDue(item.dueAt, now);
    if (bucket === "overdue" || bucket === "dueNow") dueNow.push(item);
    else if (bucket === "dueToday") dueToday.push(item);
    else upcoming.push(item);
  }
  return { dueNow, dueToday, upcoming };
}

export function parseKindFilter(raw: string | null | undefined): TaskKindFilter {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "tasks" || value === "task") return "tasks";
  if (value === "training") return "training";
  if (
    value === "corrective" ||
    value === "corrective_actions" ||
    value === "corrective-actions" ||
    value === "ca"
  ) {
    return "corrective_actions";
  }
  if (value === "inspections" || value === "inspection") return "inspections";
  return "all";
}

export function orgContextLine(item: FieldWorkItem): string | null {
  const parts = [item.divisionName, item.locationName, item.departmentName].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
