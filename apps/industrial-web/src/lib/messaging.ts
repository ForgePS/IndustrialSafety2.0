import { ApiError, apiFetchRaw } from "@forge/web-kit";
import { personNameDisplay } from "@/lib/person-name-display";

/** Fired after a successful POST .../messaging/threads/:id/read so the bell can refresh. */
export const INDUSTRIAL_MESSAGING_THREAD_READ_EVENT = "forge-ind-messaging-thread-read";

export function notifyMessagingThreadRead(threadId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(INDUSTRIAL_MESSAGING_THREAD_READ_EVENT, { detail: { threadId } }),
  );
}

export type MessagingMember = {
  userId: string;
  role: string;
  displayName: string;
  email?: string;
  /** ISO timestamp when this member last opened/read the thread. */
  lastReadAt?: string | null;
  /** ISO timestamp of last Platform API activity, when known. */
  lastSeenAt?: string | null;
  /** True when the user has recent Platform activity (logged in / active). */
  isOnline?: boolean;
};

export type MessagingAttachment = {
  id: string;
  attachmentType: "FILE" | "IMAGE" | "DOCUMENT" | "LINK";
  originalFilename?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number;
  linkUrl?: string | null;
  linkTitle?: string | null;
  linkDescription?: string | null;
  uploadStatus?: string;
};

export type MessagingReplyTo = {
  messageId: string;
  senderUserId: string;
  senderName: string;
  bodyPreview: string;
};

export type MessagingMessage = {
  id: string;
  body: string;
  messageType: string;
  senderUserId: string;
  senderName: string;
  createdAt: string;
  editedAt?: string | null;
  attachments: MessagingAttachment[];
  isOwn: boolean;
  /** When set, this message is a reply to another message in the thread. */
  replyTo?: MessagingReplyTo | null;
};

/** Consecutive-sender cluster flags for chat bubble grouping. */
export type MessagingMessageCluster = {
  showSender: boolean;
  isClusterStart: boolean;
  isClusterEnd: boolean;
};

export function messageSenderKey(
  message: Pick<MessagingMessage, "senderUserId" | "isOwn">,
): string {
  const id = String(message.senderUserId ?? "").trim();
  if (id) return id;
  return message.isOwn ? "__own__" : "__other__";
}

/**
 * Mark consecutive messages from the same sender so the UI can keep them together
 * (avatar/name once, tighter spacing inside the run).
 */
export function annotateMessageClusters(
  messages: ReadonlyArray<MessagingMessage>,
): Array<MessagingMessage & MessagingMessageCluster> {
  return messages.map((message, index) => {
    const prev = messages[index - 1];
    const next = messages[index + 1];
    const key = messageSenderKey(message);
    const prevKey = prev ? messageSenderKey(prev) : null;
    const nextKey = next ? messageSenderKey(next) : null;
    const isClusterStart = prevKey !== key;
    const isClusterEnd = nextKey !== key;
    return {
      ...message,
      showSender: isClusterStart,
      isClusterStart,
      isClusterEnd,
    };
  });
}

export type MessagingThread = {
  id: string;
  threadType: string;
  title: string;
  lastMessageAt?: string | null;
  lastMessagePreview?: string;
  unreadCount?: number;
  memberCount?: number;
  members?: MessagingMember[];
  messages?: MessagingMessage[];
  description?: string | null;
  /** True when older messages exist beyond the initial window. */
  hasMore?: boolean;
};

export type PendingUpload = {
  attachmentId: string;
  originalFilename: string;
  mimeType: string;
  attachmentType: string;
  previewUrl?: string;
};

/** Resolve a browser File MIME for messaging uploads (screenshots often omit type). */
export function guessMessagingMime(file: File): string {
  const fromType = file.type.trim().toLowerCase();
  if (fromType && fromType !== "application/octet-stream") return fromType;
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".jfif"))
    return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".tif") || name.endsWith(".tiff")) return "image/tiff";
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".doc")) return "application/msword";
  if (name.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (name.endsWith(".xls")) return "application/vnd.ms-excel";
  if (name.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (name.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  if (name.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (name.endsWith(".txt")) return "text/plain";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".zip")) return "application/zip";
  // Clipboard / snip tools often provide an unnamed PNG blob.
  if (!name || name === "image" || name === "blob") return "image/png";
  return fromType || "application/octet-stream";
}

export function ensureMessagingFilename(file: File, mimeType: string): string {
  const raw = (file.name || "").trim();
  if (raw && raw !== "blob" && raw.includes(".")) return raw;
  if (mimeType === "image/jpeg") return "screenshot.jpg";
  if (mimeType === "image/gif") return "screenshot.gif";
  if (mimeType === "image/webp") return "screenshot.webp";
  if (mimeType.startsWith("image/")) return "screenshot.png";
  return raw || "attachment.bin";
}

/**
 * Presigned S3 PUT for messaging attachments.
 * Must send x-amz-server-side-encryption because the URL is signed with aws:kms.
 */
export function putPresignedMessagingUpload(
  uploadUrl: string,
  file: File,
  mimeType: string,
): Promise<void> {
  const contentType = mimeType.trim() || guessMessagingMime(file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-amz-server-side-encryption", "aws:kms");
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Upload to storage failed (${xhr.status}). Please try again.`));
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Upload blocked by the browser (network or CORS). Try again after a hard refresh.",
        ),
      );
    xhr.send(file);
  });
}

/** True when the attachment should render as an inline image preview. */
export function isMessagingImageAttachment(
  attachment: Pick<MessagingAttachment, "attachmentType" | "mimeType">,
): boolean {
  if (attachment.attachmentType === "IMAGE") return true;
  const mime = attachment.mimeType?.trim().toLowerCase() ?? "";
  return mime.startsWith("image/") && mime !== "image/svg+xml";
}

/**
 * Load attachment bytes via the authenticated API content stream into a blob URL.
 * Prefer this over S3 presigned `<img src>` (CSP/CORS/referrer fragile).
 */
export async function loadMessagingAttachmentObjectUrl(attachmentId: string): Promise<string> {
  const res = await apiFetchRaw(
    `/api/v1/industrial/messaging/attachments/${encodeURIComponent(attachmentId)}/content`,
  );
  if (!res.ok) {
    throw new ApiError(`Unable to load attachment (${res.status})`, res.status);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export type TenantUserOption = {
  id: string;
  label: string;
  email: string;
  employeeNumber?: string;
  divisionName?: string;
  departmentName?: string;
  siteId?: string;
  siteLabel?: string;
  lastSeenAt?: string | null;
  isOnline?: boolean;
};

export type MessagingSiteOption = {
  id: string;
  label: string;
};

const URL_PATTERN = /https?:\/\/[^\s<]+/gi;

export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export function detectLinks(text: string): { url: string; title: string }[] {
  const matches = text.match(URL_PATTERN) ?? [];
  return [...new Set(matches.map((url) => url.replace(/[),.;!?]+$/, "")))].map((url) => ({
    url,
    title: url,
  }));
}

export function splitMessageBodyWithLinks(
  body: string,
): Array<{ type: "text" | "link"; value: string }> {
  const segments: Array<{ type: "text" | "link"; value: string }> = [];
  let lastIndex = 0;
  const regex = new RegExp(URL_PATTERN.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: body.slice(lastIndex, match.index) });
    }
    const url = match[0].replace(/[),.;!?]+$/, "");
    segments.push({ type: "link", value: url });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) segments.push({ type: "text", value: body.slice(lastIndex) });
  if (segments.length === 0 && body) segments.push({ type: "text", value: body });
  return segments;
}

/** Training-style roster line: #EMP-… · NAME · LOCATION */
export function messagingParticipantLine(user: TenantUserOption): string {
  const name = personNameDisplay(user.label, user.email || "USER");
  const parts: string[] = [];
  if (user.employeeNumber?.trim()) parts.push(`#${user.employeeNumber.trim()}`);
  parts.push(name);
  if (user.siteLabel?.trim()) parts.push(user.siteLabel.trim().toLocaleUpperCase("en-US"));
  else if (user.email.trim() && user.email.toLowerCase() !== user.label.trim().toLowerCase()) {
    parts.push(user.email.trim());
  }
  return parts.join(" · ");
}

export function messagingMemberNames(
  members: readonly MessagingMember[] | undefined,
  options?: { excludeUserId?: string; limit?: number },
): string {
  const exclude = options?.excludeUserId ?? "";
  const limit = options?.limit ?? 4;
  const names = (members ?? [])
    .filter((member) => member.userId !== exclude)
    .map((member) => personNameDisplay(member.displayName, member.email || "USER"));
  if (names.length === 0) return "";
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")}…`;
}

/**
 * Read receipt for the sender: who has opened the thread since this message.
 * Shown on the latest own message only to keep the transcript readable.
 */
export function messagingMessageViewedLabel(
  message: Pick<MessagingMessage, "id" | "createdAt" | "isOwn" | "senderUserId">,
  messages: readonly MessagingMessage[] | undefined,
  members: readonly MessagingMember[] | undefined,
  currentUserId?: string,
): string | null {
  const isOwn = message.isOwn || (currentUserId ? message.senderUserId === currentUserId : false);
  if (!isOwn) return null;

  const ownMessages = (messages ?? []).filter(
    (row) => row.isOwn || (currentUserId ? row.senderUserId === currentUserId : false),
  );
  const latestOwn = ownMessages[ownMessages.length - 1];
  if (!latestOwn || latestOwn.id !== message.id) return null;

  const createdMs = new Date(message.createdAt).getTime();
  if (Number.isNaN(createdMs)) return null;

  const viewers = (members ?? []).filter((member) => {
    if (currentUserId && member.userId === currentUserId) return false;
    if (!member.lastReadAt) return false;
    const readMs = new Date(member.lastReadAt).getTime();
    return !Number.isNaN(readMs) && readMs >= createdMs;
  });
  if (viewers.length === 0) return null;

  const others = (members ?? []).filter(
    (member) => !currentUserId || member.userId !== currentUserId,
  );
  if (others.length <= 1) return "Viewed";

  const names = viewers
    .slice(0, 3)
    .map((member) => personNameDisplay(member.displayName, member.email || "USER"));
  if (viewers.length <= 3) return `Viewed by ${names.join(", ")}`;
  return `Viewed by ${names.join(", ")} +${viewers.length - 3}`;
}

export function messagingThreadTitleDisplay(
  thread: Pick<MessagingThread, "title" | "threadType" | "members">,
  currentUserId?: string,
): string {
  const isGroup = String(thread.threadType).toUpperCase() === "GROUP";
  if (isGroup) return thread.title?.trim() || "Group chat";
  const other = (thread.members ?? []).find((member) => member.userId !== currentUserId);
  if (other) return personNameDisplay(other.displayName, other.email || "USER");
  return personNameDisplay(thread.title, "Conversation");
}

export function messagingThreadMetaLine(thread: MessagingThread, currentUserId?: string): string {
  const isGroup = String(thread.threadType).toUpperCase() === "GROUP";
  if (isGroup) {
    const count = thread.memberCount ?? thread.members?.length ?? 0;
    const names = messagingMemberNames(
      thread.members,
      currentUserId ? { excludeUserId: currentUserId, limit: 4 } : { limit: 4 },
    );
    if (thread.description?.trim()) return thread.description.trim();
    if (count > 0 && names) return `${count} member${count === 1 ? "" : "s"} · ${names}`;
    if (count > 0) return `${count} member${count === 1 ? "" : "s"}`;
    return "Group chat";
  }
  return thread.lastMessagePreview?.trim() || "Direct message";
}

export function messagingSiteOptions(users: readonly TenantUserOption[]): MessagingSiteOption[] {
  const byId = new Map<string, string>();
  for (const user of users) {
    const id = user.siteId?.trim();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, user.siteLabel?.trim() || id);
  }
  return [...byId.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function tenantUserOptions(
  users: readonly {
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
  }[],
  currentUserId: string,
): TenantUserOption[] {
  const list = Array.isArray(users) ? users : [];
  return list
    .map((u) => {
      // Prefer userId when both exist — membership rows use id for the membership.
      const id = (u.userId ?? u.id ?? "").trim();
      const email = (u.primaryEmail ?? u.email ?? "").trim();
      const rawLabel = (u.displayName ?? (email || id || "User")).trim();
      return {
        id,
        label: personNameDisplay(rawLabel, email || id || "USER"),
        email,
        employeeNumber: String(u.employeeNumber ?? "").trim(),
        divisionName: String(u.divisionName ?? "").trim(),
        departmentName: String(u.departmentName ?? "").trim(),
        siteId: String(u.siteId ?? "").trim(),
        siteLabel: String(u.siteLabel ?? "").trim(),
        lastSeenAt: u.lastSeenAt ?? null,
        isOnline: Boolean(u.isOnline),
      };
    })
    .filter((u) => u.id && u.id !== currentUserId)
    .sort((a, b) => a.label.localeCompare(b.label));
}
