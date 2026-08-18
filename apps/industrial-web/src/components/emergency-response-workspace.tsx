"use client";
import { useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";

const categories = ["eap", "scenarios", "drills", "responseTeams", "jsas"] as const;
type RecordRow = {
  id: string;
  title: string;
  category: string;
  status: string;
  planId?: string | null;
  eventDate?: string | null;
};

const CATEGORY_TABS = categories.map((c) => ({ id: c, label: c }));

export function EmergencyResponseWorkspace({ moduleName }: { moduleName: string }) {
  const [category, setCategory] = useState<(typeof categories)[number]>("eap");
  const [items, setItems] = useState<RecordRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [planId, setPlanId] = useState("");
  const [eventDate, setEventDate] = useState("");

  async function load() {
    setLoading(true);
    try {
      setItems(
        (await apiGet<{ items: RecordRow[] }>(`/api/v1/industrial/emergency-response/${category}`))
          .items,
      );
      setError("");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Unable to load emergency response records",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  async function createRecord(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiSend(`/api/v1/industrial/emergency-response/${category}`, "POST", {
        title,
        status: "draft",
        planId: planId || undefined,
        eventDate: eventDate || undefined,
      });
      setTitle("");
      setPlanId("");
      setEventDate("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create record");
    }
  }

  return (
    <section aria-labelledby="emergency-title">
      <ModuleWorkspaceHeader
        id="emergency-title"
        eyebrow="Coordination"
        title={moduleName}
        description="Compliance plans, scenarios, drills, response teams, and JSAs. This is not a CAD or 911 dispatch surface."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <ModuleWorkspaceTabs
        tabs={CATEGORY_TABS}
        active={category}
        onChange={setCategory}
        ariaLabel="Emergency response categories"
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="card border shadow-none mb-4">
        <div className="card-header">
          <h6 className="card-title mb-0">Create record</h6>
        </div>
        <div className="card-body">
          <form onSubmit={(e) => void createRecord(e)}>
            <div className="row g-3 align-items-end">
              <div className="col-md-5">
                <label className="form-label" htmlFor="er-title">
                  Title
                </label>
                <input
                  id="er-title"
                  className="form-control form-control-sm"
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="er-plan-id">
                  Plan ID
                </label>
                <input
                  id="er-plan-id"
                  className="form-control form-control-sm"
                  name="planId"
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="col-md-2">
                <label className="form-label" htmlFor="er-event-date">
                  Event date
                </label>
                <input
                  id="er-event-date"
                  className="form-control form-control-sm"
                  type="date"
                  name="eventDate"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
              <div className="col-md-2">
                <button type="submit" className="btn btn-primary btn-sm w-100">
                  Create
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="card border shadow-none">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th scope="col">Record</th>
                <th scope="col">Status</th>
                <th scope="col">Plan</th>
                <th scope="col">Event date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>
                    <span className="badge bg-label-secondary">{item.status}</span>
                  </td>
                  <td className="text-muted">{item.planId ?? "—"}</td>
                  <td className="text-muted">{item.eventDate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
