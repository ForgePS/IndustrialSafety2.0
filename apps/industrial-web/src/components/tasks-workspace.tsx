"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { isProducersRiceMillTenant } from "@/lib/producers-mvr-policy";
import { canDeleteTask } from "@/lib/form-signatory";
import {
  filterTaskAssigneePersonnel,
  type TaskAssigneePerson,
} from "@/lib/task-assignees";
import { filterTasksForWidgetView } from "@/lib/tasks/widget-filter";

type Progress = { done: number; total: number };

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  overdue?: boolean;
  assigneeName?: string | null;
  assigneePersonnelId?: string | null;
  deadlineDate?: string | null;
  dueDate?: string | null;
  createdByUserId?: string | null;
  subtaskProgress?: Progress;
  checklistProgress?: Progress;
  reminderCount?: number;
  linkedEventCount?: number;
};

type DetailItem = {
  id: string;
  title: string;
  isDone: boolean;
  sortOrder: number;
};

type ActivityItem = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string | null;
};

type TaskDetail = {
  subtasks: DetailItem[];
  checklist: DetailItem[];
  activity: ActivityItem[];
};

type PersonnelOption = TaskAssigneePerson;
type TaskView = "active" | "all" | "mine" | "assigned" | "overdue" | "completed" | "today" | "week";

const REMINDER_PRESETS = [
  { label: "15m", minutes: 15 },
  { label: "1h", minutes: 60 },
  { label: "1d", minutes: 1440 },
] as const;

function personLabel(person: PersonnelOption): string {
  const name = String(person.displayName ?? "").trim() || "Unnamed";
  const emp = String(person.employeeNumber ?? "").trim();
  return emp ? `${name} (${emp})` : name;
}

function sortPersonnel(people: PersonnelOption[]): PersonnelOption[] {
  return [...people].sort((a, b) =>
    personLabel(a).localeCompare(personLabel(b), undefined, { sensitivity: "base" }),
  );
}

function progressLabel(p?: Progress): string | null {
  if (!p || !p.total) return null;
  return `${p.done}/${p.total}`;
}

export function TasksWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const searchParams = useSearchParams();
  const deepLinkHandled = useRef(false);
  const [items, setItems] = useState<Task[]>([]);
  const [personnel, setPersonnel] = useState<PersonnelOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [assigneePersonnelId, setAssigneePersonnelId] = useState("");
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<TaskView>("active");
  const [focusCreate, setFocusCreate] = useState(false);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [checklistTitle, setChecklistTitle] = useState("");

  const canDelete = useMemo(
    () =>
      (task: Task) =>
        canDeleteTask({
          isPlatformAdmin: me?.isPlatformAdmin,
          activeProducts: me?.activeProducts,
          permissions: me?.permissions,
          actorUserId: me?.userId,
          createdByUserId: task.createdByUserId,
        }),
    [me],
  );

  const activeTenant = useMemo(() => {
    if (!me) return null;
    return (
      me.tenants?.find((tenant) => tenant.tenantId === me.tenantId) ?? me.tenants?.[0] ?? null
    );
  }, [me]);

  const restrictAssigneesToSafetyOrEhs = isProducersRiceMillTenant(
    activeTenant?.slug,
    activeTenant?.displayName,
  );

  const createAssigneeOptions = useMemo(
    () =>
      sortPersonnel(
        filterTaskAssigneePersonnel(personnel, {
          restrictToSafetyOrEhs: restrictAssigneesToSafetyOrEhs,
        }),
      ),
    [personnel, restrictAssigneesToSafetyOrEhs],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("q", filter);
      if (view === "all") params.set("view", "all");
      else if (view === "mine") params.set("view", "mine");
      else if (view === "assigned") params.set("view", "assigned");
      else if (view === "overdue") params.set("view", "overdue");
      else if (view === "completed") params.set("view", "completed");
      // today / week / active → default active list (no view param)
      const q = params.toString() ? `?${params}` : "";
      const [taskPage, peoplePage] = await Promise.all([
        apiGet<{ items: Task[] }>(`/api/v1/industrial/tasks${q}`),
        apiGet<{ items: PersonnelOption[] }>("/api/v1/industrial/personnel", {
          query: { page: "1", pageSize: "500" },
        }).catch(() => ({ items: [] as PersonnelOption[] })),
      ]);
      setItems(taskPage.items ?? []);
      setPersonnel(peoplePage.items ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to load tasks");
    } finally {
      setLoading(false);
    }
  }, [filter, view]);

  const loadDetail = useCallback(async (taskId: string) => {
    setDetailLoading(true);
    try {
      const data = await apiGet<TaskDetail>(
        `/api/v1/industrial/tasks/${encodeURIComponent(taskId)}/detail`,
      );
      setDetail(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to load task detail");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Deep links from workspace widget: ?create=1, ?taskId=, ?view=
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const create = searchParams.get("create");
    const taskId = searchParams.get("taskId");
    const viewParam = searchParams.get("view");

    if (viewParam) {
      const allowed: TaskView[] = [
        "active",
        "all",
        "mine",
        "assigned",
        "overdue",
        "completed",
        "today",
        "week",
      ];
      if (allowed.includes(viewParam as TaskView)) {
        setView(viewParam as TaskView);
      }
    }

    if (create === "1") {
      deepLinkHandled.current = true;
      setFocusCreate(true);
      return;
    }

    if (taskId) {
      deepLinkHandled.current = true;
      setHighlightTaskId(taskId);
      setExpandedId(taskId);
      return;
    }

    if (viewParam) {
      deepLinkHandled.current = true;
    }
  }, [searchParams]);

  const displayedItems = useMemo(() => {
    if (view === "today") return filterTasksForWidgetView(items, "today");
    if (view === "week") return filterTasksForWidgetView(items, "week");
    return items;
  }, [items, view]);

  useEffect(() => {
    if (!focusCreate) return;
    const el = document.getElementById("task-create-title");
    el?.focus();
    setFocusCreate(false);
  }, [focusCreate]);

  useEffect(() => {
    if (!highlightTaskId || loading) return;
    const row = document.getElementById(`task-row-${highlightTaskId}`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightTaskId, loading, displayedItems]);

  useEffect(() => {
    if (!assigneePersonnelId) return;
    if (createAssigneeOptions.some((person) => person.id === assigneePersonnelId)) return;
    setAssigneePersonnelId("");
  }, [assigneePersonnelId, createAssigneeOptions]);

  useEffect(() => {
    if (!expandedId) {
      setDetail(null);
      return;
    }
    void loadDetail(expandedId);
  }, [expandedId, loadDetail]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/api/v1/industrial/tasks", "POST", {
        title,
        priority,
        deadlineDate: deadlineDate || undefined,
        assigneePersonnelId: assigneePersonnelId || undefined,
        status: "assigned",
      });
      setTitle("");
      setDeadlineDate("");
      setAssigneePersonnelId("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create task");
    }
  }

  async function transition(task: Task) {
    const action =
      task.status === "assigned"
        ? "acknowledge"
        : task.status === "acknowledged"
          ? "start"
          : "complete";
    await apiSend(`/api/v1/industrial/tasks/${task.id}/${action}`, "POST", {});
    await load();
    if (expandedId === task.id) await loadDetail(task.id);
  }

  async function reassign(task: Task, nextAssigneeId: string) {
    if ((task.assigneePersonnelId ?? "") === nextAssigneeId) return;
    setSavingId(task.id);
    try {
      await apiSend(`/api/v1/industrial/tasks/${encodeURIComponent(task.id)}`, "PATCH", {
        assigneePersonnelId: nextAssigneeId || null,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to reassign task");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteTask(task: Task) {
    if (!canDelete(task)) return;
    if (!window.confirm(`Delete "${task.title}"?\n\nThis removes the task from the list.`)) return;
    setDeletingId(task.id);
    try {
      await apiSend(`/api/v1/industrial/tasks/${encodeURIComponent(task.id)}/archive`, "POST", {});
      if (expandedId === task.id) setExpandedId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to delete task");
    } finally {
      setDeletingId(null);
    }
  }

  async function addSubtask() {
    if (!expandedId || !subtaskTitle.trim()) return;
    try {
      await apiSend(`/api/v1/industrial/tasks/${encodeURIComponent(expandedId)}/subtasks`, "POST", {
        title: subtaskTitle.trim(),
      });
      setSubtaskTitle("");
      await loadDetail(expandedId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to add subtask");
    }
  }

  async function toggleSubtask(item: DetailItem) {
    if (!expandedId) return;
    try {
      await apiSend(
        `/api/v1/industrial/tasks/${encodeURIComponent(expandedId)}/subtasks/${encodeURIComponent(item.id)}`,
        "PATCH",
        { isDone: !item.isDone },
      );
      await loadDetail(expandedId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update subtask");
    }
  }

  async function addChecklist() {
    if (!expandedId || !checklistTitle.trim()) return;
    try {
      await apiSend(`/api/v1/industrial/tasks/${encodeURIComponent(expandedId)}/checklist`, "POST", {
        title: checklistTitle.trim(),
      });
      setChecklistTitle("");
      await loadDetail(expandedId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to add checklist item");
    }
  }

  async function toggleChecklist(item: DetailItem) {
    if (!expandedId) return;
    try {
      await apiSend(
        `/api/v1/industrial/tasks/${encodeURIComponent(expandedId)}/checklist/${encodeURIComponent(item.id)}`,
        "PATCH",
        { isDone: !item.isDone },
      );
      await loadDetail(expandedId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update checklist");
    }
  }

  async function addReminders(minutes: number[]) {
    if (!expandedId) return;
    try {
      await apiSend(`/api/v1/industrial/tasks/${encodeURIComponent(expandedId)}/reminders`, "POST", {
        offsetsMinutes: minutes,
      });
      await loadDetail(expandedId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create reminders");
    }
  }

  function reassignOptionsFor(task: Task): PersonnelOption[] {
    return sortPersonnel(
      filterTaskAssigneePersonnel(personnel, {
        restrictToSafetyOrEhs: restrictAssigneesToSafetyOrEhs,
        ...(task.assigneePersonnelId ? { alwaysIncludeIds: [task.assigneePersonnelId] } : {}),
      }),
    );
  }

  const views: Array<{ id: TaskView; label: string }> = [
    { id: "active", label: "Active" },
    { id: "today", label: "Today" },
    { id: "week", label: "This week" },
    { id: "mine", label: "My tasks" },
    { id: "assigned", label: "Assigned to me" },
    { id: "overdue", label: "Overdue" },
    { id: "completed", label: "Completed" },
    { id: "all", label: "All" },
  ];

  return (
    <section aria-labelledby="tasks-title">
      <ModuleWorkspaceHeader
        id="tasks-title"
        eyebrow="Coordination"
        title={moduleName}
        description="Assign work, track subtasks and checklists, and set reminders."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="d-flex flex-wrap gap-2 mb-3">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`btn btn-sm ${view === v.id ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="card border shadow-none mb-4">
        <div className="card-header">
          <h6 className="card-title mb-0">Create task</h6>
        </div>
        <div className="card-body">
          <form onSubmit={(e) => void createTask(e)}>
            <div className="row g-3 align-items-end">
              <div className="col-md-4">
                <label className="form-label" htmlFor="task-create-title">
                  Title
                </label>
                <input
                  id="task-create-title"
                  className="form-control form-control-sm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="col-md-2">
                <label className="form-label" htmlFor="task-priority">
                  Priority
                </label>
                <select
                  id="task-priority"
                  className="form-select form-select-sm"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  {["Low", "Medium", "High", "Urgent"].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label" htmlFor="task-deadline">
                  Due date
                </label>
                <input
                  id="task-deadline"
                  className="form-control form-control-sm"
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="task-assignee">
                  Assign to
                </label>
                <select
                  id="task-assignee"
                  className="form-select form-select-sm"
                  value={assigneePersonnelId}
                  onChange={(e) => setAssigneePersonnelId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {createAssigneeOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {personLabel(person)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-1">
                <button type="submit" className="btn btn-primary btn-sm w-100">
                  Create
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <FilterPanel
        searchId="tasks-search"
        searchValue={filter}
        onSearchChange={setFilter}
        searchPlaceholder="Search tasks…"
        chips={filter ? [{ id: "q", label: `Search: ${filter}`, onRemove: () => setFilter("") }] : []}
        onClearAll={() => {
          setFilter("");
          void load();
        }}
        onSubmit={() => void load()}
      />

      <div className="card border shadow-none">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Priority</th>
                <th scope="col">Due</th>
                <th scope="col">Status</th>
                <th scope="col">Assignee</th>
                <th scope="col" className="text-end">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedItems.map((task) => {
                const open = expandedId === task.id;
                const highlighted = highlightTaskId === task.id;
                const sub = progressLabel(task.subtaskProgress);
                const chk = progressLabel(task.checklistProgress);
                return (
                  <Fragment key={task.id}>
                    <tr className={highlighted ? "table-active" : undefined} id={`task-row-${task.id}`}>
                      <td>
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 text-start"
                          onClick={() => setExpandedId(open ? null : task.id)}
                        >
                          <i className={`bx ${open ? "bx-chevron-down" : "bx-chevron-right"} me-1`} />
                          {task.title}
                        </button>
                        {task.overdue ? <span className="badge bg-label-danger ms-2">Overdue</span> : null}
                        <div className="small text-muted mt-1">
                          {sub ? <span className="me-2">Subtasks {sub}</span> : null}
                          {chk ? <span className="me-2">Checklist {chk}</span> : null}
                          {(task.reminderCount ?? 0) > 0 ? (
                            <Link className="me-2" href="/modules/reminders/">
                              {task.reminderCount} reminder{(task.reminderCount ?? 0) === 1 ? "" : "s"}
                            </Link>
                          ) : null}
                          {(task.linkedEventCount ?? 0) > 0 ? (
                            <Link href="/modules/calendar/">
                              {task.linkedEventCount} event{(task.linkedEventCount ?? 0) === 1 ? "" : "s"}
                            </Link>
                          ) : null}
                        </div>
                      </td>
                      <td>{task.priority}</td>
                      <td className="text-muted">{task.deadlineDate ?? task.dueDate ?? "—"}</td>
                      <td>
                        <span className="badge bg-label-secondary">{task.status}</span>
                      </td>
                      <td style={{ minWidth: "12rem" }}>
                        <select
                          className="form-select form-select-sm"
                          value={task.assigneePersonnelId ?? ""}
                          disabled={savingId === task.id}
                          onChange={(e) => void reassign(task, e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {reassignOptionsFor(task).map((person) => (
                            <option key={person.id} value={person.id}>
                              {personLabel(person)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="text-end">
                        <div className="d-inline-flex flex-wrap gap-1 justify-content-end">
                          {!["completed", "cancelled", "COMPLETED", "CANCELLED"].includes(task.status) ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              disabled={deletingId === task.id}
                              onClick={() => void transition(task)}
                            >
                              {task.status === "assigned"
                                ? "Acknowledge"
                                : task.status === "acknowledged"
                                  ? "Start"
                                  : "Complete"}
                            </button>
                          ) : null}
                          {canDelete(task) ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              disabled={deletingId === task.id}
                              onClick={() => void deleteTask(task)}
                            >
                              {deletingId === task.id ? "Deleting…" : "Delete"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr>
                        <td colSpan={6} className="bg-label-secondary bg-opacity-10">
                          {detailLoading || !detail ? (
                            <div className="p-3 text-muted small">Loading detail…</div>
                          ) : (
                            <div className="row g-3 p-3">
                              <div className="col-md-4">
                                <h6 className="mb-2">Subtasks</h6>
                                <ul className="list-unstyled mb-2">
                                  {detail.subtasks.map((s) => (
                                    <li key={s.id} className="form-check">
                                      <input
                                        className="form-check-input"
                                        type="checkbox"
                                        checked={s.isDone}
                                        id={`sub-${s.id}`}
                                        onChange={() => void toggleSubtask(s)}
                                      />
                                      <label className="form-check-label" htmlFor={`sub-${s.id}`}>
                                        {s.title}
                                      </label>
                                    </li>
                                  ))}
                                  {detail.subtasks.length === 0 ? (
                                    <li className="text-muted small">No subtasks yet.</li>
                                  ) : null}
                                </ul>
                                <div className="input-group input-group-sm">
                                  <input
                                    className="form-control"
                                    placeholder="Add subtask"
                                    value={subtaskTitle}
                                    onChange={(e) => setSubtaskTitle(e.target.value)}
                                  />
                                  <button type="button" className="btn btn-outline-primary" onClick={() => void addSubtask()}>
                                    Add
                                  </button>
                                </div>
                              </div>
                              <div className="col-md-4">
                                <h6 className="mb-2">Checklist</h6>
                                <ul className="list-unstyled mb-2">
                                  {detail.checklist.map((c) => (
                                    <li key={c.id} className="form-check">
                                      <input
                                        className="form-check-input"
                                        type="checkbox"
                                        checked={c.isDone}
                                        id={`chk-${c.id}`}
                                        onChange={() => void toggleChecklist(c)}
                                      />
                                      <label className="form-check-label" htmlFor={`chk-${c.id}`}>
                                        {c.title}
                                      </label>
                                    </li>
                                  ))}
                                  {detail.checklist.length === 0 ? (
                                    <li className="text-muted small">No checklist items.</li>
                                  ) : null}
                                </ul>
                                <div className="input-group input-group-sm">
                                  <input
                                    className="form-control"
                                    placeholder="Add checklist item"
                                    value={checklistTitle}
                                    onChange={(e) => setChecklistTitle(e.target.value)}
                                  />
                                  <button
                                    type="button"
                                    className="btn btn-outline-primary"
                                    onClick={() => void addChecklist()}
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>
                              <div className="col-md-4">
                                <h6 className="mb-2">Reminders</h6>
                                <div className="d-flex flex-wrap gap-2 mb-3">
                                  {REMINDER_PRESETS.map((p) => (
                                    <button
                                      key={p.minutes}
                                      type="button"
                                      className="btn btn-sm btn-outline-secondary"
                                      onClick={() => void addReminders([p.minutes])}
                                    >
                                      + {p.label}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={() => void addReminders([15, 60, 1440])}
                                  >
                                    All presets
                                  </button>
                                </div>
                                <h6 className="mb-2">Activity</h6>
                                <ul className="list-unstyled small mb-0" style={{ maxHeight: 160, overflow: "auto" }}>
                                  {detail.activity.map((a) => (
                                    <li key={a.id} className="mb-1">
                                      <span className="fw-semibold">{a.action}</span>
                                      <span className="text-muted ms-1">
                                        {a.createdAt ? new Date(a.createdAt).toLocaleString() : ""}
                                      </span>
                                    </li>
                                  ))}
                                  {detail.activity.length === 0 ? (
                                    <li className="text-muted">No activity yet.</li>
                                  ) : null}
                                </ul>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted text-center py-4">
                    {loading ? "Loading…" : "No tasks match this view."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
