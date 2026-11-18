"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type WebhookEndpoint = {
  id: string;
  name: string;
  endpointUrl: string;
  eventTypes: string[];
  enabled: boolean;
  signingSecret?: string;
  createdAt: string;
};

type WebhookDelivery = {
  id: string;
  eventType: string;
  status: string;
  attemptCount: number;
  httpStatus: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
};

function IntegrationsInner() {
  const tenantId = useTenantId();
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("Outbound");
  const [url, setUrl] = useState("https://example.com/hooks");
  const [events, setEvents] = useState("membership.changed");
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await apiGet<WebhookEndpoint[]>(`/api/v1/tenants/${tenantId}/webhooks`);
      setEndpoints(rows);
      if (selectedId && !rows.some((r) => r.id === selectedId)) setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedId]);

  const loadDeliveries = useCallback(async () => {
    if (!tenantId || !selectedId) {
      setDeliveries([]);
      return;
    }
    try {
      const rows = await apiGet<WebhookDelivery[]>(
        `/api/v1/tenants/${tenantId}/webhooks/${selectedId}/deliveries`,
      );
      setDeliveries(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deliveries");
    }
  }, [tenantId, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadDeliveries();
  }, [loadDeliveries]);

  async function createEndpoint() {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    setRevealedSecret(null);
    try {
      const created = await apiSend<WebhookEndpoint>(
        `/api/v1/tenants/${tenantId}/webhooks`,
        "POST",
        {
          name,
          endpointUrl: url,
          eventTypes: events
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      );
      if (created.signingSecret) setRevealedSecret(created.signingSecret);
      setSelectedId(created.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create webhook");
    } finally {
      setBusy(false);
    }
  }

  async function setEnabled(id: string, enabled: boolean) {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/webhooks/${id}`, "PATCH", { enabled });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update webhook");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (!tenantId || !selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/webhooks/${selectedId}/deliveries`, "POST", {
        eventType: events.split(",")[0]?.trim() || "membership.changed",
        payload: { source: "tenant-admin-test" },
      });
      await loadDeliveries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delivery failed");
    } finally {
      setBusy(false);
    }
  }

  async function replay(deliveryId: string) {
    if (!tenantId || !selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(
        `/api/v1/tenants/${tenantId}/webhooks/${selectedId}/deliveries/${deliveryId}/replay`,
        "POST",
      );
      await loadDeliveries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Replay failed");
    } finally {
      setBusy(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Integrations</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Integrations</h1>
      <p className={styles.lead}>Outbound HTTPS webhooks with signed deliveries.</p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {revealedSecret ? (
        <div className={styles.panel}>
          <h2>Signing secret (copy once)</h2>
          <code style={{ wordBreak: "break-all" }}>{revealedSecret}</code>
        </div>
      ) : null}

      <div className={styles.panel}>
        <h2>Add endpoint</h2>
        <label>
          Name <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>
        <label style={{ display: "block", marginTop: "0.5rem" }}>
          URL{" "}
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block", marginTop: "0.5rem" }}>
          Events{" "}
          <input
            value={events}
            onChange={(e) => setEvents(e.target.value)}
            disabled={busy}
            style={{ width: "100%" }}
          />
        </label>
        <div className={styles.actions} style={{ marginTop: "0.75rem" }}>
          <button type="button" onClick={() => void createEndpoint()} disabled={busy}>
            Create
          </button>
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Endpoints</h2>
        {endpoints.length === 0 ? (
          <p className={styles.muted}>No webhook endpoints yet.</p>
        ) : (
          <ul>
            {endpoints.map((ep) => (
              <li key={ep.id} style={{ marginBottom: "0.75rem" }}>
                <button type="button" onClick={() => setSelectedId(ep.id)} disabled={busy}>
                  {selectedId === ep.id ? "● " : ""}
                  {ep.name}
                </button>{" "}
                · {ep.enabled ? "enabled" : "disabled"}
                <div className={styles.muted}>
                  {ep.endpointUrl} · {ep.eventTypes.join(", ")}
                </div>
                <div className={styles.actions}>
                  {ep.enabled ? (
                    <button
                      type="button"
                      onClick={() => void setEnabled(ep.id, false)}
                      disabled={busy}
                    >
                      Disable
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void setEnabled(ep.id, true)}
                      disabled={busy}
                    >
                      Enable
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedId ? (
        <div className={styles.panel}>
          <h2>Deliveries</h2>
          <div className={styles.actions} style={{ marginBottom: "0.75rem" }}>
            <button type="button" onClick={() => void sendTest()} disabled={busy}>
              Send test
            </button>
          </div>
          {deliveries.length === 0 ? (
            <p className={styles.muted}>No deliveries yet.</p>
          ) : (
            <ul>
              {deliveries.map((d) => (
                <li key={d.id} style={{ marginBottom: "0.5rem" }}>
                  {d.eventType} · {d.status} · attempts {d.attemptCount}
                  {d.durationMs != null ? ` · ${d.durationMs}ms` : ""}
                  {d.httpStatus != null ? ` · HTTP ${d.httpStatus}` : ""}
                  <button
                    type="button"
                    style={{ marginLeft: "0.5rem" }}
                    onClick={() => void replay(d.id)}
                    disabled={busy}
                  >
                    Replay
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <nav className={styles.linkRow}>
        <Link href="/api-access">API access</Link>
        <Link href="/audit">Audit</Link>
      </nav>
    </section>
  );
}

export default function IntegrationsPage() {
  return (
    <TenantPageGate title="Integrations" permission="tenant.webhook.read">
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <IntegrationsInner />
      </Suspense>
    </TenantPageGate>
  );
}
