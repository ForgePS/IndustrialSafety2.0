"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";
import { COMPLIANCE_MODULE_CONFIG, type Ind6ComplianceModule } from "@/lib/compliance-modules";

type ListResponse = {
  items: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
};

export function ComplianceWorkspace({
  module,
  moduleName,
}: {
  module: Ind6ComplianceModule;
  moduleName: string;
}) {
  const cfg = COMPLIANCE_MODULE_CONFIG[module];
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView = permissions.has(cfg.viewPerm) || permissions.has("industrial.admin");
  const canManage = permissions.has(cfg.managePerm) || permissions.has("industrial.admin");
  const canViewSensitive =
    !cfg.sensitivePerm || permissions.has(cfg.sensitivePerm) || permissions.has("industrial.admin");
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
  const [incidentId, setIncidentId] = useState("");

  async function loadList(search = q, st = status, cat = category) {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<ListResponse>(cfg.listPath, {
        query: {
          q: search || undefined,
          status: st || undefined,
          category: module === "osha" || module === "risk" ? undefined : cat || undefined,
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
      if (module === "osha") {
        if (!incidentId.trim()) {
          throw new Error("OSHA cases require an incident ID");
        }
        await apiSend(cfg.createPath, "POST", {
          title: title.trim(),
          incidentId: incidentId.trim(),
          status: "OPEN",
          recordabilityStatus: "PENDING",
          details: {},
        });
      } else if (module === "risk") {
        await apiSend(cfg.createPath, "POST", {
          title: title.trim(),
          status: "OPEN",
          ownerName: workerName.trim() || undefined,
          details: {},
        });
      } else {
        await apiSend(cfg.createPath, "POST", {
          title: title.trim(),
          category: category || cfg.defaultCategory,
          locationText: locationText.trim() || undefined,
          workerName: workerName.trim() || undefined,
          incidentId: cfg.requiresIncident && incidentId.trim() ? incidentId.trim() : undefined,
          status: "DRAFT",
          details: {},
          sensitive: {},
        });
      }
      setTitle("");
      setLocationText("");
      setWorkerName("");
      setIncidentId("");
      await loadList();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Create failed",
      );
    } finally {
      setCreating(false);
    }
  }

  async function archiveSelected() {
    if (!selectedId || !canManage) return;
    setError(null);
    try {
      await apiSend(`${cfg.listPath}/${selectedId}/archive`, "POST", {});
      await loadList();
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Archive failed");
    }
  }

  const sensitiveJson = detail?.sensitiveJson as Record<string, unknown> | undefined;
  const sensitiveRedacted = Boolean(sensitiveJson && sensitiveJson.redacted === true);

  return (
    <section className="ind-ops ind-compliance" aria-labelledby="cmp-module-title">
      <header className="ind-ops-header">
        <h1 id="cmp-module-title">{moduleName}</h1>
        <p className="ind-muted">
          Compliance / facility safety candidate · Firebase remains production authority · Flag{" "}
          {cfg.flagKey}
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
        {module !== "osha" && module !== "risk" ? (
          <label>
            Category
            <input
              type="text"
              value={category}
              onChange={(ev) => setCategory(ev.target.value)}
              autoComplete="off"
            />
          </label>
        ) : null}
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
                <th scope="col">Category / Type</th>
                <th scope="col">Status</th>
                <th scope="col">Updated</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.title ?? "—")}</td>
                  <td>
                    {String(
                      row.category ??
                        row.recordabilityStatus ??
                        row.sourceType ??
                        cfg.defaultCategory,
                    )}
                  </td>
                  <td>
                    <span data-status={String(row.status ?? "")}>{String(row.status ?? "—")}</span>
                  </td>
                  <td>{row.updatedAt ? new Date(String(row.updatedAt)).toLocaleString() : "—"}</td>
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
          {cfg.sensitivePerm ? (
            <p className="ind-muted" aria-label="Sensitive data access">
              Sensitive fields:{" "}
              {canViewSensitive
                ? sensitiveRedacted
                  ? "redacted by server"
                  : "visible (authorized)"
                : "restricted — requires sensitive permission"}
            </p>
          ) : null}
          <div className="ind-ops-actions">
            {canManage ? (
              <button type="button" onClick={() => void archiveSelected()}>
                Archive
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {canManage ? (
        <form className="ind-ops-create" onSubmit={onCreate} aria-label={`Create ${moduleName}`}>
          <h2>Create record</h2>
          <label>
            Title
            <input
              required
              value={title}
              onChange={(ev) => setTitle(ev.target.value)}
              autoComplete="off"
            />
          </label>
          {module !== "osha" && module !== "risk" ? (
            <>
              <label>
                Worker / contact
                <input
                  value={workerName}
                  onChange={(ev) => setWorkerName(ev.target.value)}
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
            </>
          ) : null}
          {module === "risk" ? (
            <label>
              Owner
              <input
                value={workerName}
                onChange={(ev) => setWorkerName(ev.target.value)}
                autoComplete="off"
              />
            </label>
          ) : null}
          {cfg.requiresIncident || module === "osha" ? (
            <label>
              Incident ID {module === "osha" ? "(required)" : "(optional)"}
              <input
                value={incidentId}
                onChange={(ev) => setIncidentId(ev.target.value)}
                autoComplete="off"
                required={module === "osha"}
              />
            </label>
          ) : null}
          <button type="submit" disabled={creating || !title.trim()}>
            {creating ? "Creating…" : "Create"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
