/** Field messaging types + display helpers (mirrors industrial messaging core). */

export type MessagingMember = {
  userId: string;
  role: string;
  displayName: string;
  email?: string;
  lastReadAt?: string | null;
  lastSeenAt?: string | null;
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
  replyTo?: MessagingReplyTo | null;
};

export type MessagingMessageCluster = {
  showSender: boolean;
  isClusterStart: boolean;
  isClusterEnd: boolean;
};

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
  hasMore?: boolean;
};

export type MessagingParticipant = {
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

export function messageSenderKey(
  message: Pick<MessagingMessage, "senderUserId" | "isOwn">,
): string {
  const id = String(message.senderUserId ?? "").trim();
  if (id) return id;
  return message.isOwn ? "__own__" : "__other__";
}

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

export function displayPersonName(name: string | null | undefined, fallback = "User"): string {
  const trimmed = String(name ?? "").trim();
  return trimmed || fallback;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export function formatMessageTime(iso: string | null | undefined): string {
  if (!iso) return "";
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

export function messagingThreadTitleDisplay(
  thread: Pick<MessagingThread, "title" | "threadType" | "members">,
  currentUserId?: string,
): string {
  const isGroup = String(thread.threadType).toUpperCase() === "GROUP";
  if (isGroup) return thread.title?.trim() || "Group chat";
  const other = (thread.members ?? []).find((member) => member.userId !== currentUserId);
  if (other) return displayPersonName(other.displayName, other.email || "User");
  return displayPersonName(thread.title, "Conversation");
}

export function messagingMemberNames(
  members: readonly MessagingMember[] | undefined,
  options?: { excludeUserId?: string; limit?: number },
): string {
  const exclude = options?.excludeUserId ?? "";
  const limit = options?.limit ?? 4;
  const names = (members ?? [])
    .filter((member) => member.userId !== exclude)
    .map((member) => displayPersonName(member.displayName, member.email || "User"));
  if (names.length === 0) return "";
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")}…`;
}

export function messagingParticipantLine(user: MessagingParticipant): string {
  const name = displayPersonName(user.label, user.email || "User");
  const parts: string[] = [];
  if (user.employeeNumber?.trim()) parts.push(`#${user.employeeNumber.trim()}`);
  parts.push(name);
  if (user.siteLabel?.trim()) parts.push(user.siteLabel.trim());
  else if (user.email.trim() && user.email.toLowerCase() !== user.label.trim().toLowerCase()) {
    parts.push(user.email.trim());
  }
  return parts.join(" · ");
}
