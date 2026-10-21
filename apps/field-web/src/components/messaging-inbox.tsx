"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, useAuth } from "@forge/web-kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { fieldMessagingApi } from "@/lib/messaging-api";
import {
  formatMessageTime,
  initialsFromName,
  messagingThreadTitleDisplay,
  type MessagingThread,
} from "@/lib/messaging";

function MessagingInboxInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { me } = useAuth();
  const { moduleEnabled } = useFieldPermissions();
  const enabled = moduleEnabled("MESSAGING");
  const [threads, setThreads] = useState<MessagingThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const threadDeepLink = String(search.get("thread") ?? search.get("threadId") ?? "").trim();

  useEffect(() => {
    if (threadDeepLink) {
      router.replace(`/messaging/${encodeURIComponent(threadDeepLink)}/`);
    }
  }, [threadDeepLink, router]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const rows = await fieldMessagingApi.listThreads();
      setThreads(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load messages");
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
    if (!enabled) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  const sorted = useMemo(() => {
    return [...threads].sort((a, b) => {
      const aTime = Date.parse(a.lastMessageAt ?? "") || 0;
      const bTime = Date.parse(b.lastMessageAt ?? "") || 0;
      return bTime - aTime;
    });
  }, [threads]);

  if (!enabled) {
    return (
      <EmptyState
        title="Messages unavailable"
        message="Messaging is not enabled for this organization."
      />
    );
  }

  if (threadDeepLink) {
    return <LoadingState label="Opening conversation…" />;
  }

  return (
    <>
      <div className="ff-section-head">
        <h1 className="ff-page-title ff-section-title--inline">Messages</h1>
        <button
          type="button"
          className="ff-link-btn"
          onClick={() => router.push("/messaging/new/")}
        >
          New
        </button>
      </div>
      <p className="ff-page-body">Conversations from Forge Industrial Safety.</p>

      {loading ? <LoadingState label="Loading messages…" /> : null}
      {!loading && error ? (
        <ErrorState title="Messages unavailable" message={error} onRetry={() => void refresh()} />
      ) : null}
      {!loading && !error && sorted.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          message="Start a message with a teammate from New."
        />
      ) : null}
      {!loading && !error && sorted.length > 0 ? (
        <div className="ff-msg-inbox" role="list">
          {sorted.map((thread) => {
            const title = messagingThreadTitleDisplay(thread, me?.userId);
            const unread = Number(thread.unreadCount ?? 0);
            return (
              <button
                key={thread.id}
                type="button"
                className="ff-msg-inbox-row"
                role="listitem"
                onClick={() => router.push(`/messaging/${encodeURIComponent(thread.id)}/`)}
              >
                <span className="ff-msg-avatar" aria-hidden="true">
                  {initialsFromName(title)}
                </span>
                <span className="ff-msg-inbox-body">
                  <span className="ff-msg-inbox-top">
                    <span className="ff-msg-inbox-title">{title}</span>
                    <span className="ff-msg-inbox-time">
                      {formatMessageTime(thread.lastMessageAt)}
                    </span>
                  </span>
                  <span className="ff-msg-inbox-preview">
                    {thread.lastMessagePreview?.trim() || "No messages yet"}
                  </span>
                </span>
                {unread > 0 ? (
                  <span className="ff-msg-unread-pill">{unread > 99 ? "99+" : unread}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

export function MessagingInbox() {
  return (
    <Suspense fallback={<LoadingState label="Loading messages…" />}>
      <MessagingInboxInner />
    </Suspense>
  );
}
