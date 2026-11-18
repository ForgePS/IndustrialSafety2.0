import {
  HELPDESK_DISPOSITION_LABELS,
  HELPDESK_PRIORITY_META,
  HELPDESK_STATUS_LABELS,
  type HelpdeskDisposition,
  type HelpdeskPriority,
  type HelpdeskTicketStatus,
} from "@forge/contracts";
import { apiGet, apiSend } from "@forge/web-kit";

export const HELPDESK_API = "/api/v1/helpdesk";

export type HelpdeskOption = { code: string; label: string; productCode?: string | null };

export type HelpdeskCapabilities = {
  canCreate: boolean;
  canViewTenant: boolean;
  canComment: boolean;
  canReopen: boolean;
  canClose: boolean;
  isSupportAgent: boolean;
  crossTenant: boolean;
  canAssign: boolean;
  canRespond: boolean;
  canInternalNote: boolean;
  canChangeStatus: boolean;
  canChangePriority: boolean;
  canManageWatchers: boolean;
};

export type HelpdeskConfig = {
  requestTypes: HelpdeskOption[];
  productAreas: HelpdeskOption[];
  capabilities: HelpdeskCapabilities;
};

export type HelpdeskTicket = {
  id: string;
  ticketNumber: string;
  productCode: string;
  moduleCode: string | null;
  requestType: string;
  productArea: string | null;
  subject: string;
  description: string;
  requesterName: string;
  requesterEmail: string | null;
  customerReportedSeverity: string | null;
  priority: string;
  status: string;
  isAssigned: boolean;
  source: string;
  createdAt: string | null;
  updatedAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  reopenedAt: string | null;
  recordVersion: number;
};

export type SupportTicket = HelpdeskTicket & {
  tenantId: string;
  tenantName: string | null;
  requesterUserId: string | null;
  disposition: string | null;
  assignedTeam: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  technicalContext: Record<string, unknown>;
  askForgeContext: Record<string, unknown> | null;
  lastCustomerActivityAt: string | null;
  lastSupportActivityAt: string | null;
};

export type HelpdeskMessage = {
  id: string;
  authorName: string;
  authorType: string;
  messageType: string;
  body: string;
  isInternal: boolean;
  createdAt: string | null;
};

export type HelpdeskAttachment = {
  id: string;
  messageId: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  isInternal: boolean;
  uploadedByName: string | null;
  uploadedByType: string;
  uploadedAt: string | null;
};

export type HelpdeskEvent = {
  id: string;
  eventType: string;
  fromValue: string | null;
  toValue: string | null;
  isInternal: boolean;
  actorName: string | null;
  actorType: string;
  createdAt: string | null;
};

export type CustomerTicketDetail = {
  ticket: HelpdeskTicket;
  messages: HelpdeskMessage[];
  attachments: HelpdeskAttachment[];
  events: HelpdeskEvent[];
  canReply: boolean;
  canReopen: boolean;
  canClose: boolean;
};

export type SupportTicketDetail = {
  ticket: SupportTicket;
  messages: HelpdeskMessage[];
  attachments: HelpdeskAttachment[];
  events: HelpdeskEvent[];
  tags: Array<{ id: string; slug: string; label: string; color: string | null }>;
  watchers: Array<{ userId: string; name: string }>;
  allowedStatuses: HelpdeskTicketStatus[];
};

export type SupportSummary = {
  open: number;
  critical: number;
  high: number;
  unassigned: number;
  mine: number;
  waitingOnCustomer: number;
  waitingOnForge: number;
  newToday: number;
  resolvedToday: number;
  slaRisk: number | null;
  slaBreached: number | null;
  crossTenant: boolean;
};

export type SupportAgent = { userId: string; name: string; email: string | null };

export function statusLabel(status: string): string {
  return HELPDESK_STATUS_LABELS[status as HelpdeskTicketStatus] ?? status;
}

export function statusTone(status: string): string {
  switch (status) {
    case "NEW":
      return "info";
    case "TRIAGE":
    case "REOPENED":
      return "warning";
    case "ASSIGNED":
    case "IN_PROGRESS":
      return "primary";
    case "WAITING_ON_CUSTOMER":
      return "secondary";
    case "WAITING_ON_FORGE":
      return "dark";
    case "RESOLVED":
      return "success";
    case "CLOSED":
      return "secondary";
    default:
      return "secondary";
  }
}

export function priorityLabel(priority: string | null | undefined, short = false): string {
  if (!priority) return "Not set";
  const meta = HELPDESK_PRIORITY_META[priority as HelpdeskPriority];
  if (!meta) return priority;
  return short ? meta.short : meta.label;
}

export function priorityTone(priority: string | null | undefined): string {
  switch (priority) {
    case "P1_CRITICAL":
      return "danger";
    case "P2_HIGH":
      return "warning";
    case "P3_NORMAL":
      return "info";
    default:
      return "secondary";
  }
}

export function dispositionLabel(value: string | null | undefined): string {
  if (!value) return "None";
  return HELPDESK_DISPOSITION_LABELS[value as HelpdeskDisposition] ?? value;
}

export function optionLabel(options: HelpdeskOption[], code: string | null | undefined): string {
  if (!code) return "";
  return options.find((o) => o.code === code)?.label ?? code;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatAge(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "";
  const ms = now - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function eventSentence(e: HelpdeskEvent): string {
  const who = e.actorName || (e.actorType === "SYSTEM" ? "System" : "Someone");
  switch (e.eventType) {
    case "CREATED":
      return `${who} submitted the ticket`;
    case "STATUS_CHANGED":
      return `${who} changed status from ${statusLabel(e.fromValue ?? "")} to ${statusLabel(e.toValue ?? "")}`;
    case "RESOLVED":
      return `${who} resolved the ticket`;
    case "CLOSED":
      return `${who} closed the ticket`;
    case "REOPENED":
      return `${who} reopened the ticket`;
    case "PRIORITY_CHANGED":
      return `${who} changed priority from ${priorityLabel(e.fromValue, true)} to ${priorityLabel(e.toValue, true)}`;
    case "ASSIGNED":
      return `${who} assigned the ticket to ${e.toValue ?? "an agent"}`;
    case "REASSIGNED":
      return `${who} reassigned the ticket from ${e.fromValue ?? "an agent"} to ${e.toValue ?? "an agent"}`;
    case "UNASSIGNED":
      return `${who} unassigned ${e.fromValue ?? "the agent"}`;
    case "DISPOSITION_CHANGED":
      return `${who} set disposition to ${dispositionLabel(e.toValue)}`;
    case "TAG_ADDED":
      return `${who} added tag ${e.toValue ?? ""}`;
    case "TAG_REMOVED":
      return `${who} removed tag ${e.fromValue ?? ""}`;
    case "WATCHER_ADDED":
      return `${who} added watcher ${e.toValue ?? ""}`;
    case "WATCHER_REMOVED":
      return `${who} removed watcher ${e.fromValue ?? ""}`;
    case "ATTACHMENT_ADDED":
      return `${who} attached ${e.toValue ?? "a file"}`;
    case "ATTACHMENT_REMOVED":
      return `${who} removed ${e.fromValue ?? "a file"}`;
    default:
      return `${who}: ${e.eventType.toLowerCase().replace(/_/g, " ")}`;
  }
}

function browserFromUa(ua: string): { browser: string; browserVersion: string } {
  const checks: Array<[string, RegExp]> = [
    ["Edge", /Edg\/([\d.]+)/],
    ["Chrome", /Chrome\/([\d.]+)/],
    ["Firefox", /Firefox\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of checks) {
    const m = ua.match(re);
    if (m) return { browser: name, browserVersion: m[1] ?? "" };
  }
  return { browser: "Unknown", browserVersion: "" };
}

function osFromUa(ua: string): string {
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}

/** Non-sensitive environment details attached to new tickets. The API re-filters this list. */
export function captureTechnicalContext(route?: string): Record<string, string | number | boolean> {
  if (typeof window === "undefined") return {};
  const ua = navigator.userAgent;
  const { browser, browserVersion } = browserFromUa(ua);
  const width = window.innerWidth;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua) || width < 768;
  return {
    route: route ?? window.location.pathname,
    url: `${window.location.origin}${window.location.pathname}`,
    browser,
    browserVersion,
    os: osFromUa(ua),
    deviceType: width < 768 ? "phone" : width < 1200 ? "tablet" : "desktop",
    isMobile,
    viewportWidth: width,
    viewportHeight: window.innerHeight,
    screenWidth: window.screen?.width ?? 0,
    screenHeight: window.screen?.height ?? 0,
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
    clientTimestamp: new Date().toISOString(),
    online: navigator.onLine,
    userAgent: ua,
  };
}

export function guessMimeType(file: File): string {
  const fromType = file.type.trim().toLowerCase();
  if (fromType) return fromType;
  const name = file.name.toLowerCase();
  const map: Array<[string, string]> = [
    [".pdf", "application/pdf"],
    [".png", "image/png"],
    [".gif", "image/gif"],
    [".webp", "image/webp"],
    [".heic", "image/heic"],
    [".heif", "image/heif"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".doc", "application/msword"],
    [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    [".xls", "application/vnd.ms-excel"],
    [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    [".csv", "text/csv"],
    [".txt", "text/plain"],
    [".mp4", "video/mp4"],
    [".mov", "video/quicktime"],
  ];
  return map.find(([ext]) => name.endsWith(ext))?.[1] ?? "application/octet-stream";
}

function putToStorage(uploadUrl: string, file: File, mimeType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.setRequestHeader("x-amz-server-side-encryption", "aws:kms");
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload to storage failed (${xhr.status}). Please try again.`));
    xhr.onerror = () =>
      reject(
        new Error(
          "Upload blocked by the browser (network or CORS). Try again after a hard refresh.",
        ),
      );
    xhr.send(file);
  });
}

/** Presign, PUT to S3, then confirm. `base` is the ticket route (customer or support). */
export async function uploadTicketAttachment(
  base: string,
  file: File,
  internal = false,
): Promise<HelpdeskAttachment> {
  const mimeType = guessMimeType(file);
  const presign = await apiSend<{ attachmentId: string; uploadUrl: string; mimeType: string }>(
    `${base}/attachments/upload-url`,
    "POST",
    {
      filename: file.name,
      mimeType,
      contentLength: file.size,
      ...(internal ? { internal: true } : {}),
    },
  );
  await putToStorage(presign.uploadUrl, file, presign.mimeType || mimeType);
  const done = await apiSend<{ attachment: HelpdeskAttachment }>(
    `${base}/attachments/${encodeURIComponent(presign.attachmentId)}/complete`,
    "POST",
    {},
  );
  return done.attachment;
}

export async function openTicketAttachment(base: string, attachmentId: string): Promise<void> {
  const res = await apiGet<{ downloadUrl: string }>(
    `${base}/attachments/${encodeURIComponent(attachmentId)}/download`,
  );
  window.open(res.downloadUrl, "_blank", "noopener");
}

export const MAX_TICKET_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const TICKET_ATTACHMENT_ACCEPT =
  "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,video/mp4,video/quicktime";
