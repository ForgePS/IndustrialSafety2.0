"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../../page.module.css";

type TemplateRow = {
  id: string;
  key: string;
  name: string;
  product: string;
  module: string;
  status: string;
  isSystem: boolean;
  currentVersion: number;
};

const DEFAULT_SYSTEM_PROMPT =
  "You are a fire-service narrative assistant. Draft factual narratives from structured incident fields only. Never invent units, times, addresses, or casualties. Flag missing fields.";

const DEFAULT_USER_PROMPT =
  "Produce a clear officer narrative from the provided source fields. Call out missing information and contradictions.";

function Inner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead =
    hasPermission("ai.narrative.use") ||
    hasPermission("ai.narrative.manage_templates") ||
    hasPermission("platform.ai.narrative.manage");
  const canManage =
    hasPermission("ai.narrative.manage_templates") || hasPermission("platform.ai.narrative.manage");
  const [items, setItems] = useState<TemplateRow[]>([]);
  const [note, setNote] = useState<string | undefined>();
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("rms.incident.default");
  const [name, setName] = useState("RMS incident default");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [userPrompt, setUserPrompt] = useState(DEFAULT_USER_PROMPT);

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<{ items: TemplateRow[]; note?: string }>("/api/v1/ai/templates", {
        query: { tenantId },
      });
      setItems(result.items);
      setNote(result.note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/ai/templates?tenantId=${encodeURIComponent(tenantId)}`, "POST", {
        product: "RMS",
        module: "INCIDENT",
        recordType: "neris_incident",
        key,
        name,
        systemPrompt,
        userPromptTemplate: userPrompt,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setBusy(false);
    }
  }

  async function publish(templateId: string) {
    if (!tenantId || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(
        `/api/v1/ai/templates/${templateId}/publish?tenantId=${encodeURIComponent(tenantId)}`,
        "POST",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish template");
    } finally {
      setBusy(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>AI Templates</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>AI Templates</h1>
      <p className={styles.lead}>
        Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/ai${tenantQuery(tenantId)}`}>Overview</Link>
      </p>
      {!canRead ? <p className={styles.error}>Missing template permission</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}
      {note ? <p className={styles.muted}>{note}</p> : null}
      <div className={styles.panel}>
        {items.length === 0 && !loading ? (
          <p className={styles.muted}>No templates for this tenant.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Product</th>
                <th>Status</th>
                <th>Version</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.name}
                    {row.isSystem ? " (system)" : ""}
                  </td>
                  <td className={styles.mono}>{row.key}</td>
                  <td>{row.product}</td>
                  <td>{row.status}</td>
                  <td>{row.currentVersion}</td>
                  <td>
                    {canManage && row.status !== "PUBLISHED" ? (
                      <button
                        type="button"
                        className={styles.buttonSecondary}
                        disabled={busy}
                        onClick={() => void publish(row.id)}
                      >
                        Publish
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canManage ? (
        <div className={styles.panel}>
          <h2>Create template</h2>
          <form className={styles.form} onSubmit={(event) => void onCreate(event)}>
            <div className={styles.formRow}>
              <label htmlFor="tpl-key">Key</label>
              <input id="tpl-key" value={key} onChange={(e) => setKey(e.target.value)} required />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="tpl-name">Name</label>
              <input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="tpl-system">System prompt</label>
              <textarea
                id="tpl-system"
                rows={4}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                required
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="tpl-user">User prompt template</label>
              <textarea
                id="tpl-user"
                rows={3}
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                required
              />
            </div>
            <button type="submit" className={styles.button} disabled={busy}>
              Create draft
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <p className={styles.muted}>Loading…</p>
        </main>
      }
    >
      <Inner />
    </Suspense>
  );
}
