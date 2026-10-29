/**
 * Thin Forge Print Service client helpers (printer bridges, printers, jobs).
 */
import { apiFetchRaw, apiGet, apiSend, createIdempotencyKey, ApiError } from "@forge/web-kit";

const BASE = "/api/v1/industrial";

export type PrinterBridge = {
  id: string;
  name: string;
  deviceId: string | null;
  computerName: string | null;
  locationId: string | null;
  divisionId: string | null;
  osVersion: string | null;
  bridgeVersion: string | null;
  status: string;
  lastSeenAt: string | null;
  registeredAt: string | null;
  remoteIp: string | null;
  autoUpdateEnabled: boolean;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ForgePrinter = {
  id: string;
  bridgeId: string | null;
  name: string;
  displayName: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  connectionType: string | null;
  transportType: string | null;
  windowsQueueName: string | null;
  deviceIdentifier: string | null;
  bluetoothDeviceId?: string | null;
  bluetoothSavedId?: string | null;
  dpi: number;
  maxPrintWidthInches: number | null;
  supportsBitmap: boolean;
  supportsCut: boolean;
  supportsFeed: boolean;
  supportsMultipleCopies: boolean;
  capabilities?: {
    print: boolean;
    bitmapPrint: boolean;
    multipleCopies: boolean;
    cut: boolean;
    feed: boolean;
    status: boolean;
    mediaDetection: boolean;
    ribbonDetection: boolean;
    batteryStatus: boolean;
    dpi: number[];
    maxPrintWidthInches?: number;
  };
  locationId: string | null;
  divisionId: string | null;
  online: boolean;
  connected: boolean;
  ready: boolean;
  isDefault: boolean;
  enabled: boolean;
  lastSeenAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  ribbonOk?: boolean | null;
  mediaOk?: boolean | null;
  batteryPercent?: number | null;
  supplyName?: string | null;
  lastHealthAt?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PrinterMediaProfile = {
  id: string;
  manufacturer: string | null;
  printerModel: string | null;
  partNumber: string | null;
  name: string;
  widthInches: number;
  heightInches: number;
  continuous: boolean;
  dieCut: boolean;
  printableWidth: number | null;
  printableHeight: number | null;
  orientation: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PrinterProfile = {
  id: string | null;
  printerId: string;
  dpi: number | null;
  defaultMediaId: string | null;
  defaultOrientation: string | null;
  defaultCopies: number;
  defaultCutMode: string | null;
  darkness: number | null;
  speed: number | null;
  xOffset: number | null;
  yOffset: number | null;
  preferredTransport: string | null;
  fallbackPrinterId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PrinterHealth = {
  printer: ForgePrinter;
  bridge: PrinterBridge | null;
  ribbonOk: boolean | null;
  mediaOk: boolean | null;
  batteryPercent: number | null;
  supplyName: string | null;
  lastHealthAt: string | null;
  capabilities?: ForgePrinter["capabilities"];
  online: boolean;
  connected: boolean;
  ready: boolean;
};

export type PrinterDiagnostics = PrinterHealth & {
  diagnostics: {
    ranAt: string;
    bridgeReachable: boolean | null;
    printerReady: boolean;
    supplyOk: boolean;
  };
};

export type PrintBatchItemInput = {
  module?: string;
  recordType?: string;
  recordId?: string;
  fieldValues?: Record<string, string>;
  title?: string;
};

export type PrintBatch = {
  id: string;
  printerId: string | null;
  name: string | null;
  stopOnFail: boolean;
  printMode: string | null;
  mediaProfileId: string | null;
  copiesPerItem: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  status: string;
  requestedBy: string | null;
  createdAt: string | null;
  completedAt: string | null;
};

export type PrintBatchDetail = PrintBatch & {
  jobs?: PrintJob[];
};

export type RegisterDirectBluetoothPrinterBody = {
  name: string;
  bluetoothSavedId: string;
  bluetoothDeviceId?: string;
  displayName?: string;
  model?: string;
  locationId?: string;
  divisionId?: string;
};

export type UpsertPrinterProfileBody = {
  dpi?: number;
  defaultMediaId?: string | null;
  defaultCopies?: number;
  preferredTransport?: string;
  fallbackPrinterId?: string | null;
};

export type CreateMediaProfileBody = {
  manufacturer?: string;
  printerModel?: string;
  partNumber?: string;
  name: string;
  widthInches: number;
  heightInches: number;
  continuous?: boolean;
  dieCut?: boolean;
  printableWidth?: number;
  printableHeight?: number;
  orientation?: string;
};

export type ReportPrintJobStatusBody = {
  status: string;
  errorCode?: string;
  errorMessage?: string;
  message?: string;
  metadata?: Record<string, unknown>;
};

export type PrintJob = {
  id: string;
  printerId: string | null;
  bridgeId: string | null;
  batchId: string | null;
  templateId: string | null;
  templateVersion: number | null;
  module: string | null;
  recordType: string | null;
  recordId: string | null;
  requestedBy: string | null;
  requestedFromDevice: string | null;
  copies: number;
  widthInches: number | null;
  heightInches: number | null;
  dpi: number | null;
  orientation: string | null;
  cutMode: string | null;
  artifactType: string | null;
  artifactSha256: string | null;
  status: string;
  priority: number;
  createdAt: string | null;
  queuedAt: string | null;
  deliveredAt: string | null;
  receivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  expiresAt: string | null;
  retryCount: number;
  parentJobId: string | null;
  reprintReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type PrintJobDetail = PrintJob & {
  artifactUrl?: string | null;
  events?: Array<{
    id: string;
    event: string;
    status: string | null;
    message: string | null;
    source: string | null;
    metadata?: Record<string, unknown>;
    createdAt: string | null;
  }>;
};

export type BridgePairingResult = {
  pairingCode: string;
  expiresAt: string;
  bridgeId: string;
  name: string;
  locationId: string | null;
  divisionId: string | null;
};

export type PrintJobListResult = {
  items: PrintJob[];
  page: number;
  pageSize: number;
  total: number;
};

export type PrintLabelLayout = {
  qrScale?: number;
  textScale?: number;
};

export type CreatePrintJobBody = {
  printerId?: string;
  printerGroupId?: string;
  templateId?: string;
  templateVersion?: number;
  module?: string;
  recordType?: string;
  recordId?: string;
  locationId?: string;
  divisionId?: string;
  copies?: number;
  widthInches?: number;
  heightInches?: number;
  dpi?: number;
  orientation?: string;
  cutMode?: string;
  fieldValues?: Record<string, string>;
  layout?: PrintLabelLayout;
  requestedFromDevice?: string;
  priority?: number;
  printMode?: "BRIDGE" | "DIRECT_BLUETOOTH";
  acceptFailover?: boolean;
  mediaProfileId?: string;
};

export type PreviewPrintJobBody = {
  widthInches?: number;
  heightInches?: number;
  dpi?: number;
  orientation?: string;
  fieldValues?: Record<string, string>;
  module?: string;
  layout?: PrintLabelLayout;
  mediaProfileId?: string;
};

export type PreviewPrintJobResult = {
  contentType: "image/png" | "application/pdf";
  base64: string;
  previewDataUrl: string;
  sha256: string;
  widthInches: number;
  heightInches: number;
  dpi: number;
};

export type CreatePrintBatchBody = {
  printerId?: string;
  printerGroupId?: string;
  locationId?: string;
  divisionId?: string;
  items: PrintBatchItemInput[];
  copiesPerItem?: number;
  mediaProfileId?: string;
  widthInches?: number;
  heightInches?: number;
  dpi?: number;
  orientation?: string;
  cutMode?: string;
  layout?: PrintLabelLayout;
  stopOnFail?: boolean;
  printMode?: "BRIDGE" | "DIRECT_BLUETOOTH";
  acceptFailover?: boolean;
  name?: string;
};

export const PRINT_TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "SENT_TO_PRINTER",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);

export const PRINT_QUEUE_TABS = {
  printing: ["PRINTING", "SPOOLING", "TRANSMITTING", "DELIVERING", "RECEIVED", "VALIDATING"],
  waiting: ["CREATED", "RENDERING", "QUEUED", "BRIDGE_ASSIGNED", "WAITING_FOR_PRINTER"],
  completed: ["COMPLETED", "SENT_TO_PRINTER"],
  failed: ["FAILED", "CANCELLED", "EXPIRED", "PRINT_RESULT_UNKNOWN"],
} as const;

export type PrintQueueTab = keyof typeof PRINT_QUEUE_TABS;

export function isPrintJobTerminal(status: string | null | undefined): boolean {
  return PRINT_TERMINAL_STATUSES.has(String(status ?? "").toUpperCase());
}

export function printerDisplayName(printer: Pick<ForgePrinter, "displayName" | "name">): string {
  return (printer.displayName || printer.name || "Printer").trim();
}

export function isBluetoothPrinter(
  printer: Pick<ForgePrinter, "connectionType" | "transportType"> | null | undefined,
): boolean {
  if (!printer) return false;
  const connection = String(printer.connectionType ?? "").toUpperCase();
  const transport = String(printer.transportType ?? "").toUpperCase();
  return (
    transport === "BRADY_WEB_BLUETOOTH" ||
    connection === "BLUETOOTH_BLE" ||
    connection === "BLUETOOTH"
  );
}

/** Direct browser Web Bluetooth path (no Windows bridge agent). */
export function isDirectBluetoothPrinter(
  printer: Pick<ForgePrinter, "bridgeId" | "connectionType" | "transportType"> | null | undefined,
): boolean {
  if (!printer) return false;
  const transport = String(printer.transportType ?? "").toUpperCase();
  if (transport === "BRADY_WEB_BLUETOOTH" && !printer.bridgeId) return true;
  return !printer.bridgeId && isBluetoothPrinter(printer);
}

export function connectionBadgeLabel(connectionType: string | null | undefined): string {
  const c = String(connectionType ?? "").toUpperCase();
  if (c === "BLUETOOTH_BLE" || c === "BLUETOOTH") return "Bluetooth";
  if (c === "USB") return "USB";
  if (c === "ETHERNET") return "Ethernet";
  if (c === "WIFI" || c === "WI-FI") return "Wi-Fi";
  return c || "—";
}

export function bridgeStatusLabel(status: string | null | undefined, enabled = true): string {
  if (!enabled || String(status ?? "").toUpperCase() === "DISABLED") return "Disabled";
  const s = String(status ?? "").toUpperCase();
  if (s === "ONLINE") return "Online";
  if (s === "OFFLINE") return "Offline";
  if (s === "PAIRING") return "Pairing";
  return s || "Unknown";
}

function asItemArray<T>(data: { items?: T[] | null } | T[] | null | undefined): T[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

export async function listPrinterBridges(): Promise<PrinterBridge[]> {
  const data = await apiGet<{ items?: PrinterBridge[] }>(`${BASE}/printer-bridges`);
  return asItemArray(data);
}

export async function getPrinterBridge(id: string): Promise<PrinterBridge> {
  return apiGet<PrinterBridge>(`${BASE}/printer-bridges/${encodeURIComponent(id)}`);
}

export async function createPrinterBridgePairing(body: {
  name?: string;
  locationId?: string;
  divisionId?: string;
}): Promise<BridgePairingResult> {
  return apiSend<BridgePairingResult>(`${BASE}/printer-bridges/pair`, "POST", body, {
    idempotencyKey: createIdempotencyKey("bridge-pair"),
  });
}

export async function updatePrinterBridge(
  id: string,
  body: {
    name?: string;
    locationId?: string | null;
    divisionId?: string | null;
    enabled?: boolean;
    autoUpdateEnabled?: boolean;
    status?: "ONLINE" | "OFFLINE" | "PAIRING" | "DISABLED";
  },
): Promise<PrinterBridge> {
  return apiSend<PrinterBridge>(`${BASE}/printer-bridges/${encodeURIComponent(id)}`, "PATCH", body);
}

export async function deletePrinterBridge(id: string): Promise<unknown> {
  return apiSend(`${BASE}/printer-bridges/${encodeURIComponent(id)}`, "DELETE");
}

export async function listPrinters(query?: {
  bridgeId?: string;
  enabled?: string;
}): Promise<ForgePrinter[]> {
  const data = await apiGet<{ items?: ForgePrinter[] }>(
    `${BASE}/printers`,
    query ? { query } : undefined,
  );
  return asItemArray(data);
}

export async function getPrinter(id: string): Promise<ForgePrinter> {
  return apiGet<ForgePrinter>(`${BASE}/printers/${encodeURIComponent(id)}`);
}

export async function updatePrinter(
  id: string,
  body: {
    displayName?: string | null;
    enabled?: boolean;
    isDefault?: boolean;
    locationId?: string | null;
    divisionId?: string | null;
    dpi?: number;
    transportType?: string;
  },
): Promise<ForgePrinter> {
  return apiSend<ForgePrinter>(`${BASE}/printers/${encodeURIComponent(id)}`, "PATCH", body);
}

export async function testPrinter(id: string): Promise<PrintJob> {
  return apiSend<PrintJob>(
    `${BASE}/printers/${encodeURIComponent(id)}/test`,
    "POST",
    {},
    {
      idempotencyKey: createIdempotencyKey("printer-test"),
    },
  );
}

export async function reconnectPrinter(id: string): Promise<ForgePrinter & { message?: string }> {
  return apiSend<ForgePrinter & { message?: string }>(
    `${BASE}/printers/${encodeURIComponent(id)}/reconnect`,
    "POST",
    {},
    { idempotencyKey: createIdempotencyKey("printer-reconnect") },
  );
}

export async function forgetBluetoothPrinter(id: string): Promise<ForgePrinter> {
  return apiSend<ForgePrinter>(
    `${BASE}/printers/${encodeURIComponent(id)}/forget`,
    "POST",
    {},
    {
      idempotencyKey: createIdempotencyKey("printer-forget"),
    },
  );
}

export async function createPrintJob(body: CreatePrintJobBody): Promise<PrintJob> {
  return apiSend<PrintJob>(`${BASE}/print-jobs`, "POST", body, {
    idempotencyKey: createIdempotencyKey("print-job"),
  });
}

export async function previewPrintJob(body: PreviewPrintJobBody): Promise<PreviewPrintJobResult> {
  return apiSend<PreviewPrintJobResult>(`${BASE}/print-jobs/preview`, "POST", body);
}

export async function registerDirectBluetoothPrinter(
  body: RegisterDirectBluetoothPrinterBody,
): Promise<ForgePrinter> {
  return apiSend<ForgePrinter>(`${BASE}/printers/direct-bluetooth`, "POST", body, {
    idempotencyKey: createIdempotencyKey("printer-direct-bt"),
  });
}

export async function createPrintBatch(body: CreatePrintBatchBody): Promise<PrintBatchDetail> {
  return apiSend<PrintBatchDetail>(`${BASE}/print-batches`, "POST", body, {
    idempotencyKey: createIdempotencyKey("print-batch"),
  });
}

export async function listPrintBatches(): Promise<PrintBatch[]> {
  const data = await apiGet<{ items?: PrintBatch[] }>(`${BASE}/print-batches`);
  return data.items ?? [];
}

export async function getPrintBatch(id: string): Promise<PrintBatchDetail> {
  return apiGet<PrintBatchDetail>(`${BASE}/print-batches/${encodeURIComponent(id)}`);
}

const BATCH_TERMINAL = new Set(["COMPLETED", "FAILED", "PARTIAL", "CANCELLED"]);

/** Poll a print batch until it reaches a terminal status or the abort signal fires. */
export async function pollPrintBatchUntilTerminal(
  batchId: string,
  options?: { intervalMs?: number; signal?: AbortSignal; maxAttempts?: number },
): Promise<PrintBatchDetail> {
  const intervalMs = options?.intervalMs ?? 2000;
  const maxAttempts = options?.maxAttempts ?? 120;
  let last: PrintBatchDetail | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    last = await getPrintBatch(batchId);
    if (BATCH_TERMINAL.has(String(last.status ?? "").toUpperCase())) return last;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs);
      options?.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
  }
  if (!last) throw new ApiError("Batch poll timed out with no response.", 408);
  return last;
}

export async function listMediaProfiles(): Promise<PrinterMediaProfile[]> {
  const data = await apiGet<{ items?: PrinterMediaProfile[] }>(`${BASE}/printer-media-profiles`);
  return asItemArray(data);
}

export async function createMediaProfile(
  body: CreateMediaProfileBody,
): Promise<PrinterMediaProfile> {
  return apiSend<PrinterMediaProfile>(`${BASE}/printer-media-profiles`, "POST", body, {
    idempotencyKey: createIdempotencyKey("media-profile"),
  });
}

export async function patchMediaProfile(
  id: string,
  body: Partial<CreateMediaProfileBody>,
): Promise<PrinterMediaProfile> {
  return apiSend<PrinterMediaProfile>(
    `${BASE}/printer-media-profiles/${encodeURIComponent(id)}`,
    "PATCH",
    body,
  );
}

export async function deleteMediaProfile(id: string): Promise<{ ok: boolean; id: string }> {
  return apiSend<{ ok: boolean; id: string }>(
    `${BASE}/printer-media-profiles/${encodeURIComponent(id)}`,
    "DELETE",
  );
}

export async function getPrinterProfile(printerId: string): Promise<PrinterProfile> {
  return apiGet<PrinterProfile>(`${BASE}/printers/${encodeURIComponent(printerId)}/profile`);
}

export async function upsertPrinterProfile(
  printerId: string,
  body: UpsertPrinterProfileBody,
): Promise<PrinterProfile> {
  return apiSend<PrinterProfile>(
    `${BASE}/printers/${encodeURIComponent(printerId)}/profile`,
    "PUT",
    body,
  );
}

export async function getPrinterHealth(printerId: string): Promise<PrinterHealth> {
  return apiGet<PrinterHealth>(`${BASE}/printers/${encodeURIComponent(printerId)}/health`);
}

export async function runPrinterDiagnostics(printerId: string): Promise<PrinterDiagnostics> {
  return apiSend<PrinterDiagnostics>(
    `${BASE}/printers/${encodeURIComponent(printerId)}/diagnostics`,
    "POST",
    {},
    { idempotencyKey: createIdempotencyKey("printer-diagnostics") },
  );
}

export async function reportPrintJobStatus(
  jobId: string,
  body: ReportPrintJobStatusBody,
): Promise<PrintJob> {
  return apiSend<PrintJob>(`${BASE}/print-jobs/${encodeURIComponent(jobId)}/status`, "POST", body);
}

export async function listPrintJobs(query?: {
  status?: string;
  queue?: string;
  history?: string;
  printerId?: string;
  bridgeId?: string;
  page?: string;
  pageSize?: string;
}): Promise<PrintJobListResult> {
  return apiGet<PrintJobListResult>(`${BASE}/print-jobs`, query ? { query } : undefined);
}

export type PrintManagerSummary = {
  printers: {
    online: number;
    offline: number;
    warning: number;
    error: number;
    total: number;
  };
  bridges: { online: number; offline: number; total: number };
  jobs: {
    queued: number;
    printing: number;
    completedToday: number;
    failedToday: number;
    labelsPrintedToday: number;
    pagesPrintedToday: number;
  };
  batches?: {
    active: number;
    completedToday: number;
    failedToday: number;
    jobsCompleted: number;
    jobsFailed: number;
    jobsPending: number;
  };
  supplies?: {
    warning: number;
    critical: number;
    empty: number;
    total: number;
  };
  liveQueue: Array<PrintJob & { printerName?: string | null; bridgeName?: string | null }>;
  printerHealth: Array<{
    id: string;
    name: string;
    locationId: string | null;
    bridgeId: string | null;
    connectionType: string | null;
    transportType: string | null;
    status: string;
    online: boolean;
    ready: boolean;
    enabled: boolean;
    lastSeenAt: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    currentJobId: string | null;
  }>;
  bridgeHealth: Array<{
    id: string;
    name: string;
    computerName: string | null;
    locationId: string | null;
    version: string | null;
    status: string;
    enabled: boolean;
    lastSeenAt: string | null;
    printerCount: number;
    pendingJobs: number;
  }>;
  recentErrors: Array<{
    id: string;
    createdAt: string | null;
    printerId: string | null;
    printerName: string | null;
    status: string;
    errorCode: string | null;
    errorMessage: string | null;
    retryCount: number;
  }>;
};

export async function getPrintManagerSummary(): Promise<PrintManagerSummary> {
  return apiGet<PrintManagerSummary>(`${BASE}/print-manager/summary`);
}

export type PrintAnalyticsQuery = {
  from?: string;
  to?: string;
  locationId?: string;
  divisionId?: string;
  module?: string;
  printerId?: string;
  bridgeId?: string;
};

export type PrintAnalyticsSummary = {
  from: string;
  to: string;
  totals: {
    jobs: number;
    completed: number;
    failed: number;
    cancelled: number;
    reprints: number;
    labelsPrinted: number;
    pagesPrinted: number;
    failureRate: number;
    retryRate: number;
    averageQueueMs: number | null;
    averagePrintMs: number | null;
  };
  byModule: Array<{ module: string; count: number }>;
};

export type PrintAnalyticsVolume = {
  from: string;
  to: string;
  byDay: Array<{ date: string; jobs: number; labels: number; failed: number }>;
  byMonth: Array<{ month: string; jobs: number; labels: number; failed: number }>;
};

export type PrintAnalyticsFailures = {
  from: string;
  to: string;
  totalFailed: number;
  failureRate: number;
  byErrorCode: Array<{ errorCode: string; count: number }>;
  recent: Array<{
    id: string;
    createdAt: string | null;
    printerId: string | null;
    printerName: string | null;
    module: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    retryCount: number;
  }>;
};

export type PrintAnalyticsPrinters = {
  from: string;
  to: string;
  printers: Array<{
    printerId: string | null;
    printerName: string;
    jobs: number;
    completed: number;
    failed: number;
    labelsPrinted: number;
    failureRate: number;
    averagePrintMs: number | null;
    utilizationPercent: number;
  }>;
};

function analyticsQuery(query?: PrintAnalyticsQuery): Record<string, string> | undefined {
  if (!query) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (v != null && String(v).trim()) out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

export async function getPrintAnalyticsSummary(
  query?: PrintAnalyticsQuery,
): Promise<PrintAnalyticsSummary> {
  const q = analyticsQuery(query);
  return apiGet<PrintAnalyticsSummary>(
    `${BASE}/print-manager/analytics/summary`,
    q ? { query: q } : undefined,
  );
}

export async function getPrintAnalyticsVolume(
  query?: PrintAnalyticsQuery,
): Promise<PrintAnalyticsVolume> {
  const q = analyticsQuery(query);
  return apiGet<PrintAnalyticsVolume>(
    `${BASE}/print-manager/analytics/volume`,
    q ? { query: q } : undefined,
  );
}

export async function getPrintAnalyticsFailures(
  query?: PrintAnalyticsQuery,
): Promise<PrintAnalyticsFailures> {
  const q = analyticsQuery(query);
  return apiGet<PrintAnalyticsFailures>(
    `${BASE}/print-manager/analytics/failures`,
    q ? { query: q } : undefined,
  );
}

export async function getPrintAnalyticsPrinters(
  query?: PrintAnalyticsQuery,
): Promise<PrintAnalyticsPrinters> {
  const q = analyticsQuery(query);
  return apiGet<PrintAnalyticsPrinters>(
    `${BASE}/print-manager/analytics/printers`,
    q ? { query: q } : undefined,
  );
}

export type PrintSupply = {
  id: string;
  printerId: string | null;
  printerName: string | null;
  supplyType: string;
  name: string;
  sku: string | null;
  unit: string;
  startingQuantity: number;
  estimatedRemaining: number;
  unitsConsumed: number;
  warningThreshold: number;
  criticalThreshold: number;
  percentRemaining: number | null;
  alertLevel: string;
  lastAlertLevel: string;
  lastReplacedAt: string | null;
  alertUserIds: string[];
  estimated: true;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export async function listPrintSupplies(): Promise<PrintSupply[]> {
  const data = await apiGet<{ items?: PrintSupply[] }>(`${BASE}/print-manager/supplies`);
  return data.items ?? [];
}

export async function createPrintSupply(body: {
  printerId?: string | null;
  supplyType?: string;
  name: string;
  sku?: string | null;
  unit?: string;
  startingQuantity?: number;
  estimatedRemaining?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  alertUserIds?: string[];
  enabled?: boolean;
}): Promise<PrintSupply> {
  return apiSend<PrintSupply>(`${BASE}/print-manager/supplies`, "POST", body, {
    idempotencyKey: createIdempotencyKey("print-supply"),
  });
}

export async function patchPrintSupply(
  id: string,
  body: Partial<{
    printerId: string | null;
    supplyType: string;
    name: string;
    sku: string | null;
    unit: string;
    startingQuantity: number;
    estimatedRemaining: number;
    unitsConsumed: number;
    warningThreshold: number;
    criticalThreshold: number;
    alertUserIds: string[];
    enabled: boolean;
  }>,
): Promise<PrintSupply> {
  return apiSend<PrintSupply>(
    `${BASE}/print-manager/supplies/${encodeURIComponent(id)}`,
    "PATCH",
    body,
  );
}

export async function replacePrintSupply(
  id: string,
  body: { quantity: number; resetConsumed?: boolean },
): Promise<PrintSupply> {
  return apiSend<PrintSupply>(
    `${BASE}/print-manager/supplies/${encodeURIComponent(id)}/replace`,
    "POST",
    body,
    { idempotencyKey: createIdempotencyKey("print-supply-replace") },
  );
}

export async function deletePrintSupply(id: string): Promise<{ id: string }> {
  return apiSend<{ id: string }>(
    `${BASE}/print-manager/supplies/${encodeURIComponent(id)}`,
    "DELETE",
  );
}

export type PrinterGroupMember = {
  id: string;
  printerId: string;
  sortOrder: number;
  isPrimary: boolean;
};

export type PrinterGroup = {
  id: string;
  name: string;
  strategy: string;
  locationId: string | null;
  divisionId: string | null;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  members: PrinterGroupMember[];
};

export type PrintRoutingRule = {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  conditions: {
    locationId?: string | null;
    divisionId?: string | null;
    module?: string | null;
    recordType?: string | null;
  };
  action: {
    printerId?: string | null;
    printerGroupId?: string | null;
  };
  createdAt: string | null;
  updatedAt: string | null;
};

export type ResolvePrintRouteBody = {
  printerId?: string;
  printerGroupId?: string;
  locationId?: string;
  divisionId?: string;
  module?: string;
  recordType?: string;
};

export type ResolvePrintRouteResult = {
  printerId: string;
  reason: string;
  ruleId?: string | null;
  ruleName?: string | null;
  groupId?: string | null;
  source: string;
  printer: ForgePrinter | null;
};

export async function listPrinterGroups(): Promise<PrinterGroup[]> {
  const data = await apiGet<{ items: PrinterGroup[] }>(`${BASE}/print-manager/printer-groups`);
  return data.items ?? [];
}

export async function createPrinterGroup(body: {
  name: string;
  strategy?: string;
  locationId?: string | null;
  divisionId?: string | null;
  enabled?: boolean;
  members?: Array<{ printerId: string; sortOrder?: number; isPrimary?: boolean }>;
}): Promise<PrinterGroup> {
  return apiSend<PrinterGroup>(`${BASE}/print-manager/printer-groups`, "POST", body, {
    idempotencyKey: createIdempotencyKey("printer-group"),
  });
}

export async function patchPrinterGroup(
  id: string,
  body: {
    name?: string;
    strategy?: string;
    locationId?: string | null;
    divisionId?: string | null;
    enabled?: boolean;
    members?: Array<{ printerId: string; sortOrder?: number; isPrimary?: boolean }>;
  },
): Promise<PrinterGroup> {
  return apiSend<PrinterGroup>(
    `${BASE}/print-manager/printer-groups/${encodeURIComponent(id)}`,
    "PATCH",
    body,
  );
}

export async function deletePrinterGroup(id: string): Promise<{ id: string }> {
  return apiSend<{ id: string }>(
    `${BASE}/print-manager/printer-groups/${encodeURIComponent(id)}`,
    "DELETE",
  );
}

export async function listPrintRoutingRules(): Promise<PrintRoutingRule[]> {
  const data = await apiGet<{ items: PrintRoutingRule[] }>(`${BASE}/print-manager/routing-rules`);
  return data.items ?? [];
}

export async function createPrintRoutingRule(body: {
  name: string;
  priority?: number;
  enabled?: boolean;
  conditions?: PrintRoutingRule["conditions"];
  action: PrintRoutingRule["action"];
}): Promise<PrintRoutingRule> {
  return apiSend<PrintRoutingRule>(`${BASE}/print-manager/routing-rules`, "POST", body, {
    idempotencyKey: createIdempotencyKey("print-routing-rule"),
  });
}

export async function patchPrintRoutingRule(
  id: string,
  body: {
    name?: string;
    priority?: number;
    enabled?: boolean;
    conditions?: PrintRoutingRule["conditions"];
    action?: PrintRoutingRule["action"];
  },
): Promise<PrintRoutingRule> {
  return apiSend<PrintRoutingRule>(
    `${BASE}/print-manager/routing-rules/${encodeURIComponent(id)}`,
    "PATCH",
    body,
  );
}

export async function deletePrintRoutingRule(id: string): Promise<{ id: string }> {
  return apiSend<{ id: string }>(
    `${BASE}/print-manager/routing-rules/${encodeURIComponent(id)}`,
    "DELETE",
  );
}

export async function resolvePrintRoute(
  body: ResolvePrintRouteBody,
): Promise<ResolvePrintRouteResult> {
  return apiSend<ResolvePrintRouteResult>(`${BASE}/print-manager/resolve-route`, "POST", body);
}

export type LabelTemplateField = {
  id?: string;
  fieldKey: string;
  fieldType: string;
  label: string | null;
  required: boolean;
  defaultValue: string | null;
  metadataJson?: unknown;
};

export type LabelTemplateVersion = {
  id: string;
  templateId: string;
  version: number;
  status: string;
  dpi: number;
  widthInches: number;
  heightInches: number;
  layout: Record<string, unknown>;
  variables: string[];
  fields: LabelTemplateField[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type LabelTemplate = {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  enabled: boolean;
  publishedVersion: number | null;
  draftVersion: number | null;
  versions?: LabelTemplateVersion[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type LabelTemplatePreview = {
  templateId: string;
  versionId: string;
  version: number;
  status: string;
  contentType: string;
  base64: string;
  previewDataUrl: string;
  sha256: string;
  widthInches: number;
  heightInches: number;
  dpi: number;
};

export async function listLabelTemplates(): Promise<LabelTemplate[]> {
  const data = await apiGet<{ items: LabelTemplate[] }>(`${BASE}/label-templates`);
  return data.items ?? [];
}

export async function getLabelTemplate(id: string): Promise<LabelTemplate> {
  return apiGet<LabelTemplate>(`${BASE}/label-templates/${encodeURIComponent(id)}`);
}

export async function createLabelTemplate(body: {
  code: string;
  name: string;
  category?: string;
  description?: string | null;
  widthInches?: number;
  heightInches?: number;
  dpi?: number;
  layout?: Record<string, unknown>;
  fields?: Array<{
    fieldKey: string;
    fieldType?: string;
    label?: string | null;
    required?: boolean;
    defaultValue?: string | null;
  }>;
}): Promise<LabelTemplate> {
  return apiSend<LabelTemplate>(`${BASE}/label-templates`, "POST", body, {
    idempotencyKey: createIdempotencyKey("label-template"),
  });
}

export async function patchLabelTemplate(
  id: string,
  body: { name?: string; category?: string; description?: string | null; enabled?: boolean },
): Promise<LabelTemplate> {
  return apiSend<LabelTemplate>(`${BASE}/label-templates/${encodeURIComponent(id)}`, "PATCH", body);
}

export async function createLabelTemplateDraft(id: string): Promise<LabelTemplate> {
  return apiSend<LabelTemplate>(
    `${BASE}/label-templates/${encodeURIComponent(id)}/draft`,
    "POST",
    {},
    { idempotencyKey: createIdempotencyKey("label-template-draft") },
  );
}

export async function publishLabelTemplate(
  id: string,
  body?: { versionId?: string },
): Promise<LabelTemplate> {
  return apiSend<LabelTemplate>(
    `${BASE}/label-templates/${encodeURIComponent(id)}/publish`,
    "POST",
    body ?? {},
    { idempotencyKey: createIdempotencyKey("label-template-publish") },
  );
}

export async function patchLabelTemplateVersion(
  templateId: string,
  versionId: string,
  body: {
    widthInches?: number;
    heightInches?: number;
    dpi?: number;
    layout?: Record<string, unknown>;
    fields?: Array<{
      fieldKey: string;
      fieldType?: string;
      label?: string | null;
      required?: boolean;
      defaultValue?: string | null;
    }>;
  },
): Promise<LabelTemplate> {
  return apiSend<LabelTemplate>(
    `${BASE}/label-templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(versionId)}`,
    "PATCH",
    body,
  );
}

export async function previewLabelTemplate(
  id: string,
  body?: {
    versionId?: string;
    version?: number;
    fieldValues?: Record<string, string>;
    output?: "png" | "pdf";
  },
): Promise<LabelTemplatePreview> {
  return apiSend<LabelTemplatePreview>(
    `${BASE}/label-templates/${encodeURIComponent(id)}/preview`,
    "POST",
    body ?? {},
  );
}

export type LabelTemplateZplExport = {
  templateId: string;
  versionId: string;
  version: number;
  dpi: number;
  widthInches: number;
  heightInches: number;
  zpl: string;
  contentType: string;
  filename: string;
};

export async function exportLabelTemplateZpl(
  id: string,
  body?: {
    versionId?: string;
    version?: number;
    fieldValues?: Record<string, string>;
  },
): Promise<LabelTemplateZplExport> {
  return apiSend<LabelTemplateZplExport>(
    `${BASE}/label-templates/${encodeURIComponent(id)}/export-zpl`,
    "POST",
    body ?? {},
  );
}

export async function getPrintJob(id: string): Promise<PrintJobDetail> {
  return apiGet<PrintJobDetail>(`${BASE}/print-jobs/${encodeURIComponent(id)}`);
}

/** Authenticated same-origin-via-API PNG/PDF bytes (avoids S3 CORS for Direct Bluetooth). */
export async function getPrintJobArtifactBytes(id: string): Promise<Uint8Array> {
  const res = await apiFetchRaw(`${BASE}/print-jobs/${encodeURIComponent(id)}/artifact`);
  if (!res.ok) {
    let message = `Failed to download print artifact (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string } };
      if (body?.error?.message) message = body.error.message;
      throw new ApiError(message, res.status, body?.error?.code);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(message, res.status);
    }
  }
  const buf = await res.arrayBuffer();
  if (!buf.byteLength) {
    throw new ApiError("Print artifact download was empty.", res.status);
  }
  return new Uint8Array(buf);
}

export async function cancelPrintJob(id: string): Promise<PrintJob> {
  return apiSend<PrintJob>(`${BASE}/print-jobs/${encodeURIComponent(id)}/cancel`, "POST", {});
}

export async function retryPrintJob(id: string): Promise<PrintJob> {
  return apiSend<PrintJob>(
    `${BASE}/print-jobs/${encodeURIComponent(id)}/retry`,
    "POST",
    {},
    {
      idempotencyKey: createIdempotencyKey("print-retry"),
    },
  );
}

export async function reprintPrintJob(
  id: string,
  body: { reason: string; copies?: number },
): Promise<PrintJob> {
  return apiSend<PrintJob>(`${BASE}/print-jobs/${encodeURIComponent(id)}/reprint`, "POST", body, {
    idempotencyKey: createIdempotencyKey("print-reprint"),
  });
}

/** Poll a print job until it reaches a terminal status or the abort signal fires. */
export async function pollPrintJobUntilTerminal(
  jobId: string,
  options?: { intervalMs?: number; signal?: AbortSignal; maxAttempts?: number },
): Promise<PrintJobDetail> {
  const intervalMs = options?.intervalMs ?? 1500;
  const maxAttempts = options?.maxAttempts ?? 80;
  let last: PrintJobDetail | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    last = await getPrintJob(jobId);
    if (isPrintJobTerminal(last.status)) return last;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs);
      options?.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
  }
  return last ?? (await getPrintJob(jobId));
}
