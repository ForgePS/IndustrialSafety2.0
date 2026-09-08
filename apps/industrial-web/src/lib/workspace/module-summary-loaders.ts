/**
 * Phase 6 — shared summary payloads for live workspace modules.
 * Each loader calls existing industrial APIs (no duplicate business logic).
 */

import { apiGet } from "@forge/web-kit";
import {
  listApprovalsQueue,
  listMyPendingAcks,
  listOverdueReviews,
} from "@/lib/document-control";

export type ModuleSummaryStat = { label: string; value: number; tone?: "danger" | "warning" | "muted" };

export type ModuleSummaryRow = {
  id: string;
  title: string;
  meta?: string;
  href: string;
  badge?: string;
  tone?: "danger" | "warning" | "muted";
};

export type ModuleSummaryPayload = {
  caption: string;
  stats: ModuleSummaryStat[];
  rows: ModuleSummaryRow[];
  emptyLabel: string;
};

export type ModuleSummaryLoader = (view: string) => Promise<ModuleSummaryPayload>;

type ListWrap<T> = { items?: T[] };

function statusOpen(status: string): boolean {
  const s = status.toUpperCase();
  return (
    s === "OPEN" ||
    s === "IN_PROGRESS" ||
    s === "DUE" ||
    s === "ACTIVE" ||
    s === "ASSIGNED" ||
    s === "PENDING"
  );
}

function isOverdueDate(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function isDueSoon(raw: string | null | undefined, days = 7): boolean {
  if (!raw) return false;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  const diff = d.getTime() - Date.now();
  return diff >= 0 && diff <= days * 86400000;
}

export async function loadInspectionsSummary(view: string): Promise<ModuleSummaryPayload> {
  const data = await apiGet<ListWrap<Record<string, unknown>>>("/api/v1/industrial/inspections", {
    query: { page: "1", pageSize: "100" },
  });
  const items = (data.items ?? []).filter((row) => {
    const payload = (row.sourcePayload as Record<string, unknown> | undefined) ?? row;
    return payload.isTemplate !== true && row.inspectionType !== "TEMPLATE";
  });
  const open = items.filter((row) => statusOpen(String(row.status ?? "")));
  const due = items.filter((row) => String(row.status ?? "").toUpperCase() === "DUE");
  const list =
    view === "due" ? due : view === "all" ? items : open;

  return {
    caption:
      due.length > 0
        ? `${open.length} open · ${due.length} due`
        : open.length > 0
          ? `${open.length} open`
          : "No open inspections",
    stats: [
      { label: "Open", value: open.length },
      { label: "Due", value: due.length, tone: due.length ? "warning" : "muted" },
    ],
    rows: list.slice(0, 20).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? row.name ?? "Inspection"),
      meta: String(row.status ?? ""),
      href: `/modules/inspections`,
      badge: String(row.status ?? ""),
      tone: String(row.status ?? "").toUpperCase() === "DUE" ? "warning" : undefined,
    })),
    emptyLabel: "No inspections in this view.",
  };
}

export async function loadTrainingSummary(view: string): Promise<ModuleSummaryPayload> {
  const data = await apiGet<
    ListWrap<{
      id: string;
      title?: string;
      status?: string;
      dueAt?: string | null;
      assigneeCount?: number;
      completedCount?: number;
      myStatus?: string | null;
    }>
  >("/api/v1/industrial/training/assignments", {
    query: { page: "1", pageSize: "100" },
  });
  const items = data.items ?? [];
  const incomplete = items.filter((row) => {
    const s = String(row.status ?? row.myStatus ?? "").toUpperCase();
    return s !== "COMPLETED" && s !== "PASSED" && s !== "CANCELLED";
  });
  const dueSoon = incomplete.filter((row) => isDueSoon(row.dueAt));
  const overdue = incomplete.filter((row) => isOverdueDate(row.dueAt));
  const list =
    view === "due-soon"
      ? dueSoon
      : view === "overdue"
        ? overdue
        : incomplete;

  return {
    caption:
      overdue.length > 0
        ? `${incomplete.length} assigned · ${overdue.length} overdue`
        : dueSoon.length > 0
          ? `${incomplete.length} assigned · ${dueSoon.length} due soon`
          : incomplete.length > 0
            ? `${incomplete.length} assigned`
            : "No open assignments",
    stats: [
      { label: "Assigned", value: incomplete.length },
      { label: "Due soon", value: dueSoon.length, tone: dueSoon.length ? "warning" : "muted" },
      { label: "Overdue", value: overdue.length, tone: overdue.length ? "danger" : "muted" },
    ],
    rows: list.slice(0, 20).map((row) => ({
      id: row.id,
      title: row.title || "Training assignment",
      meta: row.dueAt ? `Due ${new Date(row.dueAt).toLocaleDateString()}` : String(row.status ?? ""),
      href: "/modules/training",
      badge: isOverdueDate(row.dueAt) ? "Overdue" : isDueSoon(row.dueAt) ? "Due soon" : undefined,
      tone: isOverdueDate(row.dueAt) ? "danger" : isDueSoon(row.dueAt) ? "warning" : undefined,
    })),
    emptyLabel: "No training assignments in this view.",
  };
}

export async function loadDocumentsSummary(view: string): Promise<ModuleSummaryPayload> {
  const [overdueRes, approvalsRes, ackRes] = await Promise.all([
    listOverdueReviews().catch(() => ({ items: [] })),
    listApprovalsQueue().catch(() => ({ items: [] })),
    listMyPendingAcks().catch(() => ({ items: [] })),
  ]);

  const overdue = overdueRes.items ?? [];
  const approvals = approvalsRes.items ?? [];
  const mine = ackRes.items ?? [];

  const caption =
    overdue.length > 0
      ? `${overdue.length} review overdue`
      : approvals.length > 0
        ? `${approvals.length} pending approval`
        : mine.length > 0
          ? `${mine.length} to acknowledge`
          : "Documents up to date";

  const stats: ModuleSummaryStat[] = [
    { label: "Overdue", value: overdue.length, tone: overdue.length ? "danger" : "muted" },
    { label: "Approvals", value: approvals.length, tone: approvals.length ? "warning" : "muted" },
    { label: "My acks", value: mine.length },
  ];

  let rows: ModuleSummaryRow[];
  if (view === "approvals") {
    rows = approvals.slice(0, 20).map((row) => ({
      id: row.id,
      title: row.document?.name || "Document version",
      meta: row.workflowStatus || "Pending approval",
      href: "/modules/documents",
      tone: "warning" as const,
    }));
  } else if (view === "mine") {
    rows = mine.slice(0, 20).map((row) => ({
      id: row.requirementId,
      title: row.document?.name || "Document",
      meta: row.document?.status || "Acknowledge",
      href: "/modules/documents",
    }));
  } else {
    rows = overdue.slice(0, 20).map((row) => ({
      id: row.id,
      title: row.name || "Document",
      meta: row.reviewDueAt
        ? `Due ${new Date(row.reviewDueAt).toLocaleDateString()}`
        : "Review overdue",
      href: "/modules/documents",
      tone: "danger" as const,
    }));
  }

  return {
    caption,
    stats,
    rows,
    emptyLabel: "No documents in this view.",
  };
}

export async function loadEmergencyAlertsSummary(view: string): Promise<ModuleSummaryPayload> {
  const dash = await apiGet<{
    activeAlerts: number;
    acknowledgmentsPending: number;
    recent?: Array<{
      id: string;
      headline?: string;
      severity?: string;
      status?: string;
      issuedAt?: string | null;
      isDrill?: boolean;
    }>;
  }>("/api/v1/industrial/emergency-alerts/dashboard");

  const recent = dash.recent ?? [];
  const active = recent.filter((r) => String(r.status ?? "").toUpperCase() === "ACTIVE");
  const list = view === "recent" ? recent : active.length ? active : recent;

  return {
    caption:
      dash.activeAlerts > 0
        ? `${dash.activeAlerts} active · ${dash.acknowledgmentsPending} pending ack`
        : dash.acknowledgmentsPending > 0
          ? `${dash.acknowledgmentsPending} pending acknowledgments`
          : "No active alerts",
    stats: [
      { label: "Active", value: dash.activeAlerts, tone: dash.activeAlerts ? "danger" : "muted" },
      {
        label: "Pending ack",
        value: dash.acknowledgmentsPending,
        tone: dash.acknowledgmentsPending ? "warning" : "muted",
      },
    ],
    rows: list.slice(0, 20).map((row) => ({
      id: row.id,
      title: row.headline || "Emergency alert",
      meta: [row.severity, row.isDrill ? "Drill" : null].filter(Boolean).join(" · "),
      href: "/modules/emergency-alerts",
      badge: row.status,
      tone: String(row.severity ?? "").toUpperCase() === "CRITICAL" ? "danger" : "warning",
    })),
    emptyLabel: "No alerts to show.",
  };
}

export async function loadMessagingSummary(view: string): Promise<ModuleSummaryPayload> {
  const data = await apiGet<
    ListWrap<{
      id: string;
      title: string;
      unreadCount?: number;
      lastMessagePreview?: string;
      lastMessageAt?: string | null;
    }>
  >("/api/v1/industrial/messaging/threads");
  const threads = data.items ?? [];
  const unreadTotal = threads.reduce((sum, t) => sum + (t.unreadCount ?? 0), 0);
  const unreadThreads = threads.filter((t) => (t.unreadCount ?? 0) > 0);
  const list = view === "recent" ? threads : unreadThreads.length ? unreadThreads : threads;

  return {
    caption: unreadTotal > 0 ? `${unreadTotal} unread` : "No unread messages",
    stats: [
      { label: "Unread", value: unreadTotal, tone: unreadTotal ? "warning" : "muted" },
      { label: "Threads", value: threads.length },
    ],
    rows: list.slice(0, 20).map((row) => ({
      id: row.id,
      title: row.title || "Thread",
      meta: row.lastMessagePreview || (row.lastMessageAt ? new Date(row.lastMessageAt).toLocaleString() : ""),
      href: "/modules/messaging",
      badge: (row.unreadCount ?? 0) > 0 ? `${row.unreadCount} new` : undefined,
      tone: (row.unreadCount ?? 0) > 0 ? "warning" : undefined,
    })),
    emptyLabel: "No messages yet.",
  };
}

export async function loadSafetySuppliesSummary(view: string): Promise<ModuleSummaryPayload> {
  const [dash, reorder, requests] = await Promise.all([
    apiGet<{
      lowStockItems: number;
      outOfStockItems: number;
      pendingRequests: number;
      expiringSoon: number;
    }>("/api/v1/industrial/supplies/dashboard"),
    apiGet<
      ListWrap<{
        itemId: string;
        locationId: string;
        itemName?: string;
        quantityAvailable?: number;
        reorderPoint?: number;
      }>
    >("/api/v1/industrial/supplies/reorder").catch(() => ({ items: [] })),
    apiGet<
      ListWrap<{
        id: string;
        requestNumber?: string;
        status?: string;
        priority?: string;
      }>
    >("/api/v1/industrial/supplies/requests").catch(() => ({ items: [] })),
  ]);

  const reorderItems = reorder.items ?? [];
  const requestItems = (requests.items ?? []).filter((r) =>
    statusOpen(String(r.status ?? "PENDING")),
  );

  const rows: ModuleSummaryRow[] =
    view === "requests"
      ? requestItems.slice(0, 20).map((row) => ({
          id: String(row.id),
          title: String(row.requestNumber || "Supply request"),
          meta: [row.priority, row.status].filter(Boolean).join(" · "),
          href: "/modules/safety-supplies",
        }))
      : reorderItems.slice(0, 20).map((row) => ({
          id: `${row.itemId}:${row.locationId}`,
          title: String(row.itemName || "Supply item"),
          meta:
            row.quantityAvailable != null
              ? `${row.quantityAvailable} on hand` +
                (row.reorderPoint != null ? ` · reorder at ${row.reorderPoint}` : "")
              : undefined,
          href: "/modules/safety-supplies",
          tone: "warning" as const,
        }));

  return {
    caption:
      dash.lowStockItems > 0
        ? `${dash.lowStockItems} low stock · ${dash.pendingRequests} requests`
        : dash.pendingRequests > 0
          ? `${dash.pendingRequests} pending requests`
          : "Supplies look healthy",
    stats: [
      { label: "Low stock", value: dash.lowStockItems, tone: dash.lowStockItems ? "warning" : "muted" },
      { label: "Out", value: dash.outOfStockItems, tone: dash.outOfStockItems ? "danger" : "muted" },
      { label: "Requests", value: dash.pendingRequests },
    ],
    rows,
    emptyLabel: "Nothing in this supplies view.",
  };
}

export async function loadCorrectiveActionsSummary(view: string): Promise<ModuleSummaryPayload> {
  const data = await apiGet<
    ListWrap<{
      id: string;
      title?: string;
      status?: string;
      dueDate?: string | null;
      priority?: string | null;
      ownerName?: string | null;
    }>
  >("/api/v1/industrial/corrective-actions", {
    query: { page: "1", pageSize: "100" },
  });
  const items = data.items ?? [];
  const open = items.filter((row) => statusOpen(String(row.status ?? "")));
  const overdue = open.filter((row) => isOverdueDate(row.dueDate));
  const list = view === "overdue" ? overdue : view === "all" ? items : open;

  return {
    caption:
      overdue.length > 0
        ? `${open.length} open · ${overdue.length} overdue`
        : open.length > 0
          ? `${open.length} open`
          : "No open corrective actions",
    stats: [
      { label: "Open", value: open.length },
      { label: "Overdue", value: overdue.length, tone: overdue.length ? "danger" : "muted" },
    ],
    rows: list.slice(0, 20).map((row) => ({
      id: row.id,
      title: row.title || "Corrective action",
      meta: [row.priority, row.dueDate ? `Due ${new Date(row.dueDate).toLocaleDateString()}` : null]
        .filter(Boolean)
        .join(" · "),
      href: "/modules/inspections",
      badge: isOverdueDate(row.dueDate) ? "Overdue" : row.status,
      tone: isOverdueDate(row.dueDate) ? "danger" : undefined,
    })),
    emptyLabel: "No corrective actions in this view.",
  };
}

const LOADERS: Record<string, ModuleSummaryLoader> = {
  INSPECTIONS: loadInspectionsSummary,
  TRAINING: loadTrainingSummary,
  DOCUMENTS: loadDocumentsSummary,
  EMERGENCY_ALERTS: loadEmergencyAlertsSummary,
  MESSAGING: loadMessagingSummary,
  SAFETY_SUPPLIES: loadSafetySuppliesSummary,
  CORRECTIVE_ACTIONS: loadCorrectiveActionsSummary,
};

const DEFAULT_VIEWS: Record<string, string> = {
  INSPECTIONS: "open",
  TRAINING: "assigned",
  DOCUMENTS: "overdue",
  EMERGENCY_ALERTS: "active",
  MESSAGING: "unread",
  SAFETY_SUPPLIES: "low-stock",
  CORRECTIVE_ACTIONS: "open",
};

export function getModuleSummaryLoader(moduleKey: string): ModuleSummaryLoader | undefined {
  return LOADERS[moduleKey];
}

export function getModuleSummaryDefaultView(moduleKey: string): string {
  return DEFAULT_VIEWS[moduleKey] ?? "open";
}

export function isSummaryWidgetModule(moduleKey: string): boolean {
  return moduleKey in LOADERS;
}
