"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../../page.module.css";

type ModelRow = {
  id: string;
  product: string;
  name: string;
  providerKey: string;
  modelId: string;
  status: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  allowConfidential: boolean;
  allowRestricted: boolean;
};

type CatalogRow = {
  providerKey: string;
  modelId: string;
  name: string;
  commercial: boolean;
  note: string;
};

function Inner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead =
    hasPermission("platform.ai.narrative.manage") ||
    hasPermission("platform.ai.provider.manage") ||
    hasPermission("platform.ai.usage.view");
  const canManage =
    hasPermission("platform.ai.narrative.manage") || hasPermission("platform.ai.provider.manage");

  const [items, setItems] = useState<ModelRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("Stub narrative model");
  const [modelId, setModelId] = useState("stub-v1");

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<{ items: ModelRow[]; catalog: CatalogRow[] }>(
        "/api/v1/ai/models",
        {
          query: { tenantId },
        },
      );
      setItems(result.items);
      setCatalog(result.catalog ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load model policies");
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
      await apiSend(`/api/v1/ai/models?tenantId=${encodeURIComponent(tenantId)}`, "POST", {
        product: "RMS",
        name,
        providerKey: "stub",
        modelId,
        status: "APPROVED",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create model policy");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    if (!tenantId || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/ai/models/${id}?tenantId=${encodeURIComponent(tenantId)}`, "PATCH", {
        status,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update model policy");
    } finally {
      setBusy(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>AI Models</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>AI Models</h1>
      <p className={styles.lead}>
        Approved model policies for <span className={styles.mono}>{tenantId}</span>. Commercial
        providers stay blocked until product-owner authorization.{" "}
        <Link href={`/ai${tenantQuery(tenantId)}`}>Overview</Link>
      </p>
      {!canRead ? <p className={styles.error}>Missing platform AI permission</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      <div className={styles.panel}>
        <h2>Catalog</h2>
        {catalog.length === 0 ? (
          <p className={styles.muted}>No catalog entries.</p>
        ) : (
          <ul>
            {catalog.map((row) => (
              <li key={`${row.providerKey}:${row.modelId}`}>
                <strong>{row.name}</strong> ·{" "}
                <span className={styles.mono}>
                  {row.providerKey}/{row.modelId}
                </span>
                {row.commercial ? " · commercial" : " · non-commercial"} — {row.note}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.panel}>
        <h2>Tenant model policies</h2>
        {items.length === 0 && !loading ? (
          <p className={styles.muted}>No model policies yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Provider / model</th>
                <th>Status</th>
                <th>Tokens</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td className={styles.mono}>
                    {row.providerKey}/{row.modelId}
                  </td>
                  <td>{row.status}</td>
                  <td>
                    {row.maxInputTokens}/{row.maxOutputTokens}
                  </td>
                  <td>
                    {canManage ? (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.buttonSecondary}
                          disabled={busy || row.status === "APPROVED"}
                          onClick={() => void setStatus(row.id, "APPROVED")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className={styles.buttonSecondary}
                          disabled={busy || row.status === "DISABLED"}
                          onClick={() => void setStatus(row.id, "DISABLED")}
                        >
                          Disable
                        </button>
                      </div>
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
          <h2>Add stub model policy</h2>
          <form className={styles.form} onSubmit={(event) => void onCreate(event)}>
            <div className={styles.formRow}>
              <label htmlFor="model-name">Name</label>
              <input
                id="model-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="model-id">Model id</label>
              <input
                id="model-id"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                required
              />
            </div>
            <button type="submit" className={styles.button} disabled={busy}>
              Create approved stub policy
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
