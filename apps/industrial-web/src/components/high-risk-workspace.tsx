"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";
import {
  HIGH_RISK_MODULE_CONFIG,
  type Ind5HighRiskModule,
} from "@/lib/high-risk-modules";

type ListResponse = {
  items: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
};

export function HighRiskWorkspace({
  module,
  moduleName,
}: {
  module: Ind5HighRiskModule;
  moduleName: string;
}) {
  const cfg = HIGH_RISK_MODULE_CONFIG[module];
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView = permissions.has(cfg.viewPerm) || permissions.has("industrial.admin");
  const canManage = permissions.has(cfg.managePerm) || permissions.has("industrial.admin");
  const canApprove = permissions.has(cfg.approvePerm) || permissions.has("industrial.admin");
  const { modEntry, explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: cfg.code,
    canView,
  });

  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState(cfg.defaultCategory);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [locationText, setLocationText] = useState("");
  const [workerName, setWorkerName] = useState("");

  async function loadList(search = q, st = status, cat = category) {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<ListResponse>(cfg.listPath, {
        query: {
          q: search || undefined,
          status: st || undefined,
          category: cat || undefined,
          page: "1",
          pageSize: "25",
        },
      });
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load records");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    setError(null);
    try {
      const row = await apiGet<Record<string, unknown>>(`${cfg.listPath}/${id}`);
      setDetail(row);
      setSelectedId(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load record");
      setDetail(null);
    }
  }

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    void loadList("", "", cfg.defaultCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load when gate opens
  }, [awsReady, module, cfg.listPath, cfg.defaultCategory]);

  if (!canView) {
    return (
      <section className="ind-unavailable" role="alert">
        <h1>{moduleName}</h1>
        <p>You do not have permission to view this module.</p>
        <p className="ind-muted">Missing {cfg.viewPerm}</p>
      </section>
    );
  }

  if (explicitlyDisabled) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "MIGRATION_IN_PROGRESS"}
      />
    );
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setCreating(true);
    setError(null);
    try {
      await apiSend(cfg.createPath, "POST", {
        title: title.trim(),
        category: category || cfg.defaultCategory,
        locationText: locationText.trim() || undefined,
        workerName: workerName.trim() || undefined,
        status: "DRAFT",
        details: {},
      });
      setTitle("");
      setLocationText("");
      setWorkerName("");
      await loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function transition(action: "submit" | "approve" | "close" | "archive") {
    if (!selectedId) return;
    const allowed =
      action === "approve"
        ? canApprove
        : action === "close"
          ? canManage || canApprove
          : canManage;
    if (!allowed) return;
    setError(null);
    try {
      await apiSend(`${cfg.listPath}/${selectedId}/${action}`, "POST", {});
      await loadList();
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `${action} failed`);
    }
  }

  return (
    <section className="ind-ops ind-high-risk" aria-labelledby="hr-module-title">
      <header className="ind-ops-header">
        <h1 id="hr-module-title">{moduleName}</h1>
        <p className="ind-muted">
          High-risk work candidate · Firebase remains production authority · Flag {cfg.flagKey}
        </p>
      </header>

      <form
        className="ind-ops-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void loadList();
        }}
        aria-label={`${moduleName} filters`}
      >
        <label>
          Search
          <input
            type="search"
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Category
          <input
            type="text"
            value={category}
            onChange={(ev) => setCategory(ev.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Status
          <input
            type="text"
            value={status}
            onChange={(ev) => setStatus(ev.target.value)}
            placeholder="DRAFT / OPEN / …"
            autoComplete="off"
          />
        </label>
        <button type="submit">Apply filters</button>
      </form>

      {error ? (
        <p className="ind-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p role="status" aria-live="polite">
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="ind-muted">No records yet for this tenant.</p>
      ) : (
        <div className="ind-ops-table-wrap" role="region" aria-label={`${moduleName} list`}>
          <table className="ind-ops-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col">Updated</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.title ?? "—")}</td>
                  <td>{String(row.category ?? "—")}</td>
                  <td>
                    <span data-status={String(row.status ?? "")}>{String(row.status ?? "—")}</span>
                  </td>
                  <td>
                    {row.updatedAt ? new Date(String(row.updatedAt)).toLocaleString() : "—"}
                  </td>
                  <td>
                    <button type="button" onClick={() => void loadDetail(String(row.id))}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail ? (
        <section className="ind-ops-detail" aria-label="Record detail">
          <h2>{String(detail.title ?? "Record")}</h2>
          <p>
            Status: <strong>{String(detail.status ?? "—")}</strong>
          </p>
          <p className="ind-muted">Location: {String(detail.locationText ?? "—")}</p>
          <div className="ind-ops-actions">
            {canManage ? (
              <button type="button" onClick={() => void transition("submit")}>
                Submit
              </button>
            ) : null}
            {canApprove ? (
              <button type="button" onClick={() => void transition("approve")}>
                Approve / Open
              </button>
            ) : null}
            {canManage || canApprove ? (
              <button type="button" onClick={() => void transition("close")}>
                Close
              </button>
            ) : null}
            {canManage ? (
              <button type="button" onClick={() => void transition("archive")}>
                Archive
              </button>
            ) : null}
          </div>
          {Array.isArray(detail.assignments) && (detail.assignments as unknown[]).length > 0 ? (
            <p className="ind-muted">
              Assignments: {(detail.assignments as Array<{ roleKey?: string }>).map((a) => a.roleKey).join(", ")}
            </p>
          ) : null}
          {Array.isArray(detail.readings) && (detail.readings as unknown[]).length > 0 ? (
            <p className="ind-muted">
              Atmospheric readings: {(detail.readings as unknown[]).length}
            </p>
          ) : null}
        </section>
      ) : null}

      {canManage ? (
        <form className="ind-ops-create" onSubmit={(e) => void onCreate(e)} aria-label="Create record">
          <h2>Create</h2>
          <label>
            Title
            <input
              required
              value={title}
              onChange={(ev) => setTitle(ev.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            Category
            <input
              required
              value={category}
              onChange={(ev) => setCategory(ev.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            Location
            <input
              value={locationText}
              onChange={(ev) => setLocationText(ev.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            Worker / primary person
            <input
              value={workerName}
              onChange={(ev) => setWorkerName(ev.target.value)}
              autoComplete="off"
            />
          </label>
          <button type="submit" disabled={creating}>
            {creating ? "Saving…" : "Create draft"}
          </button>
        </form>
      ) : (
        <p className="ind-muted">Create/edit requires {cfg.managePerm}.</p>
      )}

      <p className="ind-muted" role="note">
        Field UX targets tablet completion. Hosted Playwright remains pending nonproduction web hosting.
        Optional Equipment/LOTO links are validated server-side when provided.
      </p>
    </section>
  );
}
