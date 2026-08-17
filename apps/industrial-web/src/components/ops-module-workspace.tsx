"use client";

import Link from "next/link";
import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ModuleUnavailable } from "@/components/module-unavailable";
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

  if (field.type === "checkbox") {
    return (
      <label key={field.name} className="ind-ops-checkbox">
        <input
          type="checkbox"
          checked={form[field.name] === "true"}
          onChange={(ev) => set(ev.target.checked ? "true" : "")}
        />
        {field.label}
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label key={field.name}>
        {field.label}
        <textarea
          rows={4}
          required={field.required}
          value={form[field.name] ?? ""}
          onChange={(ev) => set(ev.target.value)}
        />
      </label>
    );
  }

  return (
    <label key={field.name}>
      {field.label}
      <input
        type={field.type ?? "text"}
        required={field.required}
        value={form[field.name] ?? ""}
        onChange={(ev) => set(ev.target.value)}
      />
    </label>
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
      <section className="ind-unavailable" role="alert">
        <h1>{moduleName}</h1>
        <p>You do not have permission to view this module.</p>
        <p className="ind-muted">Missing {cfg.viewPerm}</p>
      </section>
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
      <section className="ind-state" role="status" aria-live="polite">
        <h1>{moduleName}</h1>
        <p>Checking module availability…</p>
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
          // Only send when ticked; the column already defaults to false.
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
    <section className="ind-ops" aria-labelledby="ops-module-title">
      <header className="ind-ops-header">
        <h1 id="ops-module-title">{moduleName}</h1>
        <p className="ind-muted">
          Normalized Model A module · Flag {cfg.flagKey}
        </p>
      </header>

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
                <th scope="col">Record</th>
                <th scope="col">Status</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const title =
                  String(row[cfg.titleField] ?? row.title ?? row.name ?? row.id ?? "—");
                return (
                  <tr key={String(row.id)}>
                    <td>{title}</td>
                    <td>{String(row.status ?? "—")}</td>
                    <td>
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
      )}

      {canManage && cfg.createHref ? (
        <section className="ind-ops-create-link">
          <h2>Create</h2>
          <Link className="ind-button" href={cfg.createHref}>
            Add {moduleName.replace(/s$/, "").toLowerCase()}
          </Link>
        </section>
      ) : canManage ? (
        <form className="ind-ops-create" onSubmit={(e) => void onCreate(e)} aria-label="Create record">
          <h2>Create</h2>
          {groupCreateFields(cfg.createFields).map(({ group, fields }) => {
            const rendered = fields.map((field) => renderCreateField(field, form, setForm));
            if (!group) return rendered;
            return (
              <fieldset key={group} className="ind-ops-fieldset">
                <legend>{group}</legend>
                {rendered}
              </fieldset>
            );
          })}
          <button type="submit" disabled={creating}>
            {creating ? "Saving…" : "Create"}
          </button>
        </form>
      ) : (
        <p className="ind-muted">Create/edit requires {cfg.managePerm}.</p>
      )}

      {module === "training" && canManage ? (
        <form
          className="ind-ops-create"
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
          <h2>Bulk training completion</h2>
          <label>
            Course / training title
            <input
              required
              value={form.title ?? ""}
              onChange={(ev) => setForm((prev) => ({ ...prev, title: ev.target.value }))}
            />
          </label>
          <label>
            Completion date
            <input
              type="date"
              value={form.completedAt ?? ""}
              onChange={(ev) => setForm((prev) => ({ ...prev, completedAt: ev.target.value }))}
            />
          </label>
          <label>
            Instructor
            <input
              value={form.instructorName ?? ""}
              onChange={(ev) =>
                setForm((prev) => ({ ...prev, instructorName: ev.target.value }))
              }
            />
          </label>
          <label>
            Location
            <input
              value={form.location ?? ""}
              onChange={(ev) => setForm((prev) => ({ ...prev, location: ev.target.value }))}
            />
          </label>
          <label>
            Employee IDs (comma-separated)
            <input
              required
              value={form.personnelIds ?? ""}
              onChange={(ev) => setForm((prev) => ({ ...prev, personnelIds: ev.target.value }))}
              placeholder="Paste multiple personnel IDs"
            />
          </label>
          <button type="submit" disabled={creating}>
            {creating ? "Saving…" : "Record for all selected employees"}
          </button>
        </form>
      ) : null}

      {module === "forms" ? (
        <p className="ind-muted" role="note">
          Form definitions are stored in Model A. Advanced builder tooling continues to improve.
        </p>
      ) : null}
    </section>
  );
}
