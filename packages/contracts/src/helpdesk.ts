/**
 * Forge Help Desk — platform-level support ticketing shared by every Forge product.
 * Tickets live in the customer tenant; Forge support staff work across tenants.
 */

export const HELPDESK_CUSTOMER_PERMISSIONS = [
  "helpdesk.ticket.create",
  "helpdesk.ticket.view_own",
  "helpdesk.ticket.view_location",
  "helpdesk.ticket.view_tenant",
  "helpdesk.ticket.comment",
  "helpdesk.ticket.reopen",
  "helpdesk.ticket.close",
  "helpdesk.knowledge.view",
  "helpdesk.status.view",
] as const;

export const HELPDESK_SUPPORT_PERMISSIONS = [
  "helpdesk.support.view",
  "helpdesk.support.assign",
  "helpdesk.support.respond",
  "helpdesk.support.internal_note",
  "helpdesk.support.change_priority",
  "helpdesk.support.change_status",
  "helpdesk.support.merge",
  "helpdesk.support.escalate",
  "helpdesk.support.link_incident",
  "helpdesk.support.link_development",
  "helpdesk.support.manage_watchers",
] as const;

export const HELPDESK_ADMIN_PERMISSIONS = [
  "helpdesk.admin.manage",
  "helpdesk.admin.sla",
  "helpdesk.admin.categories",
  "helpdesk.admin.templates",
  "helpdesk.admin.tags",
  "helpdesk.admin.status",
  "helpdesk.admin.announcements",
  "helpdesk.admin.incidents",
] as const;

export const HELPDESK_KNOWLEDGE_PERMISSIONS = [
  "helpdesk.knowledge.create",
  "helpdesk.knowledge.edit",
  "helpdesk.knowledge.review",
  "helpdesk.knowledge.publish",
  "helpdesk.knowledge.archive",
] as const;

export const HELPDESK_ANALYTICS_PERMISSIONS = [
  "helpdesk.analytics.view",
  "helpdesk.analytics.export",
] as const;

export const HELPDESK_PERMISSIONS = [
  ...HELPDESK_CUSTOMER_PERMISSIONS,
  ...HELPDESK_SUPPORT_PERMISSIONS,
  ...HELPDESK_ADMIN_PERMISSIONS,
  ...HELPDESK_KNOWLEDGE_PERMISSIONS,
  ...HELPDESK_ANALYTICS_PERMISSIONS,
] as const;

export type HelpdeskPermission = (typeof HELPDESK_PERMISSIONS)[number];

export const HELPDESK_PRODUCTS = [
  { code: "FORGE_INDUSTRIAL", label: "Forge Industrial Safety" },
  { code: "FORGE_RMS", label: "Forge Responder" },
  { code: "FORGE_ACADEMY", label: "Forge Academy" },
] as const;

export type HelpdeskProductCode = (typeof HELPDESK_PRODUCTS)[number]["code"];

export function helpdeskProductLabel(code: string | null | undefined): string {
  return HELPDESK_PRODUCTS.find((p) => p.code === code)?.label ?? (code || "Forge");
}

export const HELPDESK_TICKET_STATUSES = [
  "NEW",
  "TRIAGE",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "WAITING_ON_FORGE",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
] as const;

export type HelpdeskTicketStatus = (typeof HELPDESK_TICKET_STATUSES)[number];

export const HELPDESK_STATUS_LABELS: Record<HelpdeskTicketStatus, string> = {
  NEW: "New",
  TRIAGE: "Triage",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  WAITING_ON_CUSTOMER: "Waiting on customer",
  WAITING_ON_FORGE: "Waiting on Forge",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
};

export const HELPDESK_OPEN_STATUSES: readonly HelpdeskTicketStatus[] = [
  "NEW",
  "TRIAGE",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "WAITING_ON_FORGE",
  "REOPENED",
];

export function isHelpdeskStatus(value: unknown): value is HelpdeskTicketStatus {
  return (
    typeof value === "string" && (HELPDESK_TICKET_STATUSES as readonly string[]).includes(value)
  );
}

export function isOpenHelpdeskStatus(status: string): boolean {
  return (HELPDESK_OPEN_STATUSES as readonly string[]).includes(status);
}

export type HelpdeskActor = "CUSTOMER" | "SUPPORT";

/**
 * Allowed status moves. NEW is only an initial state; CLOSED follows RESOLVED for
 * support; REOPENED is only reachable from RESOLVED/CLOSED.
 */
export function allowedHelpdeskTransitions(
  from: HelpdeskTicketStatus,
  actor: HelpdeskActor,
): HelpdeskTicketStatus[] {
  if (actor === "CUSTOMER") {
    if (from === "RESOLVED") return ["REOPENED", "CLOSED"];
    if (from === "CLOSED") return ["REOPENED"];
    return ["CLOSED"];
  }
  if (from === "RESOLVED") return ["CLOSED", "REOPENED"];
  if (from === "CLOSED") return ["REOPENED"];
  const working: HelpdeskTicketStatus[] = [
    "TRIAGE",
    "ASSIGNED",
    "IN_PROGRESS",
    "WAITING_ON_CUSTOMER",
    "WAITING_ON_FORGE",
    "RESOLVED",
  ];
  return working.filter((s) => s !== from);
}

export function canTransitionHelpdeskStatus(
  from: HelpdeskTicketStatus,
  to: HelpdeskTicketStatus,
  actor: HelpdeskActor,
): boolean {
  return allowedHelpdeskTransitions(from, actor).includes(to);
}

export const HELPDESK_DISPOSITIONS = [
  "DUPLICATE",
  "KNOWN_ISSUE",
  "FEATURE_REQUEST",
  "CANNOT_REPRODUCE",
  "CONFIGURATION_ISSUE",
  "TRAINING_ISSUE",
  "THIRD_PARTY_ISSUE",
  "BUG_CONFIRMED",
  "WORKING_AS_DESIGNED",
] as const;

export type HelpdeskDisposition = (typeof HELPDESK_DISPOSITIONS)[number];

export const HELPDESK_DISPOSITION_LABELS: Record<HelpdeskDisposition, string> = {
  DUPLICATE: "Duplicate",
  KNOWN_ISSUE: "Known issue",
  FEATURE_REQUEST: "Feature request",
  CANNOT_REPRODUCE: "Cannot reproduce",
  CONFIGURATION_ISSUE: "Configuration issue",
  TRAINING_ISSUE: "Training issue",
  THIRD_PARTY_ISSUE: "Third-party issue",
  BUG_CONFIRMED: "Bug confirmed",
  WORKING_AS_DESIGNED: "Working as designed",
};

export const HELPDESK_PRIORITIES = ["P1_CRITICAL", "P2_HIGH", "P3_NORMAL", "P4_LOW"] as const;

export type HelpdeskPriority = (typeof HELPDESK_PRIORITIES)[number];

export const HELPDESK_PRIORITY_META: Record<
  HelpdeskPriority,
  { label: string; short: string; description: string }
> = {
  P1_CRITICAL: {
    label: "P1 - Critical",
    short: "Critical",
    description:
      "Production outage, data loss, security event, or core operations blocked with no workaround.",
  },
  P2_HIGH: {
    label: "P2 - High",
    short: "High",
    description: "Major feature unavailable or significant impact with no reasonable workaround.",
  },
  P3_NORMAL: {
    label: "P3 - Normal",
    short: "Normal",
    description: "Feature impaired but a workaround exists, or a standard support issue.",
  },
  P4_LOW: {
    label: "P4 - Low",
    short: "Low",
    description: "General question, cosmetic issue, minor defect, or enhancement idea.",
  },
};

export function isHelpdeskPriority(value: unknown): value is HelpdeskPriority {
  return typeof value === "string" && (HELPDESK_PRIORITIES as readonly string[]).includes(value);
}

export const HELPDESK_REQUEST_TYPES = [
  { code: "TECHNICAL_ISSUE", label: "Technical Issue" },
  { code: "HOW_DO_I", label: "How Do I...?" },
  { code: "ACCOUNT_LOGIN", label: "Account / Login" },
  { code: "PERMISSIONS", label: "Permissions" },
  { code: "FEATURE_REQUEST", label: "Feature Request" },
  { code: "DATA_ISSUE", label: "Data Issue" },
  { code: "INTEGRATION_ISSUE", label: "Integration Issue" },
  { code: "MOBILE_APP_ISSUE", label: "Mobile App Issue" },
  { code: "BILLING_SUBSCRIPTION", label: "Billing / Subscription" },
  { code: "TRAINING_REQUEST", label: "Training Request" },
  { code: "REPORT_PROBLEM", label: "Report Problem" },
  { code: "OTHER", label: "Other" },
] as const;

export const HELPDESK_INDUSTRIAL_PRODUCT_AREAS = [
  { code: "DASHBOARD", label: "Dashboard" },
  { code: "PERSONNEL", label: "Personnel" },
  { code: "TRAINING", label: "Training" },
  { code: "INCIDENTS", label: "Incidents" },
  { code: "CLAIMS", label: "Claims" },
  { code: "INSPECTIONS", label: "Inspections" },
  { code: "CORRECTIVE_ACTIONS", label: "Corrective Actions" },
  { code: "OBSERVATIONS", label: "Observations" },
  { code: "RISK_REGISTER", label: "Risk Register" },
  { code: "JSA_JHA", label: "JSA / JHA" },
  { code: "LOTO", label: "LOTO" },
  { code: "PERMITS", label: "Permits" },
  { code: "EQUIPMENT_ASSETS", label: "Equipment / Assets" },
  { code: "QR_CODES", label: "QR Codes" },
  { code: "CONTRACTORS", label: "Contractors" },
  { code: "EMERGENCY_MANAGEMENT", label: "Emergency Management" },
  { code: "DOT_COMPLIANCE", label: "DOT Compliance" },
  { code: "OSHA_REPORTING", label: "OSHA Reporting" },
  { code: "REPORTS_ANALYTICS", label: "Reports / Analytics" },
  { code: "ASK_FORGE", label: "Ask Forge" },
  { code: "ADMINISTRATION", label: "Administration" },
  { code: "INTEGRATIONS", label: "Integrations" },
  { code: "MOBILE_FIELD", label: "Mobile / Field Version" },
  { code: "OTHER", label: "Other" },
] as const;

export const HELPDESK_SOURCES = [
  "WEB",
  "MOBILE",
  "ASK_FORGE",
  "EMAIL",
  "PHONE",
  "INTERNAL",
] as const;
export type HelpdeskSource = (typeof HELPDESK_SOURCES)[number];

export const HELPDESK_MESSAGE_TYPES = [
  "CUSTOMER_MESSAGE",
  "SUPPORT_REPLY",
  "INTERNAL_NOTE",
  "SYSTEM_EVENT",
  "AI_DRAFT",
] as const;
export type HelpdeskMessageType = (typeof HELPDESK_MESSAGE_TYPES)[number];

/** Message types a customer may ever receive. Internal notes and AI drafts never qualify. */
export const HELPDESK_CUSTOMER_VISIBLE_MESSAGE_TYPES: readonly HelpdeskMessageType[] = [
  "CUSTOMER_MESSAGE",
  "SUPPORT_REPLY",
];

export function formatHelpdeskTicketNumber(year: number, sequence: number): string {
  return `SUP-${year}-${String(sequence).padStart(6, "0")}`;
}

export const HELPDESK_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const HELPDESK_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "video/mp4",
  "video/quicktime",
] as const;

export function isAllowedHelpdeskAttachmentMime(mimeType: string): boolean {
  return (HELPDESK_ATTACHMENT_MIME_TYPES as readonly string[]).includes(
    mimeType.trim().toLowerCase(),
  );
}
