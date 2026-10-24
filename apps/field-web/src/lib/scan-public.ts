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
};

const SCAN_SESSION_PREFIX = "forge.field.scan-employee:";
const RECENT_KEY = "forge.field.recent.v1";

/**
 * Pull the opaque public token from a Field / industrial `/scan/...` path.
 * CloudFront viewer-request rewrites serve `/scan/placeholder/index.html` while the
 * address bar keeps the real token — never trust a literal "placeholder" segment.
 */
function tokenFromScanPath(pathname: string | null | undefined): string {
  const path = String(pathname ?? "");
  const segments = path.split("/").filter(Boolean);
  const scanIdx = segments.findIndex((s) => s.toLowerCase() === "scan");
  if (scanIdx < 0) return "";
  const candidate = segments[segments.length - 1] ?? "";
  const decoded = decodeURIComponent(candidate).trim();
  if (!decoded || decoded === "placeholder" || decoded === "equipment") return "";
  return decoded;
}

export function resolveScanPublicToken(input: {
  pathname?: string | null | undefined;
  queryToken?: string | null | undefined;
  routeToken?: string | null | undefined;
}): string {
  const fromQuery = String(input.queryToken ?? "").trim();
  if (fromQuery) return fromQuery;

  // Prefer Next pathname when it still has the real token (client navigations).
  const fromPathname = tokenFromScanPath(input.pathname);
  if (fromPathname) return fromPathname;

  // Cold loads via CloudFront rewrite bake route params as "placeholder"; fall back
  // to the browser URL (same pattern as DVIR / useFieldPathname).
  if (typeof window !== "undefined") {
    const fromWindow = tokenFromScanPath(window.location.pathname);
    if (fromWindow) return fromWindow;
  }

  const fromRoute = String(input.routeToken ?? "").trim();
  if (fromRoute && fromRoute !== "placeholder") return fromRoute;

  return "";
}

/**
 * Accept industrial `/scan/{token}` URLs, Field deep links, `/q/{code}` short links,
 * or raw opaque tokens (including FGE- style codes).
 */
export function extractTokenFromQrText(text: string): string | null {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  try {
    const url = new URL(
      trimmed,
      typeof window !== "undefined" ? window.location.origin : undefined,
    );
    const scanMatch = url.pathname.match(/\/scan\/(?:equipment\/)?([^/]+)/i);
    if (scanMatch?.[1]) {
      const token = decodeURIComponent(scanMatch[1]).trim();
      if (token && token !== "placeholder" && token.length >= 8) return token;
    }
    const shortMatch = url.pathname.match(/\/q\/([^/]+)/i);
    if (shortMatch?.[1]) {
      const token = decodeURIComponent(shortMatch[1]).trim();
      if (token && token.length >= 6) return token;
    }
    const queryToken = url.searchParams.get("token") || url.searchParams.get("t");
    if (queryToken && queryToken.trim().length >= 8) return queryToken.trim();
  } catch {
    // not a URL
  }
  // Opaque tokens / FGE-style short codes
  if (/^FGE-[A-Z0-9-]{4,}$/i.test(trimmed)) return trimmed;
  if (trimmed.length >= 16 && trimmed.length <= 256) return trimmed;
  if (trimmed.length >= 8 && trimmed.length <= 64 && /^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function describeScanFailure(err: unknown): string {
  if (err && typeof err === "object" && "status" in err) {
    const status = Number((err as { status?: number }).status);
    const code = String((err as { code?: string }).code ?? "").toUpperCase();
    const message = err instanceof Error ? err.message : "";
    if (status === 404 || code.includes("NOT_FOUND")) {
      return "This QR code is not recognized, expired, or was removed.";
    }
    if (status === 403 || code.includes("FORBIDDEN")) {
      return "You do not have access to this Location or record.";
    }
    if (status === 401 || code.includes("UNAUTHORIZED")) {
      return "Sign in is required to open this QR code.";
    }
    if (code.includes("TENANT") || /tenant|company/i.test(message)) {
      return "This QR belongs to a different company. Switch company or scan a code for your Location.";
    }
    if (message.trim()) return message;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return "We couldn't read this QR code. Try again or enter the code manually.";
}

export function readStoredScanEmployee(token: string): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(`${SCAN_SESSION_PREFIX}${token}`)?.trim() || null;
}

export function writeStoredScanEmployee(token: string, employeeNumber: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(`${SCAN_SESSION_PREFIX}${token}`, employeeNumber.trim());
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
        viewer.permissions.has("industrial.access") ||
        viewer.permissions.has("field.access")
      );
    }
    return viewer.verifiedEmployee;
  });
}

export function isInlineScanAction(action: ScanAction): boolean {
  return (action.kind ?? "navigate") !== "navigate";
}

export type RecentScanItem = {
  token: string;
  label: string;
  targetType?: string | null;
  targetId?: string | null;
  at: string;
};

export function readRecentScans(limit = 8): RecentScanItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentScanItem[];
    return Array.isArray(parsed) ? parsed.slice(0, limit) : [];
  } catch {
    return [];
  }
}

export function pushRecentScan(item: Omit<RecentScanItem, "at">): void {
  if (typeof window === "undefined") return;
  const next: RecentScanItem = { ...item, at: new Date().toISOString() };
  const prior = readRecentScans(20).filter((r) => r.token !== item.token);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify([next, ...prior].slice(0, 12)));
}

export function clearRecentScans(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RECENT_KEY);
}

/** Prefer DVIR pre/post trip for fleet, then start_inspection when due. */
export function pickPrimaryScanAction(actions: ScanAction[]): ScanAction | null {
  const dvir =
    actions.find((a) => a.id === "dvir_pre_trip") ||
    actions.find((a) => a.id === "dvir_post_trip" || a.id.startsWith("dvir_"));
  if (dvir) return dvir;
  const inspection = actions.find((a) => a.kind === "start_inspection");
  if (inspection) return inspection;
  const loto = actions.find((a) => a.id === "open_loto" || /loto/i.test(a.href));
  if (loto) return loto;
  return actions[0] ?? null;
}
