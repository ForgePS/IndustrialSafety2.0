"use client";
import { useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  overdue?: boolean;
  assigneeName?: string | null;
  deadlineDate?: string | null;
};

export function TasksWorkspace({ moduleName }: { moduleName: string }) {
  const [items, setItems] = useState<Task[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [filter, setFilter] = useState("");

  async function load() {
    setLoading(true);
    try {
      const q = filter ? `?q=${encodeURIComponent(filter)}` : "";
      setItems((await apiGet<{ items: Task[] }>(`/api/v1/industrial/tasks${q}`)).items);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/api/v1/industrial/tasks", "POST", {
        title,
        priority,
        deadlineDate: deadlineDate || undefined,
        status: "assigned",
      });
      setTitle("");
      setDeadlineDate("");
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
  }

  return (
    <section aria-labelledby="tasks-title">
      <ModuleWorkspaceHeader
        id="tasks-title"
        eyebrow="Coordination"
        title={moduleName}
        description="Assigned work, acknowledgements, and completion tracking."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="card border shadow-none mb-4">
        <div className="card-header">
          <h6 className="card-title mb-0">Create task</h6>
        </div>
        <div className="card-body">
          <form onSubmit={(e) => void createTask(e)}>
            <div className="row g-3 align-items-end">
              <div className="col-md-5">
                <label className="form-label" htmlFor="task-title">
                  Title
                </label>
                <input
                  id="task-title"
                  className="form-control form-control-sm"
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="task-priority">
                  Priority
                </label>
                <select
                  id="task-priority"
                  className="form-select form-select-sm"
                  name="priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  aria-label="Task priority"
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
                  name="deadlineDate"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                />
              </div>
              <div className="col-md-2">
                <button type="submit" className="btn btn-primary btn-sm w-100">
                  Create task
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
              {items.map((task) => (
                <tr key={task.id}>
                  <td>
                    {task.title}
                    {task.overdue ? (
                      <span className="badge bg-label-danger ms-2">Overdue</span>
                    ) : null}
                  </td>
                  <td>{task.priority}</td>
                  <td className="text-muted">{task.deadlineDate ?? "—"}</td>
                  <td>
                    <span className="badge bg-label-secondary">{task.status}</span>
                  </td>
                  <td>{task.assigneeName ?? "Unassigned"}</td>
                  <td className="text-end">
                    {!["completed", "cancelled"].includes(task.status) ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => void transition(task)}
                      >
                        Advance
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
