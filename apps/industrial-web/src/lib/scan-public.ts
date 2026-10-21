export type ScanAssetSummary = {
  label: string;
  sublabel?: string | null;
  status?: string | null;
  locationName?: string | null;
  outOfService?: boolean;
  outOfServiceReason?: string | null;
};

export type ScanActionKind =
  | "navigate"
  | "report_issue"
  | "view_history"
  | "mark_out_of_service"
  | "return_to_service"
  | "start_inspection";

export type ScanAction = {
  id: string;
  label: string;
  description?: string;
  href: string;
  requiresVerification?: boolean;
  permission?: string;
  fieldWorkerAllowed?: boolean;
  kind?: ScanActionKind;
  frequency?: "DAILY" | "WEEKLY" | "MONTHLY";
  templateId?: string;
};

export type ScanPublicContext = {
  qrLinkId: string;
  name: string;
  displayCode?: string | null;
  description?: string | null;
  accessMode: string;
  targetType?: string | null;
  targetId?: string | null;
  requiresEmployeeNumber: boolean;
  requiresSignIn: boolean;
  publicLimited: boolean;
  tenantKey?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
  asset?: ScanAssetSummary | null;
  actions: ScanAction[];
};

export type ScanIdentifyResult = {
  personnelId: string;
  displayName: string;
  employeeNumber: string;
  departmentName?: string | null;
  siteName?: string | null;
  jobTitle?: string | null;
  actions: ScanAction[];
  trainingStatus?: Array<{
    assignmentId: string;
    title: string;
    status: "CURRENT" | "EXPIRED" | "NOT_COMPLETED" | "ASSIGNED" | "IN_PROGRESS";
    completedAt?: string | null;
    href: string;
  }>;
};

export type ScanHistoryEntry = {
  id: string;
  kind: string;
  at: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  actorName?: string | null;
};

export type ScanHistoryResult = {
  targetType: string;
  targetId: string;
  items: ScanHistoryEntry[];
};

export type ScanInspectionStartResult = {
  inspectionId: string;
  title: string;
  status: string;
  items: Array<Record<string, unknown>>;
};

export type ScanInspectionCompleteResult = {
  inspection: Record<string, unknown>;
  assetOutOfService: boolean;
  outOfServiceReason?: string | null;
};

const SCAN_SESSION_PREFIX = "forge-ind-scan-employee:";

export function resolveScanPublicToken(input: {
  pathname?: string | null | undefined;
  queryToken?: string | null | undefined;
  routeToken?: string | null | undefined;
}): string {
  const fromQuery = String(input.queryToken ?? "").trim();
  if (fromQuery) return fromQuery;

  const path = String(input.pathname ?? "");
  const pathMatch = path.match(/\/scan\/([^/]+)/i);
  const fromPathname = pathMatch?.[1] ? decodeURIComponent(pathMatch[1]).trim() : "";
  if (fromPathname && fromPathname !== "placeholder") return fromPathname;

  const fromRoute = String(input.routeToken ?? "").trim();
  if (fromRoute && fromRoute !== "placeholder") return fromRoute;

  return "";
}

export function extractTokenFromQrText(text: string): string | null {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, typeof window !== "undefined" ? window.location.origin : undefined);
    const match = url.pathname.match(/\/scan\/([^/]+)/i);
    if (match?.[1]) {
      const token = decodeURIComponent(match[1]).trim();
      if (token && token !== "placeholder") return token;
    }
  } catch {
    // not a URL
  }
  if (trimmed.length >= 16 && trimmed.length <= 256) return trimmed;
  return null;
}

export function readStoredScanEmployee(token: string): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(`${SCAN_SESSION_PREFIX}${token}`);
  return value?.trim() || null;
}

export function writeStoredScanEmployee(token: string, employeeNumber: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(`${SCAN_SESSION_PREFIX}${token}`, employeeNumber.trim());
}

export function clearStoredScanEmployee(token: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(`${SCAN_SESSION_PREFIX}${token}`);
}

export function filterClientScanActions(
  actions: ScanAction[],
  viewer: { verifiedEmployee: boolean; permissions: Set<string> },
): ScanAction[] {
  return actions.filter((action) => {
    if (!action.requiresVerification) return true;
    if (viewer.verifiedEmployee && action.fieldWorkerAllowed) return true;
    if (action.permission) {
      return (
        viewer.permissions.has(action.permission) ||
        viewer.permissions.has("industrial.admin") ||
        viewer.permissions.has("industrial.access")
      );
    }
    return viewer.verifiedEmployee;
  });
}

export function isInlineScanAction(action: ScanAction): boolean {
  const kind = action.kind ?? "navigate";
  return kind !== "navigate";
}

export function scanActionUsesSignedInModule(action: ScanAction, signedIn: boolean): boolean {
  if (!signedIn) return false;
  return action.kind === "start_inspection" && action.href.startsWith("/modules/");
}
