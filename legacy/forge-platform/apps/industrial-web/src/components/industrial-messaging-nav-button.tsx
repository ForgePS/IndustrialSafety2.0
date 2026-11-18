"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiGet, sessionModuleEnabled, useAuth } from "@forge/web-kit";
import { useMessagingPopout } from "@/components/messaging-popout-context";
import { messagingThreadTitleDisplay } from "@/lib/messaging";
import { playNotificationChime, unlockNotificationAudio } from "@/lib/notification-sound";

const POLL_MS = 30_000;
const TOAST_MS = 8_000;

type UnreadSummaryResponse = {
  totalUnread?: number;
  focus?: {
    threadId?: string;
    threadType?: string;
    title?: string;
    lastMessagePreview?: string;
    unreadCount?: number;
  } | null;
};

type IncomingToast = {
  key: number;
  threadId?: string;
  title: string;
  preview: string;
  count: number;
};

/**
 * Top-bar Messaging shortcut: opens a floating popout so you can keep working.
 * Chimes and shows an on-screen toast when unread increases while the popout is closed
 * or minimized.
 */
export function IndustrialMessagingNavButton() {
  const { me } = useAuth();
  const { open, minimized, openPopout, togglePopout } = useMessagingPopout();
  const canAccess = Boolean(
    me?.permissions?.includes("industrial.access") ||
    me?.permissions?.includes("industrial.admin") ||
    me?.isPlatformAdmin,
  );
  const messagingEnabled = sessionModuleEnabled(me, "MESSAGING");
  const currentUserId = me?.userId ?? "";

  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<IncomingToast | null>(null);
  const [mounted, setMounted] = useState(false);
  const previousUnreadRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const toastKeyRef = useRef(0);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback((next: Omit<IncomingToast, "key">) => {
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastKeyRef.current += 1;
    setToast({ ...next, key: toastKeyRef.current });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, TOAST_MS);
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!canAccess || !messagingEnabled) {
      setUnread(0);
      previousUnreadRef.current = 0;
      return;
    }
    try {
      const data = await apiGet<UnreadSummaryResponse>(
        "/api/v1/industrial/messaging/unread-summary",
      );
      const next = Number(data.totalUnread ?? 0);
      const prev = previousUnreadRef.current;
      const popoutExpanded = open && !minimized;
      // Popout/workspace owns alerts while expanded; notify when closed or minimized.
      if (prev !== null && next > prev && !popoutExpanded) {
        playNotificationChime();
        const delta = next - prev;
        const focus = data.focus;
        const title = focus
          ? messagingThreadTitleDisplay(
              {
                title: focus.title ?? "Messages",
                threadType: focus.threadType ?? "DIRECT",
              },
              currentUserId,
            )
          : "Messages";
        const preview =
          focus?.lastMessagePreview?.trim() ||
          (delta === 1 ? "You have a new message" : `You have ${delta} new messages`);
        showToast({
          ...(focus?.threadId?.trim() ? { threadId: focus.threadId.trim() } : {}),
          title,
          preview,
          count: delta,
        });
      }
      previousUnreadRef.current = next;
      setUnread(next);
    } catch {
      // Keep last known count; messaging may be temporarily unavailable.
    }
  }, [canAccess, messagingEnabled, minimized, open, currentUserId, showToast]);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!canAccess || !messagingEnabled) return;
    const unlock = () => unlockNotificationAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [canAccess, messagingEnabled]);

  useEffect(() => {
    void refreshUnread();
    const timer = window.setInterval(() => void refreshUnread(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshUnread]);

  // Hide the toast once Messages is open and expanded.
  useEffect(() => {
    if (open && !minimized) dismissToast();
  }, [open, minimized, dismissToast]);

  if (!canAccess || !messagingEnabled) return null;

  const toastNode =
    mounted && toast
      ? createPortal(
          <div className="messaging-incoming-toast" role="status" aria-live="polite">
            <button
              type="button"
              className="messaging-incoming-toast__card"
              onClick={() => {
                unlockNotificationAudio();
                dismissToast();
                openPopout(toast.threadId);
              }}
            >
              <span className="messaging-incoming-toast__icon" aria-hidden>
                <i className="bx bx-message-rounded-dots" />
              </span>
              <span className="messaging-incoming-toast__copy min-w-0">
                <span className="messaging-incoming-toast__eyebrow">
                  {toast.count === 1 ? "New message" : `${toast.count} new messages`}
                </span>
                <span className="messaging-incoming-toast__title text-truncate">{toast.title}</span>
                <span className="messaging-incoming-toast__preview text-truncate">
                  {toast.preview}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="btn-close messaging-incoming-toast__close"
              aria-label="Dismiss new message notification"
              onClick={dismissToast}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <li className="nav-item">
        <button
          type="button"
          className={`btn btn-sm position-relative${open && !minimized ? " btn-primary" : " btn-outline-secondary"}`}
          aria-label={unread > 0 ? `Messaging, ${unread} unread` : "Messaging"}
          aria-expanded={open && !minimized}
          title="Messages"
          onClick={() => {
            unlockNotificationAudio();
            togglePopout();
          }}
        >
          <i className="bx bx-message-rounded-dots" aria-hidden="true" />
          <span className="ind-navbar-end-label d-none d-xl-inline ms-1">Messages</span>
          {unread > 0 ? (
            <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
              {unread > 9 ? "9+" : unread}
              <span className="visually-hidden">unread messages</span>
            </span>
          ) : null}
        </button>
      </li>
      {toastNode}
    </>
  );
}
