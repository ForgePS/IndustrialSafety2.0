"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type ApiKeyRow = {
  id: string;
  name: string;
  displayHint: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  apiKey?: string;
};

function ApiAccessInner() {
  const tenantId = useTenantId();
  const [items, setItems] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("Integration");
  const [scopes, setScopes] = useState("tenant.read");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await apiGet<ApiKeyRow[]>(`/api/v1/tenants/${tenantId}/api-keys`);
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createKey() {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    setRevealedKey(null);
    try {
      const created = await apiSend<ApiKeyRow>(`/api/v1/tenants/${tenantId}/api-keys`, "POST", {
        name,
        scopes: scopes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      if (created.apiKey) setRevealedKey(created.apiKey);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(id: string) {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/api-keys/${id}/revoke`, "POST");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    } finally {
      setBusy(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>API</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>API</h1>
      <p className={styles.lead}>Tenant API keys (`forge_live_`). Secrets are shown once.</p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {revealedKey ? (
        <div className={styles.panel}>
          <h2>Copy this key now</h2>
          <p className={styles.muted}>It will not be shown again.</p>
          <code style={{ wordBreak: "break-all" }}>{revealedKey}</code>
        </div>
      ) : null}

      <div className={styles.panel}>
        <h2>Create key</h2>
        <label>
          Name <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>
        <label style={{ display: "block", marginTop: "0.5rem" }}>
          Scopes (comma-separated){" "}
          <input
            value={scopes}
            onChange={(e) => setScopes(e.target.value)}
            disabled={busy}
            style={{ width: "100%" }}
          />
        </label>
        <div className={styles.actions} style={{ marginTop: "0.75rem" }}>
          <button type="button" onClick={() => void createKey()} disabled={busy}>
            Create
          </button>
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Keys</h2>
        {items.length === 0 ? (
          <p className={styles.muted}>No API keys yet.</p>
        ) : (
          <ul>
            {items.map((k) => (
              <li key={k.id} style={{ marginBottom: "0.75rem" }}>
                <strong>{k.name}</strong> · <code>{k.displayHint}</code>
                {k.revokedAt ? " · revoked" : null}
                <div className={styles.muted}>scopes: {k.scopes.join(", ") || "—"}</div>
                {!k.revokedAt ? (
                  <button type="button" onClick={() => void revokeKey(k.id)} disabled={busy}>
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <nav className={styles.linkRow}>
        <Link href="/integrations">Integrations</Link>
        <Link href="/security">Security</Link>
      </nav>
    </section>
  );
}

export default function ApiAccessPage() {
  return (
    <TenantPageGate title="API" permission="tenant.api_key.read">
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <ApiAccessInner />
      </Suspense>
    </TenantPageGate>
  );
}
