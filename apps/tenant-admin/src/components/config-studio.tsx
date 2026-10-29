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
  dropdowns: "Dropdown Manager",
  notification_templates: "Notification Templates",
  email_templates: "Email Templates",
  business_hours: "Business Hours",
  holiday_calendar: "Holiday Calendar",
  facilities: "Facilities",
  locations: "Locations",
  roles: "Role Builder",
};

export const STUDIO_NAMESPACES = Object.keys(NAMESPACE_LABELS);

export function ConfigStudioWorkspace({
  namespace: namespaceProp,
  title,
}: {
  namespace?: string | undefined;
  title?: string | undefined;
}) {
  const searchParams = useSearchParams();
  const namespace = namespaceProp ?? searchParams.get("namespace") ?? "branding";
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canUpdate =
    hasPermission("platform.configuration.update") || hasPermission("tenant.configuration.update");
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
      <p className={styles.lead}>
        Namespace <span className={styles.mono}>{namespace}</span> · Tenant{" "}
        <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/studio${tenantQuery(tenantId)}`}>Studio home</Link>
      </p>
      <p className={styles.muted}>
        Draft → Scheduled/Published → Superseded/Archived. Rollback clones an older version into a
        new published revision.
      </p>

      {!canUpdate ? <p className={styles.error}>Missing configuration update permission</p> : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {message ? <p className={styles.success}>{message}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      <div className={styles.panel}>
        <h2>Version history</h2>
        {versions.length === 0 ? (
          <p className={styles.muted}>No versions yet.</p>
        ) : (
          <table className={styles.table}>
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
                  <td>{row.state}</td>
                  <td>{row.changeSummary ?? "—"}</td>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.buttonSecondary}
                      onClick={() => setSelectedId(row.id)}
                    >
                      Select
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.panel}>
        <h2>Editor {selected ? `(v${selected.version} · ${selected.state})` : ""}</h2>
        <div className={styles.formRow}>
          <label htmlFor="change-summary">Change summary</label>
          <input
            id="change-summary"
            value={changeSummary}
            onChange={(event) => setChangeSummary(event.target.value)}
            placeholder="Why this change?"
          />
        </div>
        <div className={styles.formRow}>
          <label htmlFor="payload-json">Payload JSON</label>
          <textarea
            id="payload-json"
            rows={18}
            value={payloadText}
            onChange={(event) => setPayloadText(event.target.value)}
            spellCheck={false}
            style={{ fontFamily: "ui-monospace, monospace", minHeight: "16rem" }}
          />
        </div>
        <div className={styles.actions}>
          {canUpdate ? (
            <>
              <button
                type="button"
                className={styles.button}
                disabled={busy}
                onClick={() => void createDraft()}
              >
                New draft
              </button>
              <button
                type="button"
                className={styles.buttonSecondary}
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
                className={styles.button}
                disabled={busy || !selectedId}
                onClick={() => void runAction("publish")}
              >
                Publish
              </button>
              <button
                type="button"
                className={styles.buttonSecondary}
                disabled={busy || !selectedId}
                onClick={() => void runAction("archive")}
              >
                Archive
              </button>
              <button
                type="button"
                className={styles.buttonSecondary}
                disabled={busy || !selectedId}
                onClick={() => void runAction("rollback")}
              >
                Rollback (clone+publish)
              </button>
            </>
          ) : null}
        </div>
        {canPublish ? (
          <div className={styles.form} style={{ marginTop: "1rem" }}>
            <div className={styles.formRow}>
              <label htmlFor="schedule-at">Schedule publish (local)</label>
              <input
                id="schedule-at"
                type="datetime-local"
                value={scheduleAt}
                onChange={(event) => setScheduleAt(event.target.value)}
              />
            </div>
            <button
              type="button"
              className={styles.buttonSecondary}
              disabled={busy || !selectedId}
              onClick={() => void runAction("schedule")}
            >
              Schedule
            </button>
          </div>
        ) : null}
      </div>

      <div className={styles.panel}>
        <h2>Compare versions</h2>
        <div className={styles.actions}>
          <select
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
            className={styles.buttonSecondary}
            disabled={busy}
            onClick={() => void runCompare()}
          >
            Compare
          </button>
        </div>
        {diffs.length === 0 ? (
          <p className={styles.muted}>No diffs loaded.</p>
        ) : (
          <ul>
            {diffs.map((diff) => (
              <li key={diff.path}>
                <span className={styles.mono}>{diff.path}</span>: {JSON.stringify(diff.left)} →{" "}
                {JSON.stringify(diff.right)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function ConfigStudioPage({
  namespace,
  title,
}: {
  namespace?: string | undefined;
  title?: string | undefined;
}) {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <p className={styles.muted}>Loading…</p>
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
