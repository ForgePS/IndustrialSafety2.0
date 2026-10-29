"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  priority: string;
  destination: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
  expiresAt: string | null;
};

function NotificationsInner() {
  const tenantId = useTenantId();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [rows, countRes] = await Promise.all([
        apiGet<NotificationRow[]>(`/api/v1/tenants/${tenantId}/notifications?limit=50`),
        apiGet<{ count: number }>(`/api/v1/tenants/${tenantId}/notifications/unread-count`),
      ]);
      setItems(rows);
      setUnread(countRes.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/notifications/${id}/read`, "POST");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark read");
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/notifications/read-all`, "POST");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark all read");
    } finally {
      setBusy(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Notifications</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Notifications</h1>
      <p className={styles.lead}>
        Inbox for this tenant · unread <strong>{unread}</strong>
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      <div className={styles.actions} style={{ marginBottom: "1rem" }}>
        <button
          className={styles.button}
          type="button"
          disabled={busy || unread === 0}
          onClick={() => void markAllRead()}
        >
          Mark all read
        </button>
        <Link href="/studio/notification-templates">Studio · Notification templates</Link>
        <Link href="/studio/email-templates">Studio · Email templates</Link>
      </div>

      <div className={styles.panel}>
        {items.length === 0 ? (
          <p className={styles.muted}>No notifications yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Title</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td className={styles.mono}>{row.createdAt}</td>
                  <td>
                    <div>{row.title}</div>
                    <div className={styles.muted}>{row.body}</div>
                  </td>
                  <td className={styles.mono}>{row.type}</td>
                  <td>{row.priority}</td>
                  <td>{row.readAt ? "Read" : "Unread"}</td>
                  <td>
                    {!row.readAt ? (
                      <button
                        className={styles.buttonSecondary}
                        type="button"
                        disabled={busy}
                        onClick={() => void markRead(row.id)}
                      >
                        Mark read
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
    </section>
  );
}

export default function NotificationsPage() {
  return (
    <TenantPageGate title="Notifications" permission="tenant.notification.read">
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <NotificationsInner />
      </Suspense>
    </TenantPageGate>
  );
}
