"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiSend, useAuth } from "@forge/web-kit";
import { useMessagingPopout } from "@/components/messaging-popout-context";
import { INDUSTRIAL_MESSAGING_THREAD_READ_EVENT } from "@/lib/messaging";
import { playNotificationChime, unlockNotificationAudio } from "@/lib/notification-sound";

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  href?: string | null;
  type?: string | null;
  createdAt: string | Date;
  readAt: string | Date | null;
};

const POLL_MS = 30_000;

/**
 * Industrial navbar notification bell — lists the signed-in user's
 * in-app notifications (including messaging and form signature requests).
 */
export function IndustrialNotificationMenu() {
  const { me } = useAuth();
  const { openPopout } = useMessagingPopout();
  const canRead = Boolean(
    me?.permissions?.includes("industrial.access") ||
      me?.permissions?.includes("industrial.admin") ||
      me?.permissions?.includes("industrial.forms.view") ||
      me?.permissions?.includes("field.access"),
  );
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const rootRef = useRef<HTMLLIElement | null>(null);
  const previousCountRef = useRef<number | null>(null);
  const primedRef = useRef(false);

  const refreshCount = useCallback(async () => {
    if (!canRead) {
      setCount(0);
      previousCountRef.current = 0;
      return;
    }
    try {
      const data = await apiGet<{ count: number }>(
        "/api/v1/industrial/my-notifications/unread-count",
      );
      const next = Number(data.count ?? 0);
      const prev = previousCountRef.current;
      if (prev !== null && next > prev) {
        playNotificationChime();
      }
      previousCountRef.current = next;
      setCount(next);
    } catch {
      setCount(0);
    }
  }, [canRead]);

  useEffect(() => {
    if (!canRead || primedRef.current) return;
    primedRef.current = true;
    const unlock = () => unlockNotificationAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [canRead]);

  useEffect(() => {
    void refreshCount();
    const timer = window.setInterval(() => void refreshCount(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshCount]);

  useEffect(() => {
    function onThreadRead() {
      void refreshCount();
    }
    window.addEventListener(INDUSTRIAL_MESSAGING_THREAD_READ_EVENT, onThreadRead);
    return () => window.removeEventListener(INDUSTRIAL_MESSAGING_THREAD_READ_EVENT, onThreadRead);
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function openMenu() {
    unlockNotificationAudio();
    const next = !open;
    setOpen(next);
    if (!next || !canRead) return;
    try {
      const list = await apiGet<NotificationRow[]>("/api/v1/industrial/my-notifications", {
        query: { limit: "8" },
      });
      setItems(Array.isArray(list) ? list : []);
      await refreshCount();
    } catch {
      setItems([]);
    }
  }

  async function markRead(id: string, href?: string | null) {
    try {
      await apiSend(`/api/v1/industrial/my-notifications/${encodeURIComponent(id)}/read`, "POST");
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      );
      setCount((prev) => Math.max(0, prev - 1));
      previousCountRef.current = Math.max(0, (previousCountRef.current ?? 1) - 1);
    } catch {
      // ignore
    }
    if (!href) return;
    setOpen(false);
    unlockNotificationAudio();
    if (href.includes("/modules/messaging")) {
      const threadMatch = href.match(/[?&]thread=([^&]+)/);
      openPopout(threadMatch?.[1] ? decodeURIComponent(threadMatch[1]) : undefined);
      return;
    }
    window.location.assign(href);
  }

  async function markAllRead() {
    if (count <= 0) return;
    try {
      await apiSend("/api/v1/industrial/my-notifications/read-all", "POST");
      const now = new Date().toISOString();
      setItems((prev) => prev.map((item) => (item.readAt ? item : { ...item, readAt: now })));
      setCount(0);
      previousCountRef.current = 0;
    } catch {
      // ignore
    }
  }

  if (!canRead) return null;

  return (
    <li className="nav-item dropdown" ref={rootRef}>
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary position-relative"
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => void openMenu()}
      >
        <i className="bx bx-bell" aria-hidden="true" />
        {count > 0 ? (
          <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
            {count > 9 ? "9+" : count}
            <span className="visually-hidden">unread</span>
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="dropdown-menu dropdown-menu-end show p-0 shadow"
          style={{
            minWidth: "20rem",
            maxWidth: "24rem",
            position: "absolute",
            top: "calc(100% + 0.5rem)",
            bottom: "auto",
            right: 0,
            left: "auto",
            transform: "none",
            zIndex: 1080,
          }}
        >
          <div className="dropdown-header d-flex justify-content-between align-items-center gap-2">
            <span>Notifications</span>
            <div className="d-flex align-items-center gap-2">
              <small className="text-muted">{count} unread</small>
              {count > 0 ? (
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0"
                  onClick={() => void markAllRead()}
                >
                  Mark all read
                </button>
              ) : null}
            </div>
          </div>
          <div
            className="list-group list-group-flush"
            style={{ maxHeight: "min(24rem, calc(100vh - 12rem))", overflowY: "auto" }}
          >
            {items.length === 0 ? (
              <div className="list-group-item text-muted small">No notifications yet.</div>
            ) : (
              items.map((item) => {
                const unread = !item.readAt;
                const created =
                  typeof item.createdAt === "string"
                    ? item.createdAt.slice(0, 10)
                    : item.createdAt instanceof Date
                      ? item.createdAt.toISOString().slice(0, 10)
                      : "";
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`list-group-item list-group-item-action text-start${
                      unread ? " bg-label-warning" : ""
                    }`}
                    onClick={() => void markRead(item.id, item.href)}
                  >
                    <strong className="d-block">{item.title}</strong>
                    <span className="small text-muted d-block">{item.body}</span>
                    {created ? <span className="small text-muted">{created}</span> : null}
                  </button>
                );
              })
            )}
          </div>
          <div className="dropdown-footer text-center py-2 d-flex justify-content-center gap-3">
            <button
              type="button"
              className="btn btn-link btn-sm p-0"
              onClick={() => {
                setOpen(false);
                unlockNotificationAudio();
                openPopout();
              }}
            >
              Messaging
            </button>
            <Link href="/modules/forms/?tab=submissions" className="small" onClick={() => setOpen(false)}>
              Forms
            </Link>
          </div>
        </div>
      ) : null}
    </li>
  );
}
