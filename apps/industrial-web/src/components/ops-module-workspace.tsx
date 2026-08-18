"use client";

import Link from "next/link";
import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import {
  OPS_MODULE_CONFIG,
  groupCreateFields,
  type Ind3OpsModule,
  type OpsCreateField,
} from "@/lib/ops-modules";

type FormState = Record<string, string>;

function renderCreateField(
  field: OpsCreateField,
  form: FormState,
  setForm: Dispatch<SetStateAction<FormState>>,
) {
  const set = (value: string) => setForm((prev) => ({ ...prev, [field.name]: value }));
  const inputId = `ops-create-${field.name}`;

  if (field.type === "checkbox") {
    return (
      <div className="col-12" key={field.name}>
        <div className="form-check">
          <input
            id={inputId}
            className="form-check-input"
            type="checkbox"
            checked={form[field.name] === "true"}
            onChange={(ev) => set(ev.target.checked ? "true" : "")}
          />
          <label className="form-check-label" htmlFor={inputId}>
            {field.label}
          </label>
        </div>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="col-md-6" key={field.name}>
        <label className="form-label" htmlFor={inputId}>
          {field.label}
        </label>
        <textarea
          id={inputId}
          className="form-control form-control-sm"
          rows={4}
          required={field.required}
          value={form[field.name] ?? ""}
          onChange={(ev) => set(ev.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="col-md-4" key={field.name}>
      <label className="form-label" htmlFor={inputId}>
        {field.label}
      </label>
      <input
        id={inputId}
        className="form-control form-control-sm"
        type={field.type ?? "text"}
        required={field.required}
        value={form[field.name] ?? ""}
        onChange={(ev) => set(ev.target.value)}
      />
    </div>
  );
}

type ListResponse = {
  items: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
};

type BootstrapModule = {
  code: string;
  awsEnabled: boolean;
  available: boolean;
  migrationStatus: string;
};

type Bootstrap = {
  industrialEnabled: boolean;
  modules: BootstrapModule[];
};

export function OpsModuleWorkspace({
  module,
  moduleName,
}: {
  module: Ind3OpsModule;
  moduleName: string;
}) {
  const cfg = OPS_MODULE_CONFIG[module];
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView = permissions.has(cfg.viewPerm) || permissions.has("industrial.admin");
  const canManage = permissions.has(cfg.managePerm) || permissions.has("industrial.admin");

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const modEntry = bootstrap?.modules.find((m) => m.code === cfg.code);
  const awsReady =
    Boolean(bootstrap?.industrialEnabled) && Boolean(modEntry?.awsEnabled) && canView;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const boot = await apiGet<Bootstrap>("/api/v1/industrial/bootstrap");
        if (!cancelled) setBootstrap(boot);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load module bootstrap");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadList(search = q, st = status) {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<ListResponse>(cfg.listPath, {
        query: {
          q: search || undefined,
          status: st || undefined,
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

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await apiGet<ListResponse>(cfg.listPath, {
          query: { page: "1", pageSize: "25" },
        });
        if (!cancelled) setItems(data.items ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load records");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [awsReady, module, cfg.listPath]);

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        <h4 className="alert-heading">{moduleName}</h4>
        <p className="mb-0">
          You do not have permission to view this module. Missing {cfg.viewPerm}.
        </p>
      </div>
    );
  }

  if (bootstrap && !awsReady) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "MIGRATION_IN_PROGRESS"}
      />
    );
  }

  if (!bootstrap) {
    return (
      <section role="status" aria-live="polite">
        <ModuleWorkspaceHeader title={moduleName} description="Checking module availability…" />
      </section>
    );
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setCreating(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const field of cfg.createFields) {
        if (field.type === "checkbox") {
          if (form[field.name] === "true") payload[field.name] = true;
          continue;
        }
        const v = form[field.name]?.trim();
        if (v) payload[field.name] = v;
      }
      await apiSend(cfg.createPath, "POST", payload);
      setForm({});
      await loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section aria-labelledby="ops-module-title">
      <ModuleWorkspaceHeader
        id="ops-module-title"
        eyebrow="Operations"
        title={moduleName}
        description={`Normalized Model A module · Flag ${cfg.flagKey}`}
        onRefresh={() => void loadList()}
        refreshing={loading}
      />

      <FilterPanel
        searchId={`ops-search-${module}`}
        searchValue={q}
        onSearchChange={setQ}
        statusId={`ops-status-${module}`}
        statusValue={status}
        onStatusChange={setStatus}
        chips={[
          ...(q ? [{ id: "q", label: `Search: ${q}`, onRemove: () => setQ("") }] : []),
          ...(status
            ? [{ id: "status", label: `Status: ${status}`, onRemove: () => setStatus("") }]
            : []),
        ]}
        onClearAll={() => {
          setQ("");
          setStatus("");
          void loadList("", "");
        }}
        onSubmit={() => void loadList()}
      />

      {error ? (
        <div className="alert alert-danger d-flex flex-wrap align-items-center gap-3" role="alert">
          <span className="flex-grow-1">{error}</span>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => void loadList()}
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-muted" role="status" aria-live="polite">
          Loading…
        </p>
      ) : items.length === 0 ? (
        <div className="card border shadow-none">
          <div className="card-body">
            <p className="text-muted mb-0">No records yet for this tenant.</p>
          </div>
        </div>
      ) : (
        <div className="card border shadow-none" role="region" aria-label={`${moduleName} list`}>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th scope="col">Record</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const title = String(
                    row[cfg.titleField] ?? row.title ?? row.name ?? row.id ?? "—",
                  );
                  return (
                    <tr key={String(row.id)}>
                      <td>{title}</td>
                      <td>
                        <span className="badge bg-label-secondary">{String(row.status ?? "—")}</span>
                      </td>
                      <td className="text-muted">
                        {row.updatedAt
                          ? new Date(String(row.updatedAt)).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canManage && cfg.createHref ? (
        <div className="card border shadow-none mt-4">
          <div className="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div>
              <h6 className="mb-1">Create</h6>
              <p className="text-muted small mb-0">Add a new record using the full create flow.</p>
            </div>
            <Link className="btn btn-primary btn-sm" href={cfg.createHref}>
              <i className="bx bx-plus me-1" />
              Add {moduleName.replace(/s$/, "").toLowerCase()}
            </Link>
          </div>
        </div>
      ) : canManage ? (
        <div className="card border shadow-none mt-4">
          <div className="card-header">
            <h6 className="card-title mb-0">Create</h6>
          </div>
          <div className="card-body">
            <form onSubmit={(e) => void onCreate(e)} aria-label="Create record">
              {groupCreateFields(cfg.createFields).map(({ group, fields }) => {
                const rendered = fields.map((field) => renderCreateField(field, form, setForm));
                if (!group) {
                  return (
                    <div className="row g-3" key="ungrouped">
                      {rendered}
                    </div>
                  );
                }
                return (
                  <fieldset key={group} className="border rounded p-3 mb-3">
                    <legend className="float-none w-auto px-2 fs-6 text-muted">{group}</legend>
                    <div className="row g-3">{rendered}</div>
                  </fieldset>
                );
              })}
              <button type="submit" className="btn btn-primary btn-sm mt-2" disabled={creating}>
                {creating ? "Saving…" : "Create"}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <p className="text-muted mt-3 mb-0">Create/edit requires {cfg.managePerm}.</p>
      )}

      {module === "training" && canManage ? (
        <div className="card border shadow-none mt-4">
          <div className="card-header">
            <h6 className="card-title mb-0">Bulk training completion</h6>
          </div>
          <div className="card-body">
            <form
              aria-label="Bulk training completion"
              onSubmit={(e) => {
                e.preventDefault();
                void (async () => {
                  setCreating(true);
                  setError(null);
                  try {
                    const personnelIds = String(form.personnelIds ?? "")
                      .split(/[,\s]+/)
                      .map((s) => s.trim())
                      .filter(Boolean);
                    await apiSend("/api/v1/industrial/training/bulk", "POST", {
                      title: form.title || form.courseCode,
                      courseName: form.title || form.courseCode,
                      instructorName: form.instructorName,
                      location: form.location,
                      completedAt: form.completedAt || undefined,
                      personnelIds,
                    });
                    setForm({});
                    await loadList();
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : "Bulk training failed");
                  } finally {
                    setCreating(false);
                  }
                })();
              }}
            >
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="bulk-training-title">
                    Course / training title
                  </label>
                  <input
                    id="bulk-training-title"
                    className="form-control form-control-sm"
                    required
                    value={form.title ?? ""}
                    onChange={(ev) => setForm((prev) => ({ ...prev, title: ev.target.value }))}
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="bulk-training-date">
                    Completion date
                  </label>
                  <input
                    id="bulk-training-date"
                    className="form-control form-control-sm"
                    type="date"
                    value={form.completedAt ?? ""}
                    onChange={(ev) => setForm((prev) => ({ ...prev, completedAt: ev.target.value }))}
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="bulk-training-instructor">
                    Instructor
                  </label>
                  <input
                    id="bulk-training-instructor"
                    className="form-control form-control-sm"
                    value={form.instructorName ?? ""}
                    onChange={(ev) =>
                      setForm((prev) => ({ ...prev, instructorName: ev.target.value }))
                    }
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="bulk-training-location">
                    Location
                  </label>
                  <input
                    id="bulk-training-location"
                    className="form-control form-control-sm"
                    value={form.location ?? ""}
                    onChange={(ev) => setForm((prev) => ({ ...prev, location: ev.target.value }))}
                  />
                </div>
                <div className="col-md-8">
                  <label className="form-label" htmlFor="bulk-training-ids">
                    Employee IDs (comma-separated)
                  </label>
                  <input
                    id="bulk-training-ids"
                    className="form-control form-control-sm"
                    required
                    value={form.personnelIds ?? ""}
                    onChange={(ev) => setForm((prev) => ({ ...prev, personnelIds: ev.target.value }))}
                    placeholder="Paste multiple personnel IDs"
                  />
                </div>
                <div className="col-12">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
                    {creating ? "Saving…" : "Record for all selected employees"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

    </section>
  );
}
