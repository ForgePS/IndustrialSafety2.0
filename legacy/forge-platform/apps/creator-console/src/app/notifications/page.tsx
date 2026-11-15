"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, ForgePageHeader, LoadingState } from "@forge/ui";
import { useAuth } from "@/hooks/use-auth";
import { apiGet } from "@/lib/api";
import styles from "../page.module.css";

type NotificationRow = {
  id: string;
  title?: string;
  body?: string;
  message?: string;
  createdAt?: string;
  readAt?: string | null;
  href?: string | null;
};

function NotificationsInner() {
  const { me } = useAuth();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me?.tenantId) {
      setLoading(false);
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await apiGet<NotificationRow[]>(`/api/v1/tenants/${me.tenantId}/notifications`);
      setRows(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't load notifications.");
    } finally {
      setLoading(false);
    }
  }, [me?.tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Notifications"
        subtitle="Migration, invitation, billing, and health alerts for your workspace."
      />
      {error ? <ErrorState title="Notifications unavailable" description={error} /> : null}
      {loading ? <LoadingState label="Loading notifications…" /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="You're all caught up" description="No notifications pending." />
      ) : null}
      {rows.length > 0 ? (
        <ul className={styles.attentionList}>
          {rows.map((n) => (
            <li key={n.id}>
              <Link href={n.href || "/"} className={styles.attentionLink}>
                <span>
                  <strong>{n.title ?? "Notification"}</strong>
                  <div className={styles.muted}>{n.body ?? n.message ?? ""}</div>
                  {n.createdAt ? (
                    <div className={styles.muted}>{new Date(n.createdAt).toLocaleString()}</div>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default function NotificationsPage() {
  return <NotificationsInner />;
}
