/**
 * Phase 9 Emergency helpers for Forge Safety - Field Version.
 * Read-focused procedures + active alerts. Procedure read-cache is Phase 10.
 */

export const EMERGENCY_MODULE_CODES = ["EMERGENCY_ALERTS", "EMERGENCY_RESPONSE"] as const;

export type EmergencyCategoryId =
  | "eap"
  | "scenarios"
  | "drills"
  | "responseTeams"
  | "contacts"
  | "evacuation"
  | "weather"
  | "fire"
  | "chemical";

export type EmergencyCategoryDef = {
  id: EmergencyCategoryId;
  label: string;
  detail: string;
  /** API path category under /emergency-response/:category */
  apiCategory: string;
};

/** Field procedure tabs — maps UX labels onto emergency-response categories. */
export const EMERGENCY_CATEGORIES: readonly EmergencyCategoryDef[] = [
  {
    id: "eap",
    label: "EAP / Plans",
    detail: "Emergency action plans",
    apiCategory: "eap",
  },
  {
    id: "evacuation",
    label: "Evacuation",
    detail: "Routes, muster points, and maps",
    apiCategory: "scenarios",
  },
  {
    id: "weather",
    label: "Severe weather",
    detail: "Shelter and weather response",
    apiCategory: "scenarios",
  },
  {
    id: "fire",
    label: "Fire",
    detail: "Fire response procedures",
    apiCategory: "scenarios",
  },
  {
    id: "chemical",
    label: "Chemical",
    detail: "Spill and chemical response",
    apiCategory: "scenarios",
  },
  {
    id: "contacts",
    label: "Contacts / Teams",
    detail: "Response teams and contacts",
    apiCategory: "responseTeams",
  },
  {
    id: "drills",
    label: "Drills",
    detail: "Drill plans and history",
    apiCategory: "drills",
  },
];

export type EmergencyRecord = {
  id: string;
  title?: string;
  name?: string;
  status?: string;
  category?: string;
  responseType?: string;
  siteId?: string | null;
  sourcePayload?: Record<string, unknown> | null;
  planId?: string | null;
  eventDate?: string | null;
};

export type FieldEmergencyAcknowledgment = {
  id: string;
  status?: string;
  method?: string;
  acknowledgedAt?: string | null;
  responseText?: string | null;
};

export type FieldEmergencyAlert = {
  id: string;
  alertNumber?: string;
  alertType?: string;
  severity?: string;
  headline?: string;
  shortMessage?: string;
  detailedMessage?: string | null;
  instructions?: string | null;
  status?: string;
  isDrill?: boolean;
  requiresAcknowledgment?: boolean;
  issuedAt?: string | null;
  audience?: unknown;
  myAcknowledgment?: FieldEmergencyAcknowledgment | null;
};

export function alertNeedsAcknowledgment(alert: FieldEmergencyAlert): boolean {
  return Boolean(alert.requiresAcknowledgment) && !alert.myAcknowledgment?.acknowledgedAt;
}

export function formatAcknowledgmentTime(
  ack: FieldEmergencyAcknowledgment | null | undefined,
): string | null {
  if (!ack?.acknowledgedAt) return null;
  const d = new Date(ack.acknowledgedAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

export type EmergencyAlertSettings = {
  settings?: Record<string, unknown> | null;
  inAppEnabled?: boolean;
  smsEnabled?: boolean;
};

export function isEmergencyFeatureEnabled(
  activeModules: readonly string[] | null | undefined,
  opts?: { isPlatformAdmin?: boolean },
): boolean {
  if (opts?.isPlatformAdmin) return true;
  const enabled = activeModules ?? [];
  if (enabled.length === 0) return true;
  return EMERGENCY_MODULE_CODES.some((code) => enabled.includes(code));
}

export function parseEmergencyCategory(raw: string | null | undefined): EmergencyCategoryId {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  const match = EMERGENCY_CATEGORIES.find((c) => c.id === value || c.apiCategory === value);
  return match?.id ?? "eap";
}

export function emergencyRecordTitle(row: EmergencyRecord): string {
  return String(row.title || row.name || "Emergency procedure").trim();
}

export function emergencyRecordSiteId(row: EmergencyRecord): string | null {
  const payload = row.sourcePayload ?? {};
  const site = String(row.siteId ?? payload.siteId ?? payload.locationId ?? "").trim();
  return site || null;
}

export function filterEmergencyByLocation(
  items: readonly EmergencyRecord[],
  locationId: string,
): EmergencyRecord[] {
  if (!locationId) return [...items];
  return items.filter((row) => {
    const siteId = emergencyRecordSiteId(row);
    return !siteId || siteId === locationId;
  });
}

/** Soft keyword filter when multiple UX tabs share the same API category. */
export function filterEmergencyByTab(
  items: readonly EmergencyRecord[],
  tab: EmergencyCategoryId,
): EmergencyRecord[] {
  if (tab === "eap" || tab === "drills" || tab === "contacts") {
    return [...items];
  }
  const keywords: Record<string, string[]> = {
    evacuation: ["evacuat", "muster", "egress", "assembly", "map"],
    weather: ["weather", "tornado", "storm", "shelter", "lightning"],
    fire: ["fire", "flammable", "hot work", "extinguish"],
    chemical: ["chemical", "spill", "hazmat", "sds", "release"],
  };
  const keys = keywords[tab];
  if (!keys) return [...items];
  const matched = items.filter((row) => {
    const blob =
      `${emergencyRecordTitle(row)} ${JSON.stringify(row.sourcePayload ?? {})}`.toLowerCase();
    return keys.some((k) => blob.includes(k));
  });
  return matched.length > 0 ? matched : [...items];
}

export function isActiveEmergencyAlert(alert: FieldEmergencyAlert): boolean {
  const status = String(alert.status ?? "").toUpperCase();
  return status === "ACTIVE" || status === "UPDATING";
}

export function alertAppliesToLocation(alert: FieldEmergencyAlert, locationId: string): boolean {
  if (!locationId) return true;
  const audience = alert.audience;
  if (!audience || typeof audience !== "object") return true;
  const scope = String((audience as { scope?: string }).scope ?? "TENANT").toUpperCase();
  if (scope !== "TARGETED") return true;
  const locationIds = (audience as { locationIds?: unknown }).locationIds;
  if (!Array.isArray(locationIds) || locationIds.length === 0) return true;
  return locationIds.map(String).includes(locationId);
}

export function plantEmergencyNumber(settings: EmergencyAlertSettings | null | undefined): string {
  const bag = settings?.settings && typeof settings.settings === "object" ? settings.settings : {};
  const candidates = [
    bag.plantEmergencyNumber,
    bag.emergencyPhone,
    bag.emergencyNumber,
    bag.plantPhone,
    bag.phone,
    bag.contactPhone,
  ];
  for (const value of candidates) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

export function criticalFieldsFromRecord(
  row: EmergencyRecord,
): Array<{ label: string; value: string }> {
  const payload = row.sourcePayload ?? {};
  const rowBag = row as EmergencyRecord & Record<string, unknown>;
  const fields: Array<{ label: string; value: string }> = [];
  const push = (label: string, key: string) => {
    const value = String(payload[key] ?? rowBag[key] ?? "").trim();
    if (value) fields.push({ label, value });
  };
  push("Status", "status");
  push("Plan ID", "planId");
  push("Event date", "eventDate");
  push("Muster point", "musterPoint");
  push("Assembly area", "assemblyArea");
  push("Contact", "contactName");
  push("Phone", "phone");
  push("Location", "locationName");
  push("Division", "divisionName");
  push("Instructions", "instructions");
  push("Summary", "summary");
  push("Description", "description");
  return fields.slice(0, 10);
}

export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "";
}
