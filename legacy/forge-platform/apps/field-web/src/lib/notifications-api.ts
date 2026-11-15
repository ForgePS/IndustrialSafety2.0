import { apiGet, apiSend } from "@forge/web-kit";
import { fieldHrefFromIndustrialPath } from "@/lib/scan-routes";

export type FieldNotification = {
  id: string;
  type?: string | null;
  title?: string | null;
  body?: string | null;
  href?: string | null;
  priority?: string | null;
  createdAt?: string | null;
  readAt?: string | null;
  metadataJson?: Record<string, unknown> | string | null;
};

export type FieldNotificationPersonGroup = {
  key: string;
  label: string;
  /** True when this group is a person (messaging) cluster, not a singleton alert. */
  isPerson: boolean;
  items: FieldNotification[];
};

function metadataRecord(metadata: FieldNotification["metadataJson"]): Record<string, unknown> {
  if (!metadata) return {};
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function senderNameFromTitle(title: string | null | undefined): string | null {
  const match = /^New message from\s+(.+)$/i.exec(String(title ?? "").trim());
  const name = match?.[1]?.trim();
  return name ? name : null;
}

/** Stable group key + display label for Alerts person clustering. */
export function personGroupForNotification(note: FieldNotification): {
  key: string;
  label: string;
  isPerson: boolean;
} {
  const meta = metadataRecord(note.metadataJson);
  const senderUserId = String(meta.senderUserId ?? "").trim();
  const senderName = String(meta.senderName ?? "").trim() || senderNameFromTitle(note.title) || "";
  const isMessaging =
    String(note.type ?? "").includes("messaging") ||
    Boolean(senderUserId) ||
    Boolean(senderNameFromTitle(note.title));

  if (isMessaging && senderUserId) {
    return {
      key: `user:${senderUserId}`,
      label: senderName || "Messages",
      isPerson: true,
    };
  }
  if (isMessaging && senderName) {
    return {
      key: `name:${senderName.toLowerCase()}`,
      label: senderName,
      isPerson: true,
    };
  }
  return {
    key: `solo:${note.id}`,
    label: String(note.title ?? "Notification").trim() || "Notification",
    isPerson: false,
  };
}

/**
 * Cluster Field Alerts so notifications from the same person sit together.
 * Groups are ordered by the newest item in each group (API list is newest-first).
 */
export function groupFieldNotificationsByPerson(
  notifications: FieldNotification[],
): FieldNotificationPersonGroup[] {
  const groups = new Map<string, FieldNotificationPersonGroup>();
  const order: string[] = [];

  for (const note of notifications) {
    const { key, label, isPerson } = personGroupForNotification(note);
    let group = groups.get(key);
    if (!group) {
      group = { key, label, isPerson, items: [] };
      groups.set(key, group);
      order.push(key);
    }
    group.items.push(note);
  }

  return order
    .map((key) => groups.get(key)!)
    .sort((a, b) => {
      const aTime = Date.parse(a.items[0]?.createdAt ?? "") || 0;
      const bTime = Date.parse(b.items[0]?.createdAt ?? "") || 0;
      return bTime - aTime;
    });
}

/** Card headline: under a person header, prefer body over redundant "New message from …". */
export function fieldNotificationCardTitle(
  note: FieldNotification,
  opts?: { underPersonHeader?: boolean },
): string {
  if (opts?.underPersonHeader) {
    const body = String(note.body ?? "").trim();
    if (body) return body;
    return "Message";
  }
  return String(note.title ?? "").trim() || "Notification";
}

/** Initials for Field Alerts messaging avatar (matches industrial messaging feel). */
export function initialsFromDisplayName(name: string | null | undefined): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase();
}

export type FieldNotificationClusterFlags = {
  showSender: boolean;
  isClusterStart: boolean;
  isClusterEnd: boolean;
};

/** Within a person group, mark consecutive items for chat-style bubble clustering. */
export function annotateFieldNotificationClusters(
  items: ReadonlyArray<FieldNotification>,
): Array<FieldNotification & FieldNotificationClusterFlags> {
  return items.map((note, index) => {
    const isClusterStart = index === 0;
    const isClusterEnd = index === items.length - 1;
    return {
      ...note,
      showSender: isClusterStart,
      isClusterStart,
      isClusterEnd,
    };
  });
}

const NOTIFICATIONS_API = "/api/v1/industrial/my-notifications";

function asItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { items?: unknown }).items)
  ) {
    return ((payload as { items: T[] }).items ?? []) as T[];
  }
  return [];
}

/** Map industrial notification hrefs onto Field routes. */
export function fieldHrefForNotification(href: string | null | undefined): string {
  const raw = String(href ?? "").trim();
  if (!raw) return "/alerts/";
  if (raw.startsWith("/") && !raw.startsWith("/modules/")) {
    // Already a Field path (or shared path like /training/)
    if (
      raw.startsWith("/tasks") ||
      raw.startsWith("/training") ||
      raw.startsWith("/corrective") ||
      raw.startsWith("/inspection") ||
      raw.startsWith("/calendar") ||
      raw.startsWith("/reminders") ||
      raw.startsWith("/more/") ||
      raw.startsWith("/forms") ||
      raw.startsWith("/jsa") ||
      raw.startsWith("/loto") ||
      raw.startsWith("/report") ||
      raw.startsWith("/equipment") ||
      raw.startsWith("/sanitation") ||
      raw.startsWith("/alerts") ||
      raw.startsWith("/messaging") ||
      raw.startsWith("/me") ||
      raw.startsWith("/my-forge") ||
      raw.startsWith("/scan")
    ) {
      return raw;
    }
  }
  return fieldHrefFromIndustrialPath(raw, {
    targetType: "",
    targetId: "",
    qrLinkId: "",
  });
}

export const fieldNotificationsApi = {
  list: async (limit = 30) => {
    const result = await apiGet<FieldNotification[] | { items?: FieldNotification[] }>(
      NOTIFICATIONS_API,
      { query: { limit: String(limit) } },
    );
    return asItems<FieldNotification>(result);
  },

  markRead: (id: string) =>
    apiSend<{ ok?: boolean }>(`${NOTIFICATIONS_API}/${encodeURIComponent(id)}/read`, "POST", {}),

  markAllRead: () => apiSend<{ ok?: boolean }>(`${NOTIFICATIONS_API}/read-all`, "POST", {}),
};
