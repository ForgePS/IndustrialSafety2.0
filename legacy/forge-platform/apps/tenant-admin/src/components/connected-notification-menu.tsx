"use client";

import { useEffect, useRef, useState } from "react";
import { ForgeNotificationMenu, type ForgeLinkRender } from "@forge/ui";
import { useAuth } from "@/hooks/use-auth";
import { apiGet, apiSend } from "@/lib/api";

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export function ConnectedNotificationMenu({
  viewAllHref = "/notifications",
  renderLink,
}: {
  viewAllHref?: string;
  renderLink?: ForgeLinkRender;
}) {
  const { me, hasPermission } = useAuth();
  const tenantId = me?.tenantId ?? null;
  const canRead = hasPermission("tenant.notification.read");
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const generation = useRef(0);

  useEffect(() => {
    setOpen(false);
    setCount(0);
    setItems([]);
    if (!tenantId || !canRead) return;

    const gen = ++generation.current;
    const controller = new AbortController();

    void (async () => {
      try {
        const countRes = await apiGet<{ count: number }>(
          `/api/v1/tenants/${tenantId}/notifications/unread-count`,
          { signal: controller.signal },
        );
        if (gen !== generation.current || controller.signal.aborted) return;
        setCount(countRes.count);
      } catch {
        if (controller.signal.aborted) return;
        if (gen === generation.current) setCount(0);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [tenantId, canRead]);

  async function loadList() {
    if (!tenantId || !canRead) return;
    const gen = generation.current;
    try {
      const list = await apiGet<NotificationRow[]>(
        `/api/v1/tenants/${tenantId}/notifications?limit=8`,
      );
      if (gen !== generation.current) return;
      setItems(list);
    } catch {
      if (gen === generation.current) setItems([]);
    }
  }

  if (!canRead || !tenantId) {
    return (
      <ForgeNotificationMenu
        disabled
        disabledReason={
          !tenantId
            ? "Select a tenant to view notifications"
            : "Missing permission: tenant.notification.read"
        }
      />
    );
  }

  return (
    <ForgeNotificationMenu
      disabled={false}
      count={count}
      open={open}
      onToggle={() => {
        setOpen((value) => {
          const next = !value;
          if (next) void loadList();
          return next;
        });
      }}
      items={items.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        createdAt: row.createdAt,
        readAt: row.readAt,
      }))}
      onMarkRead={(id) => {
        void apiSend(`/api/v1/tenants/${tenantId}/notifications/${id}/read`, "POST").then(() =>
          loadList(),
        );
      }}
      onMarkAllRead={() => {
        void apiSend(`/api/v1/tenants/${tenantId}/notifications/read-all`, "POST").then(() =>
          loadList(),
        );
      }}
      viewAllHref={viewAllHref}
      {...(renderLink ? { renderLink } : {})}
    />
  );
}
