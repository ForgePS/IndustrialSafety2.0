"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../app/page.module.css";

export type StudioVersion = {
  id: string;
  version: number;
  state: string;
  payloadJson: unknown;
  changeSummary: string | null;
  effectiveFrom: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type StudioObject = {
  id: string;
  namespace: string;
  objectKey: string;
  displayName: string;
  currentPublishedVersionId: string | null;
};

const NAMESPACE_LABELS: Record<string, string> = {
  tenant_profile: "Tenant Profile",
  organization_profile: "Organization Profile",
  branding: "Branding",
  navigation: "Navigation Editor",
  terminology: "Terminology Manager",
  modules: "Module Manager",
  features: "Feature Manager",
  dropdowns: "Dropdown Manager",
  custom_fields: "Custom Field Builder",
  forms: "Form Builder",
  workflows: "Workflow Builder",
  roles: "Role Builder",
  permissions: "Permission Manager",
  notification_templates: "Notification Templates",
  email_templates: "Email Templates",
  document_templates: "Document Templates",
  certificate_templates: "Certificate Templates",
  dashboards: "Dashboard Builder",
  reporting: "Reporting Configuration",
  import_config: "Import Configuration",
  export_config: "Export Configuration",
  security: "Security Configuration",
  retention: "Retention Policies",
  business_hours: "Business Hours",
  holiday_calendar: "Holiday Calendar",
  facilities: "Facilities",
  locations: "Locations",
};

export const STUDIO_NAMESPACES = Object.keys(NAMESPACE_LABELS);

export function ConfigStudioWorkspace({
  namespace: namespaceProp,
  title,
}: {
  namespace?: string;
  title?: string;
}) {
  const searchParams = useSearchParams();
  const namespace = namespaceProp ?? searchParams.get("namespace") ?? "branding";
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canUpdate =
    hasPermission("platform.configuration.update") ||
    hasPermission("tenant.configuration.update");
  const canPublish =
    hasPermission("platform.configuration.publish") ||
    hasPermission("platform.configuration.update") ||
    hasPermission("tenant.configuration.publish");

  const [object, setObject] = useState<StudioObject | null>(null);
  const [versions, setVersions] = useState<StudioVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [payloadText, setPayloadText] = useState("{}");
  const [changeSummary, setChangeSummary] = useState("");
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [diffs, setDiffs] = useState<Array<{ path: string; left: unknown; right: unknown }>>([]);
  const [scheduleAt, setScheduleAt] = useState("");
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selected = useMemo(
    () => versions.find((v) => v.id === selectedId) ?? null,
    [versions, selectedId],
  );

  const load = useCallback(async () => {
    if (!tenantId || !canUpdate) return;
    setLoading(true);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/config/ensure-defaults`, "POST");
      const listed = await apiGet<{ items: StudioObject[] }>(
        `/api/v1/tenants/${tenantId}/config/${namespace}`,
      );
      const target =
        listed.items.find((item) => item.objectKey === "default") ?? listed.items[0] ?? null;
      setObject(target);
      if (!target) {
        setVersions([]);
        return;
      }
      const history = await apiGet<{ object: StudioObject; versions: StudioVersion[] }>(
        `/api/v1/tenants/${tenantId}/config/${namespace}/${target.objectKey}/versions`,
      );
      setObject(history.object);
      setVersions(history.versions);
      const draft =
        history.versions.find((v) => v.state === "DRAFT") ?? history.versions[0] ?? null;
      setSelectedId(draft?.id ?? null);
      setPayloadText(JSON.stringify(draft?.payloadJson ?? {}, null, 2));
      if (history.versions.length >= 2) {
        setCompareFrom(history.versions[1]!.id);
        setCompareTo(history.versions[0]!.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load configuration studio");
    } finally {
      setLoading(false);
    }
  }, [tenantId, namespace, canUpdate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setPayloadText(JSON.stringify(selected.payloadJson ?? {}, null, 2));
  }, [selected]);

  async function saveDraft() {
    if (!tenantId || !object || !selected || selected.state !== "DRAFT") return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const payload = JSON.parse(payloadText) as unknown;
      await apiSend(
        `/api/v1/tenants/${tenantId}/config/${namespace}/${object.objectKey}/versions/${selected.id}`,
        "PATCH",
        { payload, changeSummary: changeSummary || undefined },
      );
      setMessage("Draft saved");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function createDraft() {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    try {
      const payload = JSON.parse(payloadText) as unknown;
      await apiSend(`/api/v1/tenants/${tenantId}/config/${namespace}`, "POST", {
        objectKey: "default",
        displayName: title ?? NAMESPACE_LABELS[namespace] ?? namespace,
        payload,
        changeSummary: changeSummary || "New draft",
      });
      setMessage("Draft created");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create draft failed");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: "publish" | "archive" | "rollback" | "schedule") {
    if (!tenantId || !object || !selectedId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const base = `/api/v1/tenants/${tenantId}/config/${namespace}/${object.objectKey}/versions/${selectedId}/${action}`;
      if (action === "schedule") {
        if (!scheduleAt) throw new Error("Set a future schedule time");
        await apiSend(base, "POST", {
          effectiveFrom: new Date(scheduleAt).toISOString(),
          changeSummary: changeSummary || undefined,
        });
      } else {
        await apiSend(base, "POST");
      }
      setMessage(`${action} succeeded`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setBusy(false);
    }
  }

  async function runCompare() {
    if (!tenantId || !object || !compareFrom || !compareTo) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiGet<{
        diffs: Array<{ path: string; left: unknown; right: unknown }>;
      }>(
        `/api/v1/tenants/${tenantId}/config/${namespace}/${object.objectKey}/compare?from=${encodeURIComponent(compareFrom)}&to=${encodeURIComponent(compareTo)}`,
      );
      setDiffs(result.diffs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compare failed");
    } finally {
      setBusy(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>{title ?? NAMESPACE_LABELS[namespace] ?? "Configuration Studio"}</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>{title ?? NAMESPACE_LABELS[namespace] ?? namespace}</h1>
      <p className="text-muted">
        Namespace <span className={styles.mono}>{namespace}</span> · Tenant{" "}
        <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/studio${tenantQuery(tenantId)}`}>Studio home</Link>
      </p>
      <p className="text-muted">
        Draft → Scheduled/Published → Superseded/Archived. Rollback clones an older version into a
        new published revision.
      </p>

      {!canUpdate ? (
        <div className="alert alert-danger" role="alert">
          Missing configuration update permission
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="alert alert-danger">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      ) : null}
      {loading ? <p className="text-muted">Loading…</p> : null}

      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-0">Version history</h5>
        </div>
        <div className="card-body">
          {versions.length === 0 ? (
            <p className="text-muted mb-0">No versions yet.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Ver</th>
                    <th>State</th>
                    <th>Summary</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {versions.map((row) => (
                    <tr key={row.id}>
                      <td>v{row.version}</td>
                      <td>
                        <span className="badge bg-label-secondary">{row.state}</span>
                      </td>
                      <td>{row.changeSummary ?? "—"}</td>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setSelectedId(row.id)}
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-0">
            Editor {selected ? `(v${selected.version} · ${selected.state})` : ""}
          </h5>
        </div>
        <div className="card-body">
          <div className="mb-3">
            <label className="form-label" htmlFor="change-summary">
              Change summary
            </label>
            <input
              id="change-summary"
              className="form-control"
              value={changeSummary}
              onChange={(event) => setChangeSummary(event.target.value)}
              placeholder="Why this change?"
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="payload-json">
              Payload JSON
            </label>
            <textarea
              id="payload-json"
              className="form-control font-monospace"
              rows={18}
              value={payloadText}
              onChange={(event) => setPayloadText(event.target.value)}
              spellCheck={false}
              style={{ minHeight: "16rem" }}
            />
          </div>
          <div className="d-flex flex-wrap gap-2">
            {canUpdate ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void createDraft()}
                >
                  New draft
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={busy || selected?.state !== "DRAFT"}
                  onClick={() => void saveDraft()}
                >
                  Save draft
                </button>
              </>
            ) : null}
            {canPublish ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !selectedId}
                  onClick={() => void runAction("publish")}
                >
                  Publish
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={busy || !selectedId}
                  onClick={() => void runAction("archive")}
                >
                  Archive
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={busy || !selectedId}
                  onClick={() => void runAction("rollback")}
                >
                  Rollback (clone+publish)
                </button>
              </>
            ) : null}
          </div>
          {canPublish ? (
            <div className="mt-3">
              <div className="mb-3">
                <label className="form-label" htmlFor="schedule-at">
                  Schedule publish (local)
                </label>
                <input
                  id="schedule-at"
                  className="form-control"
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(event) => setScheduleAt(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={busy || !selectedId}
                onClick={() => void runAction("schedule")}
              >
                Schedule
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-0">Compare versions</h5>
        </div>
        <div className="card-body">
          <div className="d-flex flex-wrap gap-2 mb-3">
            <select
              className="form-select w-auto"
              value={compareFrom}
              onChange={(e) => setCompareFrom(e.target.value)}
              aria-label="Compare from"
            >
              <option value="">From…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} ({v.state})
                </option>
              ))}
            </select>
            <select
              className="form-select w-auto"
              value={compareTo}
              onChange={(e) => setCompareTo(e.target.value)}
              aria-label="Compare to"
            >
              <option value="">To…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} ({v.state})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={busy}
              onClick={() => void runCompare()}
            >
              Compare
            </button>
          </div>
          {diffs.length === 0 ? (
            <p className="text-muted mb-0">No diffs loaded.</p>
          ) : (
            <ul className="mb-0">
              {diffs.map((diff) => (
                <li key={diff.path}>
                  <span className={styles.mono}>{diff.path}</span>: {JSON.stringify(diff.left)} →{" "}
                  {JSON.stringify(diff.right)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function ConfigStudioPage({
  namespace,
  title,
}: {
  namespace?: string;
  title?: string;
}) {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <p className="text-muted">Loading…</p>
        </main>
      }
    >
      <ConfigStudioWorkspace
        {...(namespace !== undefined ? { namespace } : {})}
        {...(title !== undefined ? { title } : {})}
      />
    </Suspense>
  );
}
