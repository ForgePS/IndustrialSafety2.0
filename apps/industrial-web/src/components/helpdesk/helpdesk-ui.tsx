"use client";

import { useMemo, useRef, useState } from "react";
import { isAllowedHelpdeskAttachmentMime } from "@forge/contracts";
import {
  MAX_TICKET_ATTACHMENT_BYTES,
  TICKET_ATTACHMENT_ACCEPT,
  eventSentence,
  formatBytes,
  formatDateTime,
  guessMimeType,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  type HelpdeskAttachment,
  type HelpdeskEvent,
  type HelpdeskMessage,
} from "@/lib/helpdesk";

export function TicketStatusBadge({ status }: { status: string }) {
  return <span className={`badge bg-label-${statusTone(status)}`}>{statusLabel(status)}</span>;
}

export function TicketPriorityBadge({
  priority,
  short = true,
}: {
  priority: string | null | undefined;
  short?: boolean;
}) {
  return (
    <span className={`badge bg-label-${priorityTone(priority)}`}>
      {priorityLabel(priority, short)}
    </span>
  );
}

/** Validates a picked file against the Help Desk upload rules; returns an error message or null. */
export function validateTicketFile(file: File): string | null {
  if (file.size <= 0) return `${file.name} is empty`;
  if (file.size > MAX_TICKET_ATTACHMENT_BYTES) {
    return `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_TICKET_ATTACHMENT_BYTES)}`;
  }
  if (!isAllowedHelpdeskAttachmentMime(guessMimeType(file)))
    return `${file.name} is not a supported file type`;
  return null;
}

/** Stages files (including camera captures on phones) until the parent submits. */
export function AttachmentPicker({
  files,
  onChange,
  disabled,
  idPrefix,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const add = (list: FileList | null) => {
    if (!list?.length) return;
    const next = [...files];
    const problems: string[] = [];
    for (const file of Array.from(list)) {
      const problem = validateTicketFile(file);
      if (problem) problems.push(problem);
      else next.push(file);
    }
    setError(problems.join(". "));
    onChange(next.slice(0, 10));
    if (next.length > 10) setError("You can attach up to 10 files at a time.");
  };

  return (
    <div>
      <div className="d-flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
        >
          <i className="bx bx-paperclip me-1" />
          Attach files
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary d-xl-none"
          onClick={() => cameraRef.current?.click()}
          disabled={disabled}
        >
          <i className="bx bx-camera me-1" />
          Take photo
        </button>
        <input
          ref={fileRef}
          id={`${idPrefix}-files`}
          type="file"
          multiple
          accept={TICKET_ATTACHMENT_ACCEPT}
          className="d-none"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="d-none"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <p className="form-text mb-1">
        Screenshots, photos, PDFs, Office files, CSV, or short videos up to 25 MB each.
      </p>
      {error ? <p className="text-danger small mb-1">{error}</p> : null}
      {files.length ? (
        <ul className="list-unstyled mb-0 small">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="d-flex align-items-center gap-2 py-1">
              <i className="bx bx-file text-muted" />
              <span className="text-truncate">{f.name}</span>
              <span className="text-muted flex-shrink-0">{formatBytes(f.size)}</span>
              <button
                type="button"
                className="btn btn-sm btn-link text-danger p-0 ms-auto"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                disabled={disabled}
                aria-label={`Remove ${f.name}`}
              >
                <i className="bx bx-x" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type TimelineItem =
  | { kind: "description"; at: string | null; author: string; body: string }
  | { kind: "message"; at: string | null; message: HelpdeskMessage }
  | { kind: "attachment"; at: string | null; attachment: HelpdeskAttachment }
  | { kind: "event"; at: string | null; event: HelpdeskEvent };

function messageTitle(m: HelpdeskMessage): string {
  switch (m.messageType) {
    case "SUPPORT_REPLY":
      return `${m.authorName} (Forge Support)`;
    case "INTERNAL_NOTE":
      return `${m.authorName} - internal note`;
    case "SYSTEM_EVENT":
      return "System";
    default:
      return m.authorName;
  }
}

/** Chronological conversation, attachments, and status history for one ticket. */
export function TicketTimeline({
  description,
  requesterName,
  createdAt,
  messages,
  attachments,
  events,
  onOpenAttachment,
  onDeleteAttachment,
  supportView = false,
}: {
  description: string;
  requesterName: string;
  createdAt: string | null;
  messages: HelpdeskMessage[];
  attachments: HelpdeskAttachment[];
  events: HelpdeskEvent[];
  onOpenAttachment: (a: HelpdeskAttachment) => void;
  onDeleteAttachment?: (a: HelpdeskAttachment) => void;
  supportView?: boolean;
}) {
  const items = useMemo<TimelineItem[]>(() => {
    const list: TimelineItem[] = [
      { kind: "description", at: createdAt, author: requesterName, body: description },
    ];
    for (const m of messages) list.push({ kind: "message", at: m.createdAt, message: m });
    for (const a of attachments) list.push({ kind: "attachment", at: a.uploadedAt, attachment: a });
    for (const e of events) {
      if (e.eventType === "CREATED" || e.eventType === "ATTACHMENT_ADDED") continue;
      list.push({ kind: "event", at: e.createdAt, event: e });
    }
    return list.sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());
  }, [attachments, createdAt, description, events, messages, requesterName]);

  return (
    <ul className="list-unstyled mb-0">
      {items.map((item, idx) => {
        if (item.kind === "event") {
          return (
            <li
              key={`e-${item.event.id}`}
              className="d-flex gap-2 align-items-start small text-muted py-2"
            >
              <i className={`bx ${item.event.isInternal ? "bx-lock-alt" : "bx-history"} mt-1`} />
              <span>
                {eventSentence(item.event)}
                {item.event.isInternal && supportView ? (
                  <span className="badge bg-label-warning ms-2">Internal</span>
                ) : null}
                <span className="ms-2">{formatDateTime(item.at)}</span>
              </span>
            </li>
          );
        }
        if (item.kind === "attachment") {
          const a = item.attachment;
          return (
            <li key={`a-${a.id}`} className="py-2">
              <div
                className={`d-flex flex-wrap align-items-center gap-2 border rounded px-3 py-2 ${a.isInternal ? "border-warning bg-label-warning" : ""}`}
              >
                <i className="bx bx-paperclip" />
                <button
                  type="button"
                  className="btn btn-link p-0 text-start text-break"
                  onClick={() => onOpenAttachment(a)}
                >
                  {a.originalFilename}
                </button>
                <span className="small text-muted">{formatBytes(a.sizeBytes)}</span>
                <span className="small text-muted">
                  {a.uploadedByName ? `by ${a.uploadedByName}` : ""} {formatDateTime(a.uploadedAt)}
                </span>
                {a.isInternal ? (
                  <span className="badge bg-warning text-dark">Internal only</span>
                ) : null}
                {onDeleteAttachment ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-danger p-0 ms-auto"
                    onClick={() => onDeleteAttachment(a)}
                    aria-label={`Remove ${a.originalFilename}`}
                  >
                    <i className="bx bx-trash" />
                  </button>
                ) : null}
              </div>
            </li>
          );
        }
        const internal = item.kind === "message" && item.message.isInternal;
        const fromSupport = item.kind === "message" && item.message.authorType === "SUPPORT";
        const title =
          item.kind === "description"
            ? `${item.author} opened this ticket`
            : messageTitle(item.message);
        const body = item.kind === "description" ? item.body : item.message.body;
        return (
          <li key={item.kind === "message" ? `m-${item.message.id}` : `d-${idx}`} className="py-2">
            <div
              className={`rounded border p-3 ${
                internal
                  ? "border-warning bg-label-warning"
                  : fromSupport
                    ? "border-primary bg-label-primary"
                    : "bg-body"
              }`}
            >
              <div className="d-flex flex-wrap justify-content-between gap-2 mb-1">
                <span className="fw-semibold">
                  {internal ? <i className="bx bx-lock-alt me-1" /> : null}
                  {title}
                </span>
                <span className="small text-muted">{formatDateTime(item.at)}</span>
              </div>
              {internal ? (
                <div className="small fw-semibold text-warning mb-1">
                  Internal note - not visible to the customer
                </div>
              ) : null}
              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{body}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
