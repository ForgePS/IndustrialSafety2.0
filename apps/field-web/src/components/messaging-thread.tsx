"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { ApiError, useAuth } from "@forge/web-kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import {
  fieldMessagingApi,
  isFieldMessagingImage,
  loadFieldMessagingAttachmentObjectUrl,
} from "@/lib/messaging-api";
import {
  annotateMessageClusters,
  displayPersonName,
  formatMessageTime,
  initialsFromName,
  messagingThreadTitleDisplay,
  type MessagingAttachment,
  type MessagingMessage,
  type MessagingThread,
} from "@/lib/messaging";

function MessagingThreadInner() {
  const params = useParams();
  const threadId = decodeURIComponent(String(params.threadId ?? "")).trim();
  const { me } = useAuth();
  const { moduleEnabled } = useFieldPermissions();
  const enabled = moduleEnabled("MESSAGING");
  const [thread, setThread] = useState<MessagingThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollSinceRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const refresh = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!enabled || !threadId || threadId === "placeholder") {
        setLoading(false);
        return;
      }
      if (!opts?.soft) {
        setLoading(true);
        setError(null);
      }
      try {
        const next = await fieldMessagingApi.getThread(threadId, { limit: 80 });
        setThread(next);
        const messages = next.messages ?? [];
        const last = messages[messages.length - 1];
        pollSinceRef.current = last?.createdAt ?? null;
        void fieldMessagingApi.markRead(threadId).catch(() => undefined);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load conversation");
        if (!opts?.soft) setThread(null);
      } finally {
        setLoading(false);
      }
    },
    [enabled, threadId],
  );

  const pollNew = useCallback(async () => {
    if (!enabled || !threadId || threadId === "placeholder") return;
    const since = pollSinceRef.current;
    if (!since) {
      await refresh({ soft: true });
      return;
    }
    try {
      const next = await fieldMessagingApi.getThread(threadId, { since, limit: 50 });
      const incoming = next.messages ?? [];
      if (incoming.length === 0) return;
      setThread((prev) => {
        if (!prev) return next;
        const seen = new Set((prev.messages ?? []).map((m) => m.id));
        const merged = [...(prev.messages ?? [])];
        for (const msg of incoming) {
          if (!seen.has(msg.id)) merged.push(msg);
        }
        return { ...prev, ...next, messages: merged };
      });
      pollSinceRef.current = incoming[incoming.length - 1]?.createdAt ?? since;
      void fieldMessagingApi.markRead(threadId).catch(() => undefined);
    } catch {
      // Keep the open transcript; next poll retries.
    }
  }, [enabled, threadId, refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !threadId || threadId === "placeholder") return;
    const timer = window.setInterval(() => {
      void pollNew();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [enabled, threadId, pollNew]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread?.messages?.length]);

  const title = useMemo(
    () => (thread ? messagingThreadTitleDisplay(thread, me?.userId) : "Conversation"),
    [thread, me?.userId],
  );

  const clustered = useMemo(
    () => annotateMessageClusters(thread?.messages ?? []),
    [thread?.messages],
  );

  async function onSend(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if ((!text && !pendingImage) || !threadId || sending) return;
    setSending(true);
    setError(null);
    try {
      const attachmentIds = pendingImage
        ? [await fieldMessagingApi.uploadImage(threadId, pendingImage)]
        : undefined;
      const message = await fieldMessagingApi.sendMessage(threadId, {
        ...(text ? { body: text } : {}),
        ...(attachmentIds ? { attachmentIds } : {}),
      });
      setThread((prev) =>
        prev
          ? {
              ...prev,
              messages: [...(prev.messages ?? []), message],
              lastMessageAt: message.createdAt,
            }
          : prev,
      );
      pollSinceRef.current = message.createdAt;
      setBody("");
      setPendingImage(null);
      stickToBottomRef.current = true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send message");
    } finally {
      setSending(false);
    }
  }

  if (!enabled) {
    return (
      <EmptyState
        title="Messages unavailable"
        message="Messaging is not enabled for this organization."
      />
    );
  }

  if (!threadId || threadId === "placeholder") {
    return (
      <EmptyState title="Conversation not found" message="Open Messages and pick a conversation." />
    );
  }

  return (
    <div className="ff-msg-thread">
      <header className="ff-msg-thread-head">
        <div className="ff-msg-thread-head-main">
          <span className="ff-msg-avatar ff-msg-avatar--sm" aria-hidden="true">
            {initialsFromName(title)}
          </span>
          <h1 className="ff-msg-thread-title">{title}</h1>
        </div>
      </header>

      {loading ? <LoadingState label="Loading conversation…" /> : null}
      {!loading && error && !thread ? (
        <ErrorState
          title="Conversation unavailable"
          message={error}
          onRetry={() => void refresh()}
        />
      ) : null}

      {!loading && thread ? (
        <>
          <div
            className="ff-msg-scroll"
            ref={scrollRef}
            onScroll={(event) => {
              const el = event.currentTarget;
              stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
          >
            {clustered.length === 0 ? (
              <EmptyState title="No messages yet" message="Say hello to start the conversation." />
            ) : (
              clustered.map((message) => <MessageBubble key={message.id} message={message} />)
            )}
          </div>
          {error ? <p className="ff-msg-send-error">{error}</p> : null}
          <form className="ff-msg-composer" onSubmit={(event) => void onSend(event)}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="ff-visually-hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                if (!file) return;
                if (!file.type.startsWith("image/") && file.type) {
                  setError("Choose an image file.");
                  return;
                }
                setError(null);
                setPendingImage(file);
              }}
            />
            <button
              type="button"
              className="ff-btn ff-btn-secondary ff-msg-photo"
              disabled={sending}
              onClick={() => fileInputRef.current?.click()}
            >
              Photo
            </button>
            <label className="ff-label" htmlFor="ff-msg-input">
              Message
            </label>
            <textarea
              id="ff-msg-input"
              className="ff-msg-input"
              rows={2}
              value={body}
              placeholder={pendingImage ? "Add a caption (optional)…" : "Write a message…"}
              disabled={sending}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void onSend(event as unknown as FormEvent);
                }
              }}
            />
            <button
              type="submit"
              className="ff-btn ff-btn-primary"
              disabled={sending || (!body.trim() && !pendingImage)}
            >
              {sending ? "Sending…" : "Send"}
            </button>
            {pendingImage ? (
              <p className="ff-msg-pending-photo">
                {pendingImage.name || "Photo"} ready.{" "}
                <button
                  type="button"
                  className="ff-btn ff-btn-secondary"
                  onClick={() => setPendingImage(null)}
                >
                  Remove
                </button>
              </p>
            ) : null}
          </form>
        </>
      ) : null}
    </div>
  );
}

function MessageBubble({
  message,
}: {
  message: MessagingMessage & {
    showSender: boolean;
    isClusterStart: boolean;
    isClusterEnd: boolean;
  };
}) {
  const sender = displayPersonName(message.senderName, "User");
  return (
    <div
      className={[
        "ff-msg-row",
        message.isOwn ? "ff-msg-row--own" : "ff-msg-row--other",
        message.isClusterStart ? "ff-msg-row--cluster-start" : "",
        message.isClusterEnd ? "ff-msg-row--cluster-end" : "",
        !message.isClusterStart && !message.isClusterEnd ? "ff-msg-row--cluster-middle" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!message.isOwn ? (
        message.showSender ? (
          <span className="ff-msg-avatar ff-msg-avatar--sm" aria-hidden="true">
            {initialsFromName(sender)}
          </span>
        ) : (
          <span className="ff-msg-avatar-spacer" aria-hidden="true" />
        )
      ) : null}
      <div className="ff-msg-stack">
        {message.showSender ? (
          <div className="ff-msg-meta">
            {!message.isOwn ? <span className="ff-msg-sender">{sender}</span> : null}
            <span className="ff-msg-time">{formatMessageTime(message.createdAt)}</span>
          </div>
        ) : null}
        <div
          className={[
            "ff-msg-bubble",
            message.isOwn ? "ff-msg-bubble--own" : "ff-msg-bubble--other",
          ].join(" ")}
        >
          {message.body ? <p className="ff-msg-bubble-text">{message.body}</p> : null}
          {(message.attachments ?? []).map((attachment) => (
            <FieldAttachmentPreview key={attachment.id} attachment={attachment} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldAttachmentPreview({ attachment }: { attachment: MessagingAttachment }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const isImage = isFieldMessagingImage(attachment);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    let created: string | null = null;
    void (async () => {
      try {
        const url = await loadFieldMessagingAttachmentObjectUrl(attachment.id);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setImageUrl(url);
      } catch {
        // Keep filename fallback below.
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [attachment.id, isImage]);

  if (attachment.attachmentType === "LINK" && attachment.linkUrl) {
    return (
      <a
        className="ff-msg-bubble-attach ff-msg-bubble-attach--link"
        href={attachment.linkUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {attachment.linkTitle ?? attachment.linkUrl}
      </a>
    );
  }

  if (isImage && imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="ff-msg-bubble-image"
        src={imageUrl}
        alt={attachment.originalFilename ?? "Image"}
      />
    );
  }

  return (
    <p className="ff-msg-bubble-attach">
      {attachment.originalFilename ?? (isImage ? "Image" : "Attachment")}
    </p>
  );
}

export function MessagingThreadView() {
  return (
    <Suspense fallback={<LoadingState label="Loading conversation…" />}>
      <MessagingThreadInner />
    </Suspense>
  );
}
