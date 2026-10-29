import {
  HELPDESK_CUSTOMER_VISIBLE_MESSAGE_TYPES,
  HELPDESK_DISPOSITIONS,
  HELPDESK_PRIORITIES,
  HELPDESK_PRODUCTS,
  HELPDESK_SOURCES,
  HELPDESK_TICKET_STATUSES,
  type HelpdeskMessageType,
} from "@forge/contracts";
import { z } from "zod";

const trimmed = (max: number) => z.string().trim().max(max);

export const createTicketSchema = z.object({
  productCode: z
    .enum(HELPDESK_PRODUCTS.map((p) => p.code) as [string, ...string[]])
    .default("FORGE_INDUSTRIAL"),
  moduleCode: trimmed(80).optional().nullable(),
  requestType: trimmed(64).min(1, "Choose a request type"),
  productArea: trimmed(80).optional().nullable(),
  subject: trimmed(300).min(3, "Subject must be at least 3 characters"),
  description: trimmed(20000).min(10, "Describe the issue in at least 10 characters"),
  customerReportedSeverity: z.enum(HELPDESK_PRIORITIES).optional().nullable(),
  source: z.enum(HELPDESK_SOURCES).default("WEB"),
  locationId: z.string().uuid().optional().nullable(),
  divisionId: z.string().uuid().optional().nullable(),
  relatedEntityType: trimmed(80).optional().nullable(),
  relatedEntityId: z.string().uuid().optional().nullable(),
  technicalContext: z.record(z.unknown()).optional().nullable(),
  askForgeContext: z.record(z.unknown()).optional().nullable(),
  clientRequestId: trimmed(120).optional().nullable(),
  requesterEmail: z.string().trim().email().max(320).optional().nullable(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const messageSchema = z.object({
  body: trimmed(20000).min(1, "Message cannot be empty"),
});

export const supportReplySchema = messageSchema.extend({
  nextStatus: z.enum(HELPDESK_TICKET_STATUSES).optional().nullable(),
});

export const statusChangeSchema = z.object({
  status: z.enum(HELPDESK_TICKET_STATUSES),
  disposition: z.enum(HELPDESK_DISPOSITIONS).optional().nullable(),
  note: trimmed(5000).optional().nullable(),
  expectedVersion: z.number().int().positive().optional(),
});

export const customerStatusSchema = z.object({
  reason: trimmed(5000).optional().nullable(),
});

export const priorityChangeSchema = z.object({
  priority: z.enum(HELPDESK_PRIORITIES),
  expectedVersion: z.number().int().positive().optional(),
});

export const assignSchema = z.object({
  assigneeUserId: z.string().uuid().nullable(),
  team: trimmed(80).optional().nullable(),
});

export const tagChangeSchema = z.object({
  add: z.array(trimmed(80).min(1)).max(20).default([]),
  remove: z.array(z.string().uuid()).max(20).default([]),
});

export const watcherChangeSchema = z.object({
  add: z.array(z.string().uuid()).max(20).default([]),
  remove: z.array(z.string().uuid()).max(20).default([]),
});

export const attachmentUploadSchema = z.object({
  filename: trimmed(500).min(1, "filename is required"),
  mimeType: trimmed(255).min(1, "mimeType is required"),
  contentLength: z.number().int().positive(),
  internal: z.boolean().optional(),
});

export const SUPPORT_QUEUES = [
  "open",
  "all",
  "unassigned",
  "mine",
  "critical",
  "high",
  "waiting_customer",
  "waiting_forge",
  "feature_requests",
  "bugs",
  "known_issues",
  "closed",
] as const;
export type SupportQueue = (typeof SUPPORT_QUEUES)[number];

export function parseQueue(value: unknown): SupportQueue {
  return (SUPPORT_QUEUES as readonly string[]).includes(String(value))
    ? (value as SupportQueue)
    : "open";
}

export function parsePaging(query: Record<string, unknown>, maxPageSize = 100) {
  const page = Math.max(1, Math.floor(Number(query.page ?? 1)) || 1);
  const pageSize = Math.min(
    maxPageSize,
    Math.max(1, Math.floor(Number(query.pageSize ?? 25)) || 25),
  );
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Allowed client-reported technical context. Anything else (tokens, headers, storage) is dropped. */
const TECH_CONTEXT_KEYS = [
  "route",
  "url",
  "browser",
  "browserVersion",
  "os",
  "osVersion",
  "deviceType",
  "isMobile",
  "viewportWidth",
  "viewportHeight",
  "screenWidth",
  "screenHeight",
  "appVersion",
  "buildVersion",
  "timezone",
  "locale",
  "clientTimestamp",
  "correlationId",
  "lastErrorId",
  "userAgent",
  "online",
] as const;

const SECRETISH =
  /(token|secret|password|passwd|authorization|bearer|session|cookie|api[_-]?key|code=)/i;

function stripUrlSecrets(value: string): string {
  try {
    const url = new URL(value, "https://placeholder.invalid");
    const path = url.pathname;
    return value.startsWith("http") ? `${url.origin}${path}` : path;
  } catch {
    return value.split("?")[0]?.split("#")[0] ?? "";
  }
}

export function sanitizeTechnicalContext(raw: unknown): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const out: Record<string, string | number | boolean> = {};
  for (const key of TECH_CONTEXT_KEYS) {
    const value = input[key];
    if (typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === "string" && value.trim()) {
      let text = value.trim().slice(0, 500);
      if (key === "url" || key === "route") text = stripUrlSecrets(text);
      if (key !== "userAgent" && SECRETISH.test(text)) continue;
      out[key] = text;
    }
  }
  return out;
}

export type TicketRow = {
  id: string;
  tenantId: string;
  productCode: string;
  moduleCode: string | null;
  ticketNumber: string;
  requesterUserId: string | null;
  requesterName: string;
  requesterEmail: string | null;
  requestType: string;
  productArea: string | null;
  subject: string;
  description: string;
  customerReportedSeverity: string | null;
  priority: string;
  status: string;
  disposition: string | null;
  assignedTeam: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  source: string;
  locationId: string | null;
  divisionId: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  technicalContext: unknown;
  askForgeContext: unknown;
  mergedIntoTicketId: string | null;
  firstResponseAt: Date | null;
  lastCustomerActivityAt: Date | null;
  lastSupportActivityAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  reopenedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  recordVersion: number;
};

export type MessageRow = {
  id: string;
  ticketId: string;
  authorUserId: string | null;
  authorName: string;
  authorType: string;
  messageType: string;
  body: string;
  isInternal: boolean;
  createdAt: Date;
};

export type AttachmentRow = {
  id: string;
  ticketId: string;
  messageId: string | null;
  documentId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  isInternal: boolean;
  status: string;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  uploadedByType: string;
  uploadedAt: Date | null;
  createdAt: Date;
};

export type EventRow = {
  id: string;
  ticketId: string;
  eventType: string;
  fromValue: string | null;
  toValue: string | null;
  isInternal: boolean;
  actorUserId: string | null;
  actorName: string | null;
  actorType: string;
  createdAt: Date;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Ticket fields safe for the requesting customer. No assignee identity, disposition, or tech context. */
export function toCustomerTicket(row: TicketRow) {
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    productCode: row.productCode,
    moduleCode: row.moduleCode,
    requestType: row.requestType,
    productArea: row.productArea,
    subject: row.subject,
    description: row.description,
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    customerReportedSeverity: row.customerReportedSeverity,
    priority: row.priority,
    status: row.status,
    isAssigned: Boolean(row.assignedUserId),
    source: row.source,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    firstResponseAt: iso(row.firstResponseAt),
    resolvedAt: iso(row.resolvedAt),
    closedAt: iso(row.closedAt),
    reopenedAt: iso(row.reopenedAt),
    recordVersion: row.recordVersion,
  };
}

export function toSupportTicket(row: TicketRow, tenantName: string | null) {
  return {
    ...toCustomerTicket(row),
    tenantId: row.tenantId,
    tenantName,
    requesterUserId: row.requesterUserId,
    disposition: row.disposition,
    assignedTeam: row.assignedTeam,
    assignedUserId: row.assignedUserId,
    assignedUserName: row.assignedUserName,
    locationId: row.locationId,
    divisionId: row.divisionId,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    technicalContext: row.technicalContext ?? {},
    askForgeContext: row.askForgeContext ?? null,
    mergedIntoTicketId: row.mergedIntoTicketId,
    lastCustomerActivityAt: iso(row.lastCustomerActivityAt),
    lastSupportActivityAt: iso(row.lastSupportActivityAt),
  };
}

export function isCustomerVisibleMessage(
  row: Pick<MessageRow, "messageType" | "isInternal">,
): boolean {
  if (row.isInternal) return false;
  return HELPDESK_CUSTOMER_VISIBLE_MESSAGE_TYPES.includes(row.messageType as HelpdeskMessageType);
}

export function toMessage(row: MessageRow) {
  return {
    id: row.id,
    authorName: row.authorName,
    authorType: row.authorType,
    messageType: row.messageType,
    body: row.body,
    isInternal: row.isInternal,
    createdAt: iso(row.createdAt),
  };
}

export function toAttachment(row: AttachmentRow) {
  return {
    id: row.id,
    messageId: row.messageId,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    isInternal: row.isInternal,
    uploadedByName: row.uploadedByName,
    uploadedByType: row.uploadedByType,
    uploadedAt: iso(row.uploadedAt ?? row.createdAt),
  };
}

export function toEvent(row: EventRow) {
  return {
    id: row.id,
    eventType: row.eventType,
    fromValue: row.fromValue,
    toValue: row.toValue,
    isInternal: row.isInternal,
    actorName: row.actorName,
    actorType: row.actorType,
    createdAt: iso(row.createdAt),
  };
}

/**
 * Customer-facing ticket detail. Internal notes, AI drafts, internal attachments, and
 * internal timeline events are removed here so no customer route can leak them.
 */
export function buildCustomerTicketView(input: {
  ticket: TicketRow;
  messages: MessageRow[];
  attachments: AttachmentRow[];
  events: EventRow[];
}) {
  return {
    ticket: toCustomerTicket(input.ticket),
    messages: input.messages.filter(isCustomerVisibleMessage).map(toMessage),
    attachments: input.attachments
      .filter((a) => !a.isInternal && a.status === "COMPLETE")
      .map(toAttachment),
    events: input.events.filter((e) => !e.isInternal).map(toEvent),
  };
}

export function slugifyTag(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function helpdeskAttachmentPrefix(tenantId: string, ticketId: string): string {
  return `tenants/${tenantId}/helpdesk/${ticketId}/attachments/`;
}

export const HELPDESK_ATTACHMENT_SOURCE = "HELPDESK_TICKET";
