"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import {
  detectLinks,
  ensureMessagingFilename,
  formatFileSize,
  formatMessageTime,
  guessMessagingMime,
  initialsFromName,
  annotateMessageClusters,
  messagingMemberNames,
  messagingMessageViewedLabel,
  messagingParticipantLine,
  messagingThreadTitleDisplay,
  isMessagingImageAttachment,
  loadMessagingAttachmentObjectUrl,
  notifyMessagingThreadRead,
  putPresignedMessagingUpload,
  splitMessageBodyWithLinks,
  tenantUserOptions,
  type MessagingAttachment,
  type MessagingMessage,
  type MessagingThread,
  type PendingUpload,
  type TenantUserOption,
} from "@/lib/messaging";
import { personNameDisplay } from "@/lib/person-name-display";
import {
  loadOrgFilterCatalogs,
  type LookupOption,
} from "@/lib/personnel-lookups";
import type { DepartmentOption, DivisionOption } from "@/lib/personnel-assignment";
import { OrgLocationCascade } from "@/components/org-location-cascade";
import { playNotificationChime, unlockNotificationAudio } from "@/lib/notification-sound";
import { insertTextAtSelection, MESSAGING_EMOJI_GROUPS } from "@/lib/messaging-emoji";

const POLL_MS = 5_000;
/** Quiet background refresh while Messages stays open; nav badge uses unread-summary. */
const THREAD_LIST_POLL_MS = 30_000;
const ATTACHMENT_ACCEPT =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.zip";

type UploadUrlResponse = {
  attachmentId: string;
  uploadUrl: string;
  attachmentType: string;
  originalFilename: string;
  mimeType: string;
};

function PresenceDot({
  online,
  className = "",
  title,
}: {
  online: boolean;
  className?: string;
  title?: string;
}) {
  const label = title ?? (online ? "Online on the Platform" : "Offline");
  return (
    <span
      className={`messaging-presence-dot${online ? " messaging-presence-dot--online" : ""}${className ? ` ${className}` : ""}`}
      title={label}
      aria-label={label}
      role="img"
    />
  );
}

function dmPeerOnline(
  thread: Pick<MessagingThread, "threadType" | "members"> | null | undefined,
  currentUserId?: string,
): boolean | null {
  if (!thread || String(thread.threadType).toUpperCase() === "GROUP") return null;
  const other = (thread.members ?? []).find((member) => member.userId !== currentUserId);
  if (!other) return null;
  return Boolean(other.isOnline);
}

function groupOnlineCount(
  members: MessagingThread["members"] | undefined,
  currentUserId?: string,
): number {
  return (members ?? []).filter(
    (member) => member.userId !== currentUserId && Boolean(member.isOnline),
  ).length;
}

function MessageBody({ body }: { body: string }) {
  const segments = splitMessageBodyWithLinks(body);
  const emojiOnly = /^\p{Extended_Pictographic}(\s*\p{Extended_Pictographic})*$/u.test(body.trim());
  return (
    <p
      className={`mb-0 text-break messaging-message-body${emojiOnly ? " fs-3 lh-1" : ""}`}
    >
      {segments.map((segment, index) =>
        segment.type === "link" ? (
          <a key={index} href={segment.value} target="_blank" rel="noopener noreferrer">
            {segment.value}
          </a>
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
    </p>
  );
}

function AttachmentCard({
  attachment,
  onOpen,
}: {
  attachment: MessagingAttachment;
  onOpen: (attachment: MessagingAttachment) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const isImage = isMessagingImageAttachment(attachment);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const url = await loadMessagingAttachmentObjectUrl(attachment.id);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setImageUrl(url);
      } catch {
        // Fall back to the download button below.
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, isImage]);

  if (attachment.attachmentType === "LINK") {
    return (
      <a
        href={attachment.linkUrl ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="d-block border rounded p-2 mt-2 text-decoration-none bg-light"
      >
        <div className="fw-medium text-primary">{attachment.linkTitle ?? attachment.linkUrl}</div>
        {attachment.linkDescription ? (
          <div className="small text-muted">{attachment.linkDescription}</div>
        ) : null}
        <div className="small text-muted text-truncate">{attachment.linkUrl}</div>
      </a>
    );
  }

  if (isImage && imageUrl) {
    return (
      <button
        type="button"
        className="btn p-0 border-0 mt-2 d-block text-start"
        onClick={() => onOpen(attachment)}
        title={attachment.originalFilename ?? "Open image"}
      >
        {/* Blob URL from authenticated /content stream — not a cross-origin S3 img. */}
        <img
          src={imageUrl}
          alt={attachment.originalFilename ?? "Image attachment"}
          className="rounded border"
          style={{ maxWidth: "100%", maxHeight: 240, objectFit: "contain" }}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-sm btn-outline-secondary mt-2 d-flex align-items-center gap-2"
      onClick={() => onOpen(attachment)}
    >
      <span className={`ti ${isImage ? "ti-photo" : "ti-paperclip"}`} aria-hidden />
      <span className="text-start">
        <span className="d-block">{attachment.originalFilename ?? "Attachment"}</span>
        {attachment.fileSizeBytes ? (
          <span className="small text-muted">{formatFileSize(attachment.fileSizeBytes)}</span>
        ) : null}
      </span>
    </button>
  );
}

function EmojiPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="border rounded shadow-sm bg-white p-2 messaging-emoji-picker"
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        zIndex: 20,
        width: "min(22rem, 90vw)",
        maxHeight: "16rem",
        overflow: "auto",
        marginBottom: "0.35rem",
      }}
      role="dialog"
      aria-label="Emoji picker"
    >
      {MESSAGING_EMOJI_GROUPS.map((group) => (
        <div key={group.label} className="mb-2">
          <div className="small text-muted px-1 mb-1">{group.label}</div>
          <div className="d-flex flex-wrap gap-1">
            {group.emojis.map((emoji) => (
              <button
                key={`${group.label}-${emoji}`}
                type="button"
                className="btn btn-sm btn-text-secondary"
                style={{ fontSize: "1.25rem", lineHeight: 1, width: "2rem", height: "2rem" }}
                onClick={() => onPick(emoji)}
                aria-label={`Insert ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MessagingParticipantPicker({
  users,
  sites = [],
  departments = [],
  divisionEntries = [],
  selected,
  onChange,
  mode,
}: {
  users: TenantUserOption[];
  sites?: LookupOption[];
  departments?: LookupOption[];
  divisionEntries?: DivisionOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  mode: "DIRECT" | "GROUP";
}) {
  const [siteFilter, setSiteFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [departmentNameFilter, setDepartmentNameFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [availableChecked, setAvailableChecked] = useState<string[]>([]);
  const [memberChecked, setMemberChecked] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const matchesFilters = useCallback(
    (user: TenantUserOption) => {
      if (siteFilter && (user.siteId ?? "") !== siteFilter) return false;
      if (divisionFilter && (user.divisionName?.trim() || "") !== divisionFilter) return false;
      if (departmentFilter) {
        const deptLabel =
          departmentNameFilter ||
          departments.find((d) => d.id === departmentFilter)?.label ||
          "";
        const name = user.departmentName?.trim() || "";
        if (name !== deptLabel && name !== departmentFilter) return false;
      }
      const q = nameFilter.trim().toLowerCase();
      if (!q) return true;
      return (
        user.label.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        (user.employeeNumber ?? "").toLowerCase().includes(q) ||
        (user.siteLabel ?? "").toLowerCase().includes(q) ||
        messagingParticipantLine(user).toLowerCase().includes(q)
      );
    },
    [
      siteFilter,
      divisionFilter,
      departmentFilter,
      departmentNameFilter,
      departments,
      nameFilter,
    ],
  );

  const availableUsers = useMemo(
    () => users.filter((user) => !selectedSet.has(user.id) && matchesFilters(user)),
    [users, selectedSet, matchesFilters],
  );

  const memberUsers = useMemo(() => {
    const byId = new Map(users.map((user) => [user.id, user]));
    const members = selected
      .map((id) => byId.get(id))
      .filter((user): user is TenantUserOption => Boolean(user));
    const q = nameFilter.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (user) =>
        user.label.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        (user.employeeNumber ?? "").toLowerCase().includes(q) ||
        messagingParticipantLine(user).toLowerCase().includes(q),
    );
  }, [users, selected, nameFilter]);

  function addMembers(ids: string[]) {
    if (!ids.length) return;
    if (mode === "DIRECT") {
      onChange([ids[0]!]);
      setAvailableChecked([]);
      return;
    }
    const next = [...selected];
    for (const id of ids) {
      if (!next.includes(id)) next.push(id);
    }
    onChange(next);
    setAvailableChecked((current) => current.filter((id) => !ids.includes(id)));
  }

  function removeMembers(ids: string[]) {
    if (!ids.length) return;
    onChange(selected.filter((id) => !ids.includes(id)));
    setMemberChecked((current) => current.filter((id) => !ids.includes(id)));
  }

  function toggleAvailable(id: string) {
    if (mode === "DIRECT") {
      setAvailableChecked([id]);
      return;
    }
    setAvailableChecked((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  function toggleMember(id: string) {
    setMemberChecked((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  return (
    <div className="training-group-member-picker">
      <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-2">
        <div className="form-label mb-0">Group membership</div>
        <div className="text-muted small">
          <strong>{selected.length}</strong> in group · <strong>{availableUsers.length}</strong> available
        </div>
      </div>
      <div className="row g-2 mb-2">
        <OrgLocationCascade
          idPrefix="messaging-member"
          size="sm"
          colClass="col-md-6"
          locationEmptyLabel="All locations"
          sites={sites}
          departments={departments as DepartmentOption[]}
          divisionEntries={divisionEntries}
          value={{
            siteId: siteFilter,
            siteName: sites.find((site) => site.id === siteFilter)?.label ?? "",
            divisionName: divisionFilter,
            departmentId: departmentFilter,
            departmentName: departmentNameFilter,
          }}
          onChange={(next) => {
            setSiteFilter(next.siteId);
            setDivisionFilter(next.divisionName);
            setDepartmentFilter(next.departmentId);
            setDepartmentNameFilter(next.departmentName?.trim() || "");
          }}
        />
        <div className="col-md-6">
          <label className="form-label small mb-1" htmlFor="messaging-member-name-filter">
            Name / search
          </label>
          <input
            id="messaging-member-name-filter"
            className="form-control form-control-sm"
            placeholder="Search employees…"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />
        </div>
      </div>
      <div className="row g-2 align-items-stretch">
        <div className="col-lg-5">
          <div className="training-group-member-picker__panel">
            <div className="training-group-member-picker__header">
              Available employees ({availableUsers.length})
            </div>
            <div className="training-group-member-picker__list">
              {availableUsers.map((user) => (
                <div key={user.id} className="form-check">
                  <input
                    id={`messaging-available-${user.id}`}
                    type={mode === "DIRECT" ? "radio" : "checkbox"}
                    name={mode === "DIRECT" ? "messaging-direct-participant" : undefined}
                    className="form-check-input"
                    checked={availableChecked.includes(user.id)}
                    onChange={() => toggleAvailable(user.id)}
                  />
                  <label className="form-check-label" htmlFor={`messaging-available-${user.id}`}>
                    <span className="d-inline-flex align-items-center gap-2">
                      <PresenceDot online={Boolean(user.isOnline)} />
                      <span>{messagingParticipantLine(user)}</span>
                    </span>
                  </label>
                </div>
              ))}
              {!availableUsers.length ? (
                <p className="text-muted small mb-0 px-2 py-1">
                  No available employees match these filters.
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="col-lg-2 d-flex flex-lg-column flex-row flex-wrap justify-content-center align-items-center gap-2 py-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            title="Add selected"
            aria-label="Add selected employees to group"
            disabled={!availableChecked.length}
            onClick={() => addMembers(availableChecked)}
          >
            <i className="bx bx-chevron-right" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            title="Add all visible"
            aria-label="Add all visible employees to group"
            disabled={!availableUsers.length || mode === "DIRECT"}
            onClick={() => addMembers(availableUsers.map((user) => user.id))}
          >
            <i className="bx bx-chevrons-right" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            title="Remove selected"
            aria-label="Remove selected employees from group"
            disabled={!memberChecked.length}
            onClick={() => removeMembers(memberChecked)}
          >
            <i className="bx bx-chevron-left" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            title="Remove all members"
            aria-label="Remove all employees from group"
            disabled={!memberUsers.length}
            onClick={() => removeMembers(memberUsers.map((user) => user.id))}
          >
            <i className="bx bx-chevrons-left" aria-hidden="true" />
          </button>
        </div>
        <div className="col-lg-5">
          <div className="training-group-member-picker__panel">
            <div className="training-group-member-picker__header">
              Group members ({selected.length})
            </div>
            <div className="training-group-member-picker__list">
              {memberUsers.map((user) => (
                <div key={user.id} className="form-check">
                  <input
                    id={`messaging-member-${user.id}`}
                    type="checkbox"
                    className="form-check-input"
                    checked={memberChecked.includes(user.id)}
                    onChange={() => toggleMember(user.id)}
                  />
                  <label className="form-check-label" htmlFor={`messaging-member-${user.id}`}>
                    <span className="d-inline-flex align-items-center gap-2">
                      <PresenceDot online={Boolean(user.isOnline)} />
                      <span>{messagingParticipantLine(user)}</span>
                    </span>
                  </label>
                </div>
              ))}
              {!memberUsers.length ? (
                <p className="text-muted small mb-0 px-2 py-1">No members in this group yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewConversationModal({
  open,
  users,
  sites,
  departments,
  divisionEntries,
  onClose,
  onCreate,
  busy,
}: {
  open: boolean;
  users: TenantUserOption[];
  sites: LookupOption[];
  departments: LookupOption[];
  divisionEntries: DivisionOption[];
  onClose: () => void;
  onCreate: (input: {
    threadType: "DIRECT" | "GROUP";
    title?: string;
    description?: string;
    memberUserIds: string[];
  }) => void;
  busy: boolean;
}) {
  const [threadType, setThreadType] = useState<"DIRECT" | "GROUP">("DIRECT");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setThreadType("DIRECT");
      setTitle("");
      setDescription("");
      setSelected([]);
    }
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-dialog-centered modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">New conversation</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body">
              <div className="btn-group mb-3 w-100" role="group" aria-label="Conversation type">
                <button
                  type="button"
                  className={`btn btn-sm ${threadType === "DIRECT" ? "btn-primary" : "btn-outline-primary"}`}
                  onClick={() => {
                    setThreadType("DIRECT");
                    setSelected([]);
                  }}
                >
                  Direct message
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${threadType === "GROUP" ? "btn-primary" : "btn-outline-primary"}`}
                  onClick={() => setThreadType("GROUP")}
                >
                  Group chat
                </button>
              </div>

              {threadType === "GROUP" ? (
                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="group-title">
                      Name
                    </label>
                    <input
                      id="group-title"
                      className="form-control"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Safety team, Shift A, etc."
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="group-description">
                      Description
                    </label>
                    <input
                      id="group-description"
                      className="form-control"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
              ) : null}

              <MessagingParticipantPicker
                users={users}
                sites={sites}
                departments={departments}
                divisionEntries={divisionEntries}
                selected={selected}
                onChange={setSelected}
                mode={threadType}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-label-secondary btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || selected.length === 0 || (threadType === "GROUP" && !title.trim())}
                onClick={() => {
                  const payload: {
                    threadType: "DIRECT" | "GROUP";
                    memberUserIds: string[];
                    title?: string;
                    description?: string;
                  } = {
                    threadType,
                    memberUserIds: selected,
                  };
                  if (threadType === "GROUP" && title.trim()) payload.title = title.trim();
                  if (threadType === "GROUP" && description.trim()) {
                    payload.description = description.trim();
                  }
                  onCreate(payload);
                }}
              >
                {busy ? "Creating…" : threadType === "GROUP" ? "Save group" : "Start conversation"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  );
}

function EditGroupModal({
  open,
  thread,
  users,
  sites,
  departments,
  divisionEntries,
  currentUserId,
  onClose,
  onSave,
  busy,
}: {
  open: boolean;
  thread: MessagingThread | null;
  users: TenantUserOption[];
  sites: LookupOption[];
  departments: LookupOption[];
  divisionEntries: DivisionOption[];
  currentUserId: string;
  onClose: () => void;
  onSave: (input: {
    title: string;
    description: string;
    memberUserIds: string[];
  }) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !thread) return;
    setTitle(thread.title?.trim() || "");
    setDescription(thread.description?.trim() || "");
    setSelected(
      (thread.members ?? [])
        .map((member) => member.userId)
        .filter((id) => id && id !== currentUserId),
    );
  }, [open, thread, currentUserId]);

  if (!open || !thread) return null;

  return (
    <>
      <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-dialog-centered modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Edit group</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body">
              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="edit-group-title">
                    Name
                  </label>
                  <input
                    id="edit-group-title"
                    className="form-control"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="edit-group-description">
                    Description
                  </label>
                  <input
                    id="edit-group-description"
                    className="form-control"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <MessagingParticipantPicker
                users={users}
                sites={sites}
                departments={departments}
                divisionEntries={divisionEntries}
                selected={selected}
                onChange={setSelected}
                mode="GROUP"
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-label-secondary btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || !title.trim()}
                onClick={() =>
                  onSave({
                    title: title.trim(),
                    description: description.trim(),
                    memberUserIds: selected,
                  })
                }
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  );
}

function LinkShareModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (link: { url: string; title?: string; description?: string }) => void;
}) {
  const [url, setUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) {
      setUrl("");
      setLinkTitle("");
      setDescription("");
    }
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-dialog-centered modal-sm">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Share a link</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body">
              <div className="mb-2">
                <label className="form-label" htmlFor="link-url">
                  URL
                </label>
                <input
                  id="link-url"
                  className="form-control form-control-sm"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="mb-2">
                <label className="form-label" htmlFor="link-title">
                  Title (optional)
                </label>
                <input
                  id="link-title"
                  className="form-control form-control-sm"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="link-description">
                  Description (optional)
                </label>
                <textarea
                  id="link-description"
                  className="form-control form-control-sm"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-label-secondary btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!url.trim()}
                onClick={() => {
                  const payload: { url: string; title?: string; description?: string } = {
                    url: url.trim(),
                  };
                  if (linkTitle.trim()) payload.title = linkTitle.trim();
                  if (description.trim()) payload.description = description.trim();
                  onAdd(payload);
                  onClose();
                }}
              >
                Add link
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  );
}

export function MessagingWorkspace({
  moduleName,
  variant = "page",
  initialThreadId,
  pollPaused = false,
}: {
  moduleName: string;
  variant?: "page" | "popout";
  initialThreadId?: string;
  /** When true (minimized popout), skip aggressive list/user polling. */
  pollPaused?: boolean;
}) {
  const { me } = useAuth();
  const tenantId = me?.tenantId ?? "";
  const currentUserId = me?.userId ?? "";
  const isPopout = variant === "popout";

  const [threads, setThreads] = useState<MessagingThread[]>([]);
  const [activeThread, setActiveThread] = useState<MessagingThread | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [body, setBody] = useState("");
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [pendingLinks, setPendingLinks] = useState<
    { url: string; title?: string; description?: string }[]
  >([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUserOption[]>([]);
  const [orgSites, setOrgSites] = useState<LookupOption[]>([]);
  const [orgDepartments, setOrgDepartments] = useState<LookupOption[]>([]);
  const [orgDivisionEntries, setOrgDivisionEntries] = useState<DivisionOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [dragOverComposer, setDragOverComposer] = useState(false);
  const [editingThread, setEditingThread] = useState<MessagingThread | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [replyTo, setReplyTo] = useState<MessagingMessage | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const pollSinceRef = useRef<string | null>(null);
  const unreadTotalRef = useRef<number | null>(null);
  const activeThreadRef = useRef<MessagingThread | null>(null);
  const highlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    activeThreadRef.current = activeThread;
  }, [activeThread]);

  const userOptions = useMemo(() => tenantUsers, [tenantUsers]);

  const activeTitle = messagingThreadTitleDisplay(
    activeThread ?? { title: "Conversation", threadType: "DIRECT", members: [] },
    currentUserId,
  );
  const clusteredMessages = useMemo(
    () => annotateMessageClusters(activeThread?.messages ?? []),
    [activeThread?.messages],
  );
  const activeMemberLine = messagingMemberNames(
    activeThread?.members,
    currentUserId ? { excludeUserId: currentUserId, limit: 8 } : { limit: 8 },
  );
  const activeDmOnline = dmPeerOnline(activeThread, currentUserId);
  const activeGroupOnline = groupOnlineCount(activeThread?.members, currentUserId);
  const isActiveGroup =
    Boolean(activeThread) && String(activeThread?.threadType).toUpperCase() === "GROUP";
  const activePresenceLine =
    activeDmOnline === null
      ? isActiveGroup
        ? activeGroupOnline > 0
          ? `${activeGroupOnline} online on the Platform`
          : activeMemberLine
        : ""
      : activeDmOnline
        ? "Online on the Platform"
        : "Offline";

  const loadThreads = useCallback(async (opts?: { quiet?: boolean; announce?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    try {
      const r = await apiGet<{ items: MessagingThread[] }>("/api/v1/industrial/messaging/threads");
      const items = r.items ?? [];
      const unreadTotal = items.reduce((sum, thread) => sum + Number(thread.unreadCount ?? 0), 0);
      if (opts?.announce) {
        const prev = unreadTotalRef.current;
        if (prev !== null && unreadTotal > prev) {
          playNotificationChime();
        }
      }
      unreadTotalRef.current = unreadTotal;
      setThreads(items);
      setError("");
    } catch (e) {
      if (!opts?.quiet) {
        setError(e instanceof ApiError ? e.message : "Unable to load conversations");
      }
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, []);

  const loadTenantUsers = useCallback(async () => {
    async function fromPayload(payload: unknown): Promise<void> {
      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { items?: unknown[] } | null)?.items)
          ? ((payload as { items: unknown[] }).items)
          : [];
      setTenantUsers(
        tenantUserOptions(
          rows as Array<{
            id?: string;
            userId?: string;
            primaryEmail?: string | null;
            email?: string | null;
            displayName?: string | null;
            employeeNumber?: string | null;
            divisionName?: string | null;
            departmentName?: string | null;
            siteId?: string | null;
            siteLabel?: string | null;
            lastSeenAt?: string | null;
            isOnline?: boolean;
          }>,
          currentUserId,
        ),
      );
    }

    try {
      const users = await apiGet<unknown>("/api/v1/industrial/messaging/participants");
      await fromPayload(users);
      return;
    } catch {
      // Fall through to directory endpoints on older API builds.
    }

    if (!tenantId) {
      setTenantUsers([]);
      return;
    }

    try {
      const memberships = await apiGet<unknown>(
        `/api/v1/tenants/${encodeURIComponent(tenantId)}/memberships?status=ACTIVE`,
      );
      await fromPayload(memberships);
      return;
    } catch {
      // Fall through.
    }

    try {
      const users = await apiGet<unknown>(`/api/v1/tenants/${encodeURIComponent(tenantId)}/users`);
      await fromPayload(users);
    } catch {
      setTenantUsers([]);
    }
  }, [tenantId, currentUserId]);

  const loadOrgCatalogs = useCallback(async () => {
    try {
      const catalogs = await loadOrgFilterCatalogs(tenantId || null);
      setOrgSites(catalogs.sites);
      setOrgDepartments(catalogs.departments);
      setOrgDivisionEntries(catalogs.divisionEntries);
    } catch {
      setOrgSites([]);
      setOrgDepartments([]);
      setOrgDivisionEntries([]);
    }
  }, [tenantId]);

  const openThread = useCallback(async (id: string, since?: string | null) => {
    const query = new URLSearchParams();
    if (since) query.set("since", since);
    if (!since) query.set("limit", "100");
    const qs = query.toString();
    const thread = await apiGet<MessagingThread>(
      `/api/v1/industrial/messaging/threads/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`,
    );

    const current = activeThreadRef.current;
    if (since && current?.id === id) {
      setActiveThread((prev) => {
        if (!prev || prev.id !== id) return prev;
        const existingIds = new Set((prev.messages ?? []).map((m) => m.id));
        const newMessages = (thread.messages ?? []).filter((m) => !existingIds.has(m.id));
        if (newMessages.length > 0) {
          if (
            newMessages.some(
              (message) => !message.isOwn && message.senderUserId !== currentUserId,
            )
          ) {
            playNotificationChime();
          }
          pollSinceRef.current =
            newMessages[newMessages.length - 1]?.createdAt ?? pollSinceRef.current;
        }
        // Refresh members/metadata only — never replace the message history with a
        // since-poll payload (which is empty or incremental).
        const { messages: _ignored, ...threadMeta } = thread;
        return {
          ...prev,
          ...threadMeta,
          messages:
            newMessages.length > 0
              ? [...(prev.messages ?? []), ...newMessages]
              : (prev.messages ?? []),
        };
      });
      void loadThreads({ quiet: true });
    } else if (!since) {
      setActiveThread(thread);
      setSelectedId(id);
      pollSinceRef.current =
        thread.messages && thread.messages.length > 0
          ? thread.messages[thread.messages.length - 1]!.createdAt
          : null;
    }

    // Keep lastReadAt current while the conversation is open so senders see "Viewed".
    // Backend also clears matching industrial.messaging.new_message notifications.
    try {
      await apiSend(`/api/v1/industrial/messaging/threads/${encodeURIComponent(id)}/read`, "POST", {});
      notifyMessagingThreadRead(id);
      if (!since) void loadThreads({ quiet: true });
    } catch {
      // Read receipts are best-effort.
    }
  }, [currentUserId, loadThreads]);

  useEffect(() => {
    void loadThreads();
    void loadTenantUsers();
    void loadOrgCatalogs();
    const unlock = () => unlockNotificationAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [loadThreads, loadTenantUsers, loadOrgCatalogs]);

  useEffect(() => {
    const target = initialThreadId?.trim();
    if (!target) return;
    setSelectedId(target);
    pollSinceRef.current = null;
    void openThread(target).catch(() => {
      // Thread may have been deleted; list still loads.
    });
    // Only re-open when the deep-link thread id changes — not when openThread identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [initialThreadId]);

  useEffect(() => {
    if (pollPaused || !selectedId) return;
    const timer = window.setInterval(() => {
      const since = pollSinceRef.current;
      // Only incremental-poll when we already have a cursor for this thread.
      if (!since) return;
      void openThread(selectedId, since);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [selectedId, openThread, pollPaused]);

  useEffect(() => {
    if (pollPaused) return;
    const timer = window.setInterval(() => {
      void loadThreads({ quiet: true, announce: true });
      void loadTenantUsers();
    }, THREAD_LIST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadThreads, loadTenantUsers, pollPaused]);

  useEffect(() => {
    setShowEmojiPicker(false);
    setDragOverComposer(false);
    setReplyTo(null);
    setHighlightMessageId(null);
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThread?.messages?.length]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current != null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  function beginReply(message: MessagingMessage) {
    setReplyTo(message);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => messageInputRef.current?.focus());
  }

  function focusRepliedMessage(messageId: string) {
    const el = document.getElementById(`messaging-message-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightMessageId(messageId);
    if (highlightTimerRef.current != null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightMessageId(null);
      highlightTimerRef.current = null;
    }, 1800);
  }

  async function uploadFile(file: File) {
    if (!selectedId) {
      setError("Select a conversation before attaching files.");
      return;
    }

    const mimeType = guessMessagingMime(file);

    setUploading(true);
    setError("");
    try {
      const filename = ensureMessagingFilename(file, mimeType);
      const init = await apiSend<UploadUrlResponse>(
        "/api/v1/industrial/messaging/attachments/upload-url",
        "POST",
        {
          threadId: selectedId,
          filename,
          mimeType,
          contentLength: file.size,
        },
      );

      await putPresignedMessagingUpload(init.uploadUrl, file, init.mimeType || mimeType);

      await apiSend(
        `/api/v1/industrial/messaging/attachments/${encodeURIComponent(init.attachmentId)}/complete`,
        "POST",
        {},
      );

      const previewUrl = (init.mimeType || mimeType).startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined;
      const pending: PendingUpload = {
        attachmentId: init.attachmentId,
        originalFilename: init.originalFilename,
        mimeType: init.mimeType,
        attachmentType: init.attachmentType,
      };
      if (previewUrl) pending.previewUrl = previewUrl;
      setPendingUploads((prev) => [...prev, pending]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(Boolean);
    for (const file of list) {
      await uploadFile(file);
    }
  }

  function insertEmoji(emoji: string) {
    const input = messageInputRef.current;
    const start = input?.selectionStart ?? body.length;
    const end = input?.selectionEnd ?? body.length;
    const { next, caret } = insertTextAtSelection(body, emoji, start, end);
    setBody(next);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      const el = messageInputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  async function sendMessage() {
    if (!selectedId) return;
    const text = body.trim();
    const autoLinks = detectLinks(text).filter(
      (link) => !pendingLinks.some((p) => p.url === link.url),
    );
    const allLinks = [...pendingLinks, ...autoLinks];

    if (!text && pendingUploads.length === 0 && allLinks.length === 0) return;

    setSending(true);
    setError("");
    try {
      const message = await apiSend<MessagingMessage>(
        `/api/v1/industrial/messaging/threads/${encodeURIComponent(selectedId)}/messages`,
        "POST",
        {
          body: text,
          attachmentIds: pendingUploads.map((u) => u.attachmentId),
          links: allLinks,
          ...(replyTo ? { replyToMessageId: replyTo.id } : {}),
        },
      );

      setActiveThread((prev) =>
        prev
          ? { ...prev, messages: [...(prev.messages ?? []), message] }
          : prev,
      );
      pollSinceRef.current = message.createdAt;
      setBody("");
      setReplyTo(null);
      setPendingUploads([]);
      setPendingLinks([]);
      await loadThreads();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to send message");
    } finally {
      setSending(false);
    }
  }

  async function createConversation(input: {
    threadType: "DIRECT" | "GROUP";
    title?: string;
    description?: string;
    memberUserIds: string[];
  }) {
    setCreating(true);
    setError("");
    try {
      const thread = await apiSend<MessagingThread>(
        "/api/v1/industrial/messaging/threads",
        "POST",
        input,
      );
      setShowNewModal(false);
      await loadThreads();
      await openThread(thread.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to create conversation");
    } finally {
      setCreating(false);
    }
  }

  function openGroupEditor(thread: MessagingThread) {
    setEditingThread(thread);
    setShowEditGroupModal(true);
  }

  async function saveGroupEdit(input: {
    title: string;
    description: string;
    memberUserIds: string[];
  }) {
    if (!editingThread) return;
    setSavingGroup(true);
    setError("");
    try {
      const updated = await apiSend<MessagingThread>(
        `/api/v1/industrial/messaging/threads/${encodeURIComponent(editingThread.id)}`,
        "PATCH",
        {
          title: input.title,
          description: input.description,
          memberUserIds: input.memberUserIds,
        },
      );
      setShowEditGroupModal(false);
      setEditingThread(null);
      await loadThreads();
      if (selectedId === updated.id) {
        await openThread(updated.id);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to update group");
    } finally {
      setSavingGroup(false);
    }
  }

  async function deleteGroup(thread: MessagingThread) {
    const name = messagingThreadTitleDisplay(thread, currentUserId);
    if (!window.confirm(`Delete group “${name}”? This removes it for everyone.`)) return;
    setError("");
    try {
      await apiSend(`/api/v1/industrial/messaging/threads/${encodeURIComponent(thread.id)}`, "DELETE");
      if (selectedId === thread.id) {
        setSelectedId("");
        setActiveThread(null);
        pollSinceRef.current = null;
      }
      await loadThreads();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to delete group");
    }
  }

  async function openAttachment(attachment: MessagingAttachment) {
    try {
      const result = await apiGet<{ downloadUrl: string; inline?: boolean }>(
        `/api/v1/industrial/messaging/attachments/${encodeURIComponent(attachment.id)}/download-url`,
      );
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to open attachment");
    }
  }

  return (
    <section
      aria-labelledby="messaging-title"
      className={
        isPopout
          ? "messaging-workspace messaging-workspace--popout"
          : "messaging-workspace"
      }
      data-walkthrough="messaging-overview"
    >
      {!isPopout ? (
        <ModuleWorkspaceHeader
          id="messaging-title"
          eyebrow="System Tools"
          title={moduleName}
          description="Teams-style messaging with documents, images, links, and file sharing."
          onRefresh={() => void loadThreads()}
          refreshing={loading}
        />
      ) : (
        <h2 id="messaging-title" className="visually-hidden">
          {moduleName}
        </h2>
      )}

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div
        className={[
          "messaging-shell",
          isPopout ? "messaging-shell--popout" : "messaging-shell--page",
          isPopout
            ? selectedId
              ? "messaging-shell--popout-chat"
              : "messaging-shell--popout-list"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <aside className="messaging-shell__list" aria-label="Chat list">
          <div className="messaging-shell__list-header">
            <h6 className="messaging-shell__list-title mb-0">Chat</h6>
            <button
              type="button"
              className="btn btn-icon btn-sm btn-text-secondary rounded-pill"
              title="New chat"
              aria-label="New chat"
              onClick={() => setShowNewModal(true)}
            >
              <i className="bx bx-edit bx-sm" aria-hidden="true" />
            </button>
          </div>
          <div className="messaging-thread-list" aria-label="Conversations">
            {threads.map((t) => {
              const title = messagingThreadTitleDisplay(t, currentUserId);
              const isGroup = String(t.threadType).toUpperCase() === "GROUP";
              const memberCount = t.memberCount ?? t.members?.length ?? 0;
              const peerOnline = dmPeerOnline(t, currentUserId);
              const onlineInGroup = isGroup ? groupOnlineCount(t.members, currentUserId) : 0;
              const preview = isGroup
                ? t.description ||
                  `${memberCount} member${memberCount === 1 ? "" : "s"}${
                    onlineInGroup > 0 ? ` · ${onlineInGroup} online` : ""
                  }`
                : t.lastMessagePreview || "Direct message";
              const unread = t.unreadCount ?? 0;
              return (
                <div
                  key={t.id}
                  className={[
                    "messaging-thread-row",
                    selectedId === t.id ? "messaging-thread-row--active" : "",
                    isPopout && selectedId && selectedId !== t.id
                      ? "messaging-thread-row--collapsed"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <button
                    type="button"
                    className="messaging-thread-row__main"
                    onClick={() => void openThread(t.id)}
                    title={title}
                  >
                    <span className="avatar avatar-sm flex-shrink-0 position-relative">
                      <span
                        className={`avatar-initial rounded-circle ${
                          isGroup ? "bg-label-secondary" : "bg-label-primary"
                        }`}
                      >
                        {isGroup ? (
                          <i className="bx bx-group" aria-hidden="true" />
                        ) : (
                          initialsFromName(title)
                        )}
                      </span>
                      {!isGroup && peerOnline !== null ? (
                        <PresenceDot
                          online={peerOnline}
                          className="messaging-presence-dot--avatar"
                        />
                      ) : null}
                      {unread > 0 ? (
                        <span className="badge bg-danger rounded-pill messaging-thread-row__unread messaging-thread-row__unread--avatar">
                          {unread}
                        </span>
                      ) : null}
                    </span>
                    <span className="messaging-thread-row__copy min-w-0">
                      <span className="messaging-thread-row__top">
                        <span className="messaging-thread-row__name text-truncate">{title}</span>
                        {t.lastMessageAt ? (
                          <span className="messaging-thread-row__time">
                            {formatMessageTime(t.lastMessageAt)}
                          </span>
                        ) : null}
                      </span>
                      <span className="messaging-thread-row__bottom">
                        <span className="messaging-thread-row__preview text-truncate">
                          {preview}
                        </span>
                        {unread > 0 ? (
                          <span className="badge bg-danger rounded-pill messaging-thread-row__unread messaging-thread-row__unread--inline">
                            {unread}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                  {isGroup ? (
                    <div className="messaging-thread-row__actions">
                      <button
                        type="button"
                        className="btn btn-icon btn-sm btn-text-secondary"
                        title="Edit group"
                        aria-label="Edit group"
                        onClick={(e) => {
                          e.stopPropagation();
                          openGroupEditor(t);
                        }}
                      >
                        <i className="bx bx-pencil" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-icon btn-sm btn-text-danger"
                        title="Delete group"
                        aria-label="Delete group"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteGroup(t);
                        }}
                      >
                        <i className="bx bx-trash" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {threads.length === 0 && !loading ? (
              <div className="messaging-thread-list__empty text-muted">
                No conversations yet. Start one with a teammate.
              </div>
            ) : null}
          </div>
        </aside>

        <div className="messaging-shell__chat">
          {selectedId ? (
            <>
              <div className="messaging-chat-header">
                <div className="d-flex align-items-center gap-2 min-w-0 flex-grow-1">
                  {isPopout ? (
                    <button
                      type="button"
                      className="btn btn-icon btn-sm btn-text-secondary messaging-shell__back flex-shrink-0"
                      title="Back to chats"
                      aria-label="Back to chats"
                      onClick={() => {
                        setSelectedId("");
                        setActiveThread(null);
                        pollSinceRef.current = null;
                      }}
                    >
                      <i className="bx bx-chevron-left bx-sm" aria-hidden="true" />
                    </button>
                  ) : null}
                  <span className="avatar avatar-md flex-shrink-0 position-relative">
                    <span
                      className={`avatar-initial rounded-circle ${
                        isActiveGroup ? "bg-label-secondary" : "bg-label-primary"
                      }`}
                    >
                      {isActiveGroup ? (
                        <i className="bx bx-group" aria-hidden="true" />
                      ) : (
                        initialsFromName(activeTitle)
                      )}
                    </span>
                    {activeDmOnline !== null ? (
                      <PresenceDot
                        online={activeDmOnline}
                        className="messaging-presence-dot--avatar"
                      />
                    ) : null}
                  </span>
                  <div className="min-w-0">
                    <h6 className="mb-0 text-truncate messaging-chat-header__title">
                      {activeTitle}
                    </h6>
                    {activePresenceLine ? (
                      <div className="small text-muted text-truncate">
                        {activePresenceLine}
                      </div>
                    ) : activeMemberLine ? (
                      <div className="small text-muted text-truncate">{activeMemberLine}</div>
                    ) : null}
                  </div>
                </div>
                {activeThread && isActiveGroup ? (
                  <div className="d-flex gap-1 flex-shrink-0">
                    <button
                      type="button"
                      className="btn btn-sm btn-text-secondary"
                      onClick={() => openGroupEditor(activeThread)}
                    >
                      <i className="bx bx-pencil me-1" aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-text-danger"
                      onClick={() => void deleteGroup(activeThread)}
                    >
                      <i className="bx bx-trash me-1" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="messaging-chat-body" aria-live="polite">
                <div className="messaging-message-scroll">
                  {clusteredMessages.map((m) => {
                    const viewedLabel = messagingMessageViewedLabel(
                      m,
                      activeThread?.messages,
                      activeThread?.members,
                      currentUserId,
                    );
                    const senderLabel = personNameDisplay(m.senderName, "USER");
                    const replySender = m.replyTo
                      ? personNameDisplay(m.replyTo.senderName, "USER")
                      : "";
                    const showAvatar = !m.isOwn && m.showSender;
                    return (
                      <div
                        key={m.id}
                        id={`messaging-message-${m.id}`}
                        className={[
                          "messaging-message",
                          m.isOwn ? "messaging-message--own" : "messaging-message--other",
                          m.isClusterStart ? "messaging-message--cluster-start" : "",
                          m.isClusterEnd ? "messaging-message--cluster-end" : "",
                          !m.isClusterStart && !m.isClusterEnd
                            ? "messaging-message--cluster-middle"
                            : "",
                          highlightMessageId === m.id ? "messaging-message--highlight" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {!m.isOwn ? (
                          showAvatar ? (
                            <span className="avatar avatar-xs flex-shrink-0 messaging-message__avatar">
                              <span className="avatar-initial rounded-circle bg-label-secondary">
                                {initialsFromName(senderLabel)}
                              </span>
                            </span>
                          ) : (
                            <span
                              className="messaging-message__avatar-spacer"
                              aria-hidden="true"
                            />
                          )
                        ) : null}
                        <div className="messaging-message__stack">
                          {m.showSender ? (
                            <div className="messaging-message__meta">
                              {!m.isOwn ? (
                                <span className="messaging-message__sender">{senderLabel}</span>
                              ) : null}
                              <span className="messaging-message__time">
                                {formatMessageTime(m.createdAt)}
                              </span>
                              {viewedLabel ? (
                                <span
                                  className="messaging-read-receipt"
                                  title={viewedLabel}
                                >
                                  <i className="bx bx-check-double" aria-hidden="true" />
                                  <span className="messaging-read-receipt__text">
                                    {viewedLabel}
                                  </span>
                                </span>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn-link btn-sm p-0 messaging-message__reply-btn"
                                title="Reply"
                                aria-label={`Reply to message from ${senderLabel}`}
                                onClick={() => beginReply(m)}
                              >
                                <i className="bx bx-reply" aria-hidden="true" />
                                Reply
                              </button>
                            </div>
                          ) : null}
                          <div
                            className={`messaging-bubble${
                              m.isOwn
                                ? " messaging-bubble--own bg-label-primary"
                                : " messaging-bubble--other"
                            }`}
                          >
                            {!m.showSender ? (
                              <button
                                type="button"
                                className="btn btn-link btn-sm p-0 messaging-message__reply-btn messaging-message__reply-btn--overlay"
                                title="Reply"
                                aria-label={`Reply to message from ${senderLabel}`}
                                onClick={() => beginReply(m)}
                              >
                                <i className="bx bx-reply" aria-hidden="true" />
                              </button>
                            ) : null}
                            {m.replyTo ? (
                              <button
                                type="button"
                                className="messaging-reply-quote"
                                title="Jump to original message"
                                onClick={() => focusRepliedMessage(m.replyTo!.messageId)}
                              >
                                <span className="messaging-reply-quote__sender">
                                  {replySender}
                                </span>
                                <span className="messaging-reply-quote__body text-truncate">
                                  {m.replyTo.bodyPreview}
                                </span>
                              </button>
                            ) : null}
                            {m.body ? <MessageBody body={m.body} /> : null}
                            {m.attachments.map((attachment) => (
                              <AttachmentCard
                                key={attachment.id}
                                attachment={attachment}
                                onOpen={(a) => void openAttachment(a)}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {clusteredMessages.length === 0 ? (
                    <p className="text-muted mb-0 messaging-message-scroll__empty">
                      No messages yet. Say hello.
                    </p>
                  ) : null}
                  <div ref={messagesEndRef} />
                </div>

                {(pendingUploads.length > 0 || pendingLinks.length > 0) && (
                  <div className="messaging-pending">
                    <div className="small fw-medium mb-2">Ready to send</div>
                    <div className="d-flex flex-wrap gap-2">
                      {pendingUploads.map((upload) => (
                        <div key={upload.attachmentId} className="messaging-pending__chip">
                          {upload.previewUrl ? (
                            <img
                              src={upload.previewUrl}
                              alt={upload.originalFilename}
                              className="rounded d-block mb-1 messaging-pending__thumb"
                            />
                          ) : (
                            <i className="bx bx-paperclip me-1" aria-hidden="true" />
                          )}
                          <span className="small">{upload.originalFilename}</span>
                          <button
                            type="button"
                            className="btn btn-link btn-sm text-danger p-0 ms-2"
                            onClick={() =>
                              setPendingUploads((prev) =>
                                prev.filter((p) => p.attachmentId !== upload.attachmentId),
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      {pendingLinks.map((link) => (
                        <div key={link.url} className="messaging-pending__chip small">
                          <i className="bx bx-link me-1" aria-hidden="true" />
                          {link.title ?? link.url}
                          <button
                            type="button"
                            className="btn btn-link btn-sm text-danger p-0 ms-2"
                            onClick={() =>
                              setPendingLinks((prev) => prev.filter((p) => p.url !== link.url))
                            }
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {replyTo ? (
                  <div className="messaging-reply-bar">
                    <div className="messaging-reply-bar__copy min-w-0">
                      <span className="messaging-reply-bar__label">
                        Replying to{" "}
                        {personNameDisplay(replyTo.senderName, "USER")}
                      </span>
                      <span className="messaging-reply-bar__preview text-truncate">
                        {replyTo.body.trim() ||
                          (replyTo.attachments.length > 0 ? "Attachment" : "Message")}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-icon btn-sm btn-text-secondary"
                      title="Cancel reply"
                      aria-label="Cancel reply"
                      onClick={() => setReplyTo(null)}
                    >
                      <i className="bx bx-x" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}

                <div
                  className={`messaging-composer${dragOverComposer ? " messaging-composer--drag" : ""}`}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOverComposer(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverComposer(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    setDragOverComposer(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverComposer(false);
                    if (e.dataTransfer.files?.length) {
                      void uploadFiles(e.dataTransfer.files);
                    }
                  }}
                >
                  {dragOverComposer ? (
                    <div className="small text-primary mb-2">Drop files to attach…</div>
                  ) : null}
                  {uploading ? (
                    <div className="small text-muted mb-2">Uploading attachment…</div>
                  ) : null}
                  <div className="messaging-composer__box position-relative">
                    <EmojiPicker
                      open={showEmojiPicker}
                      onClose={() => setShowEmojiPicker(false)}
                      onPick={insertEmoji}
                    />
                    <label className="form-label visually-hidden" htmlFor="message-body">
                      Message
                    </label>
                    <textarea
                      id="message-body"
                      ref={messageInputRef}
                      className="form-control messaging-composer__input"
                      rows={2}
                      value={body}
                      placeholder="Type a new message"
                      onChange={(e) => setBody(e.target.value)}
                      onPaste={(e) => {
                        // clipboardData.files and clipboardData.items expose the same pasted
                        // image as distinct File objects (with differing lastModified), so
                        // read from one source only.
                        const fromItems = Array.from(e.clipboardData?.items ?? [])
                          .filter((item) => item.kind === "file")
                          .map((item) => item.getAsFile())
                          .filter((file): file is File => Boolean(file));
                        const source =
                          fromItems.length > 0
                            ? fromItems
                            : Array.from(e.clipboardData?.files ?? []);
                        const seen = new Set<string>();
                        const files = source.filter((file) => {
                          const mime = guessMessagingMime(file);
                          if (!mime.startsWith("image/")) return false;
                          const key = `${file.name}:${file.size}:${mime}`;
                          if (seen.has(key)) return false;
                          seen.add(key);
                          return true;
                        });
                        if (!files.length) return;
                        e.preventDefault();
                        void uploadFiles(files);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendMessage();
                        }
                      }}
                      disabled={sending}
                    />
                    <div className="messaging-composer__toolbar">
                      <div className="messaging-composer__tools">
                        <button
                          type="button"
                          className="btn btn-icon btn-sm btn-text-secondary"
                          title="Attach file or image"
                          aria-label="Attach file or image"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={sending || uploading}
                        >
                          <i className="bx bx-paperclip bx-sm" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon btn-sm btn-text-secondary"
                          title="Insert emoji"
                          aria-label="Insert emoji"
                          aria-expanded={showEmojiPicker}
                          onClick={() => setShowEmojiPicker((open) => !open)}
                          disabled={sending || uploading}
                        >
                          <i className="bx bx-smile bx-sm" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon btn-sm btn-text-secondary"
                          title="Share link"
                          aria-label="Share link"
                          onClick={() => setShowLinkModal(true)}
                          disabled={sending || uploading}
                        >
                          <i className="bx bx-link bx-sm" aria-hidden="true" />
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="d-none"
                          accept={ATTACHMENT_ACCEPT}
                          multiple
                          onChange={(e) => {
                            if (e.target.files?.length) void uploadFiles(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-icon rounded-pill messaging-composer__send"
                        title={sending ? "Sending…" : "Send"}
                        aria-label={sending ? "Sending…" : "Send"}
                        onClick={() => void sendMessage()}
                        disabled={
                          sending ||
                          uploading ||
                          (!body.trim() && pendingUploads.length === 0 && pendingLinks.length === 0)
                        }
                      >
                        <i className="bx bx-paper-plane" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="messaging-chat-empty">
              <span className="avatar avatar-lg mb-3">
                <span className="avatar-initial rounded-circle bg-label-primary">
                  <i className="bx bx-message-rounded-dots" aria-hidden="true" />
                </span>
              </span>
              <p className="mb-1 fw-medium">Select a chat to start messaging</p>
              <p className="mb-0 small text-muted">
                Choose a conversation or start a new one.
              </p>
            </div>
          )}
        </div>
      </div>

      <NewConversationModal
        open={showNewModal}
        users={userOptions}
        sites={orgSites}
        departments={orgDepartments}
        divisionEntries={orgDivisionEntries}
        onClose={() => setShowNewModal(false)}
        onCreate={(input) => void createConversation(input)}
        busy={creating}
      />
      <EditGroupModal
        open={showEditGroupModal}
        thread={editingThread}
        users={userOptions}
        sites={orgSites}
        departments={orgDepartments}
        divisionEntries={orgDivisionEntries}
        currentUserId={currentUserId}
        onClose={() => {
          setShowEditGroupModal(false);
          setEditingThread(null);
        }}
        onSave={(input) => void saveGroupEdit(input)}
        busy={savingGroup}
      />
      <LinkShareModal
        open={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        onAdd={(link) => setPendingLinks((prev) => [...prev, link])}
      />
    </section>
  );
}
