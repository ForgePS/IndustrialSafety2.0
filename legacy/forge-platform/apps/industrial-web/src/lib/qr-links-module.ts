export type QrLinkRow = {
  id: string;
  name: string;
  label?: string | null;
  displayCode?: string | null;
  description?: string | null;
  status: string;
  qrType?: string;
  accessMode?: string;
  targetType?: string | null;
  targetId?: string | null;
  siteId?: string | null;
  departmentId?: string | null;
  replacementQrId?: string | null;
  scanCount?: number;
  lastScannedAt?: string | null;
  activatedAt?: string | null;
  deactivatedAt?: string | null;
  tokenIssuedAt?: string | null;
  publicTokenHint?: string | null;
  publicToken?: string;
  token?: string;
  url?: string;
  actionConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type QrLinkListResponse = {
  items: QrLinkRow[];
  page: number;
  pageSize: number;
  total?: number;
};

export type QrAnalyticsSummary = {
  activeQrCodes: number;
  totalQrCodes: number;
  scansToday: number;
  scansInRange: number;
  inspectionsStarted: number;
  inspectionsCompleted: number;
  issuesReported: number;
  correctiveActionsCreated: number;
  trainingOpened: number;
  outOfServiceEvents: number;
  rangeDays: number;
};

export type QrTargetOption = { id: string; label: string };

export type QrActionFlagKey =
  | "reportIssue"
  | "dailyInspection"
  | "weeklyInspection"
  | "monthlyInspection"
  | "equipmentHistory"
  | "markOutOfService"
  | "returnToService"
  | "viewLoto"
  | "viewJsa"
  | "viewDocuments"
  | "viewTraining"
  | "viewSds";

export const QR_ACTION_FLAG_OPTIONS: Array<{ key: QrActionFlagKey; label: string }> = [
  { key: "reportIssue", label: "Report issue" },
  { key: "dailyInspection", label: "Daily inspection" },
  { key: "weeklyInspection", label: "Weekly inspection" },
  { key: "monthlyInspection", label: "Monthly inspection" },
  { key: "equipmentHistory", label: "Equipment history" },
  { key: "markOutOfService", label: "Mark out of service" },
  { key: "returnToService", label: "Return to service" },
  { key: "viewLoto", label: "LOTO procedure" },
  { key: "viewJsa", label: "JSA / JHA" },
  { key: "viewDocuments", label: "Documents" },
  { key: "viewTraining", label: "Training" },
  { key: "viewSds", label: "SDS / chemical" },
];

export function defaultQrActionFlags(): Record<QrActionFlagKey, boolean> {
  return {
    reportIssue: true,
    dailyInspection: true,
    weeklyInspection: true,
    monthlyInspection: true,
    equipmentHistory: true,
    markOutOfService: true,
    returnToService: true,
    viewLoto: true,
    viewJsa: true,
    viewDocuments: true,
    viewTraining: true,
    viewSds: true,
  };
}

export function flagsFromActionConfig(
  config: Record<string, unknown> | null | undefined,
): Record<QrActionFlagKey, boolean> {
  const defaults = defaultQrActionFlags();
  if (!config) return defaults;
  const next = { ...defaults };
  for (const opt of QR_ACTION_FLAG_OPTIONS) {
    const value = config[opt.key];
    if (typeof value === "boolean") next[opt.key] = value;
  }
  return next;
}

export const QR_LINK_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "REPLACED",
  "LOST",
  "DAMAGED",
  "ARCHIVED",
] as const;

export const QR_ACCESS_MODES = [
  { value: "AUTHENTICATED_ONLY", label: "Authenticated EMPLOYEES" },
  { value: "AUTHENTICATED_RECORD", label: "Authenticated + linked record" },
  { value: "EMPLOYEE_NUMBER", label: "EMPLOYEE number at scan" },
  { value: "PUBLIC_READ", label: "Public read (limited)" },
  { value: "PUBLIC_ACTION", label: "Public action (limited)" },
] as const;

export type QrTargetPicker =
  "equipment" | "vehicle" | "site" | "loto" | "jsa" | "document" | "training" | "chemical" | "none";

export const QR_TARGET_TYPES = [
  { value: "EQUIPMENT", label: "Equipment / asset", picker: "equipment" as const },
  { value: "VEHICLE", label: "Fleet vehicle", picker: "vehicle" as const },
  { value: "LOCATION", label: "Site / location", picker: "site" as const },
  { value: "SAFETY_SUPPLY", label: "Safety supply item", picker: "none" as const },
  { value: "SUPPLY_LOCATION", label: "Supply storage location", picker: "none" as const },
  {
    value: "SUPPLY_REQUEST_STATION",
    label: "Safety supply request station",
    picker: "none" as const,
  },
  { value: "SUPPLY_KIT", label: "Safety supply kit", picker: "none" as const },
  { value: "SUPPLY_SERIAL", label: "Serialized safety equipment", picker: "none" as const },
  { value: "INSPECTION_POINT", label: "Inspection point", picker: "equipment" as const },
  { value: "LOTO_PROCEDURE", label: "LOTO procedure", picker: "loto" as const },
  { value: "JSA", label: "JSA", picker: "jsa" as const },
  { value: "INSPECTION", label: "Inspection", picker: "none" as const },
  { value: "FORM", label: "Form", picker: "none" as const },
  { value: "TRAINING", label: "Training", picker: "training" as const },
  { value: "DOCUMENT", label: "Document", picker: "document" as const },
  { value: "TOOL", label: "Tool", picker: "equipment" as const },
  { value: "MACHINE", label: "Machine", picker: "equipment" as const },
] as const;

export function canViewQrLinks(permissions: Set<string>): boolean {
  return (
    permissions.has("industrial.qr.view") ||
    permissions.has("industrial.qr_links.view") ||
    permissions.has("industrial.scan.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access")
  );
}

export function canManageQrLinks(permissions: Set<string>): boolean {
  return (
    permissions.has("industrial.qr.manage") ||
    permissions.has("industrial.qr.generate") ||
    permissions.has("industrial.qr.replace") ||
    permissions.has("industrial.qr.deactivate") ||
    permissions.has("industrial.qr_links.manage") ||
    permissions.has("industrial.scan.manage") ||
    permissions.has("industrial.admin")
  );
}

export function canGenerateQr(permissions: Set<string>): boolean {
  return (
    permissions.has("industrial.qr.generate") ||
    permissions.has("industrial.qr.manage") ||
    permissions.has("industrial.qr_links.manage") ||
    permissions.has("industrial.scan.manage") ||
    permissions.has("industrial.admin")
  );
}

export function canPrintQr(permissions: Set<string>): boolean {
  return (
    permissions.has("industrial.qr.print") ||
    permissions.has("industrial.qr.manage") ||
    permissions.has("industrial.qr_links.manage") ||
    permissions.has("industrial.admin") ||
    canGenerateQr(permissions)
  );
}

export function canReplaceQr(permissions: Set<string>): boolean {
  return (
    permissions.has("industrial.qr.replace") ||
    permissions.has("industrial.qr.manage") ||
    permissions.has("industrial.qr_links.manage") ||
    permissions.has("industrial.admin")
  );
}

export function canDeactivateQr(permissions: Set<string>): boolean {
  return (
    permissions.has("industrial.qr.deactivate") ||
    permissions.has("industrial.qr.manage") ||
    permissions.has("industrial.qr_links.manage") ||
    permissions.has("industrial.admin")
  );
}

export function canAuditQrLinks(permissions: Set<string>): boolean {
  return (
    permissions.has("industrial.qr.audit.view") ||
    permissions.has("industrial.qr.view") ||
    permissions.has("industrial.qr_links.view") ||
    permissions.has("industrial.admin")
  );
}

export function canViewQrAnalytics(permissions: Set<string>): boolean {
  return (
    permissions.has("industrial.qr.analytics.view") ||
    permissions.has("industrial.qr.view") ||
    permissions.has("industrial.qr_links.view") ||
    permissions.has("industrial.admin")
  );
}

export function qrStatusBadgeClass(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-label-success";
    case "INACTIVE":
      return "bg-label-secondary";
    case "REPLACED":
      return "bg-label-warning";
    case "LOST":
    case "DAMAGED":
      return "bg-label-danger";
    case "ARCHIVED":
      return "bg-label-dark";
    default:
      return "bg-label-secondary";
  }
}

export function targetTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const hit = QR_TARGET_TYPES.find((t) => t.value === value);
  return hit?.label ?? value;
}

export function formatQrTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export function pickerListPath(picker: QrTargetPicker): string | null {
  switch (picker) {
    case "equipment":
      return "/api/v1/industrial/equipment";
    case "vehicle":
      return "/api/v1/industrial/fleet/vehicles";
    case "site":
      return "/api/v1/industrial/sites";
    case "loto":
      return "/api/v1/industrial/loto";
    case "jsa":
      return "/api/v1/industrial/jsas";
    case "document":
      return "/api/v1/industrial/documents";
    case "training":
      return "/api/v1/industrial/training/assignments";
    case "chemical":
      return "/api/v1/industrial/chemical-safety";
    default:
      return null;
  }
}
