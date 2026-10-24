export type EmergencyAlert = {
  id: string;
  alertNumber: string;
  alertType: string;
  severity: string;
  headline: string;
  shortMessage: string;
  detailedMessage?: string | null;
  instructions?: string | null;
  status: string;
  isDrill: boolean;
  requiresAcknowledgment: boolean;
  audience?: unknown;
  channels?: unknown;
  issuedAt?: string | null;
  clearedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  recipientCount?: number;
  smsNote?: string;
  sms?: EmergencyAlertSmsResult;
};

export type EmergencyAlertDashboard = {
  activeAlerts: number;
  alertsSentToday: number;
  smsDeliveryRate: number | null;
  mvixDisplaysOnline: number | null;
  recipientsReached: number | null;
  acknowledgmentsPending: number;
  recent: EmergencyAlert[];
  smsProviderReady: boolean;
  smsProvider?: string;
  smsEnabled?: boolean;
  note?: string;
};

export type EmergencyAlertSmsResult = {
  attempted: number;
  accepted: number;
  failed: number;
  provider: string;
  ready: boolean;
  dryRun: boolean;
  note?: string;
};

export type EmergencyAlertTemplate = {
  id: string;
  name: string;
  alertType: string;
  severity: string;
  headline: string;
  shortMessage: string;
  detailedMessage?: string | null;
  instructions?: string | null;
  channels?: unknown;
  requiresAcknowledgment?: boolean;
  enabled: boolean;
};

export type AlertAudience = {
  scope: "TENANT" | "TARGETED";
  locationIds: string[];
  departmentIds: string[];
  groupIds: string[];
  personnelIds?: string[];
};

export type AudiencePreview = {
  audience: AlertAudience;
  employees: number;
  contractors: number;
  totalPersonnel: number;
  uniqueSmsNumbers: number;
  smsEligible: number;
  forgeUsers: number;
  excluded: number;
  exclusions: { reason: string; count: number }[];
  mvixLocations: number;
  sample: Array<{
    personnelId: string;
    displayName: string;
    smsEligible: boolean;
    exclusionReason: string | null;
  }>;
};

export type AlertTargetLookups = {
  sites: Array<{ id: string; name: string; status: string }>;
  departments: Array<{ id: string; name: string; siteId: string | null; status: string }>;
  groups: Array<{
    id: string;
    name: string;
    groupType: string;
    dynamic: boolean;
    enabled: boolean;
  }>;
};

export type EmergencyAlertGroup = {
  id: string;
  name: string;
  description?: string | null;
  groupType: string;
  dynamic: boolean;
  locationId?: string | null;
  departmentId?: string | null;
  enabled: boolean;
  memberCount: number;
};

export type EmergencyAlertGroupMember = {
  personnelId: string;
  displayName: string;
  employeeNumber?: string | null;
  phone?: string | null;
  status?: string | null;
};

export type EmergencyAlertGroupDetail = EmergencyAlertGroup & {
  members: EmergencyAlertGroupMember[];
};

export const EMERGENCY_ALERT_TYPES = [
  "GENERAL",
  "FIRE",
  "WEATHER",
  "SHELTER_IN_PLACE",
  "EVACUATION",
  "MEDICAL",
  "SECURITY",
  "HAZMAT",
  "ALL_CLEAR",
] as const;

export const EMERGENCY_ALERT_SEVERITIES = ["EXTREME", "SEVERE", "MODERATE", "MINOR"] as const;

export const EMERGENCY_ALERT_CHANNELS = [
  { id: "SMS", label: "SMS" },
  { id: "IN_APP", label: "Forge in-app" },
  { id: "MVIX", label: "Mvix digital signage" },
] as const;

export function formatAlertStatus(status: string): string {
  return status.replace(/_/g, " ");
}

/** Matches platform-api `buildSmsMessageBody` — what carriers actually receive. */
export function buildEmergencyAlertSmsBody(input: {
  shortMessage: string;
  isDrill?: boolean;
}): string {
  const short = String(input.shortMessage ?? "").trim();
  const prefix = input.isDrill ? "[DRILL] " : "";
  return `${prefix}${short}`.trim().slice(0, 1600);
}

export function estimateSmsSegments(body: string): {
  length: number;
  segments: number;
  perSegment: number;
} {
  const length = [...body].length;
  const unicode = /[^\u0000-\u007F]/.test(body);
  const perSegment = unicode ? 70 : 160;
  const segments = length === 0 ? 0 : Math.ceil(length / perSegment);
  return { length, segments, perSegment };
}
