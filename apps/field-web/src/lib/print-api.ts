/**
 * Thin Forge Print Service client for field-web (Direct Bluetooth + jobs).
 */
import { ApiError, apiFetchRaw, apiGet, apiSend, createIdempotencyKey } from "@forge/web-kit";

const BASE = "/api/v1/industrial";

export type ForgePrinter = {
  id: string;
  bridgeId: string | null;
  name: string;
  displayName: string | null;
  connectionType: string | null;
  transportType: string | null;
  model?: string | null;
  bluetoothDeviceId?: string | null;
  bluetoothSavedId?: string | null;
  online: boolean;
  connected: boolean;
  ready: boolean;
  isDefault: boolean;
  enabled: boolean;
};

export type PrintJob = {
  id: string;
  printerId: string | null;
  status: string;
  copies: number;
  errorMessage: string | null;
  module?: string | null;
  recordType?: string | null;
  recordId?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
  title?: string | null;
};

export type PrintJobDetail = PrintJob & {
  artifactUrl?: string | null;
};

export type PrintJobListResult = {
  items?: PrintJob[];
  page?: number;
  pageSize?: number;
  total?: number;
};

export type PrintLabelLayout = {
  qrScale?: number;
  textScale?: number;
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

export type CreatePrintJobBody = {
  printerId: string;
  module?: string;
  recordType?: string;
  recordId?: string;
  copies?: number;
  widthInches?: number;
  heightInches?: number;
  dpi?: number;
  orientation?: string;
  cutMode?: string;
  fieldValues?: Record<string, string>;
  layout?: PrintLabelLayout;
  printMode?: "BRIDGE" | "DIRECT_BLUETOOTH";
  acceptFailover?: boolean;
  mediaProfileId?: string;
  templateId?: string;
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

export function printerDisplayName(printer: Pick<ForgePrinter, "displayName" | "name">): string {
  return (printer.displayName || printer.name || "Printer").trim();
}

export function isDirectBluetoothPrinter(
  printer: Pick<ForgePrinter, "bridgeId" | "connectionType" | "transportType"> | null | undefined,
): boolean {
  if (!printer) return false;
  const transport = String(printer.transportType ?? "").toUpperCase();
  const connection = String(printer.connectionType ?? "").toUpperCase();
  if (transport === "BRADY_WEB_BLUETOOTH" && !printer.bridgeId) return true;
  return (
    !printer.bridgeId &&
    (connection === "BLUETOOTH_BLE" ||
      connection === "BLUETOOTH" ||
      transport === "BRADY_WEB_BLUETOOTH")
  );
}

export async function listPrinters(query?: { enabled?: string }): Promise<ForgePrinter[]> {
  const data = await apiGet<{ items?: ForgePrinter[] }>(
    `${BASE}/printers`,
    query ? { query } : undefined,
  );
  return data.items ?? [];
}

export async function createPrintJob(body: CreatePrintJobBody): Promise<PrintJob> {
  return apiSend<PrintJob>(`${BASE}/print-jobs`, "POST", body, {
    idempotencyKey: createIdempotencyKey("print-job"),
  });
}

export async function previewPrintJob(body: PreviewPrintJobBody): Promise<PreviewPrintJobResult> {
  return apiSend<PreviewPrintJobResult>(`${BASE}/print-jobs/preview`, "POST", body);
}

export async function listMediaProfiles(): Promise<PrinterMediaProfile[]> {
  const data = await apiGet<{ items?: PrinterMediaProfile[] }>(`${BASE}/printer-media-profiles`);
  return data.items ?? [];
}

export type CreateMediaProfileBody = {
  name: string;
  widthInches: number;
  heightInches: number;
  manufacturer?: string;
  printerModel?: string;
  partNumber?: string;
  continuous?: boolean;
  dieCut?: boolean;
  orientation?: string;
};

export async function createMediaProfile(
  body: CreateMediaProfileBody,
): Promise<PrinterMediaProfile> {
  return apiSend<PrinterMediaProfile>(`${BASE}/printer-media-profiles`, "POST", body, {
    idempotencyKey: createIdempotencyKey("media-profile"),
  });
}

export async function getPrintJob(id: string): Promise<PrintJobDetail> {
  return apiGet<PrintJobDetail>(`${BASE}/print-jobs/${encodeURIComponent(id)}`);
}

/** Authenticated PNG/PDF bytes via API (avoids S3 CORS for Direct Bluetooth). */
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

export async function reportPrintJobStatus(
  jobId: string,
  body: {
    status: string;
    errorCode?: string;
    errorMessage?: string;
    message?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<PrintJob> {
  return apiSend<PrintJob>(`${BASE}/print-jobs/${encodeURIComponent(jobId)}/status`, "POST", body);
}

export async function registerDirectBluetoothPrinter(body: {
  name: string;
  bluetoothSavedId: string;
  bluetoothDeviceId?: string;
  displayName?: string;
  model?: string;
}): Promise<ForgePrinter> {
  return apiSend<ForgePrinter>(`${BASE}/printers/direct-bluetooth`, "POST", body, {
    idempotencyKey: createIdempotencyKey("printer-direct-bt"),
  });
}

export async function listPrintJobs(query?: {
  history?: string;
  page?: string;
  pageSize?: string;
  printerId?: string;
}): Promise<PrintJobListResult> {
  return apiGet<PrintJobListResult>(`${BASE}/print-jobs`, query ? { query } : undefined);
}

export async function getPrintManagerSummary(): Promise<{
  printers?: { online?: number; offline?: number; total?: number };
  jobs?: {
    queued?: number;
    printing?: number;
    completedToday?: number;
    failedToday?: number;
  };
}> {
  return apiGet(`${BASE}/print-manager/summary`);
}

export async function waitForArtifactUrl(
  jobId: string,
  options?: { maxAttempts?: number; intervalMs?: number },
): Promise<PrintJobDetail> {
  const maxAttempts = options?.maxAttempts ?? 40;
  const intervalMs = options?.intervalMs ?? 1000;
  let last: PrintJobDetail | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    last = await getPrintJob(jobId);
    if (last.artifactUrl) return last;
    const status = String(last.status ?? "").toUpperCase();
    if (status === "FAILED" || status === "CANCELLED" || status === "EXPIRED") {
      throw new Error(last.errorMessage || `Print job ended with status ${status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Print artifact was not ready in time.");
}

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

export type CreatePrintBatchBody = {
  printerId?: string;
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

export async function createPrintBatch(body: CreatePrintBatchBody): Promise<PrintBatchDetail> {
  return apiSend<PrintBatchDetail>(`${BASE}/print-batches`, "POST", body, {
    idempotencyKey: createIdempotencyKey("print-batch"),
  });
}

export async function getPrintBatch(id: string): Promise<PrintBatchDetail> {
  return apiGet<PrintBatchDetail>(`${BASE}/print-batches/${encodeURIComponent(id)}`);
}

const BATCH_TERMINAL = new Set(["COMPLETED", "FAILED", "PARTIAL", "CANCELLED"]);

/** Poll a print batch until it reaches a terminal status. */
export async function pollPrintBatchUntilTerminal(
  batchId: string,
  options?: { intervalMs?: number; maxAttempts?: number },
): Promise<PrintBatchDetail> {
  const intervalMs = options?.intervalMs ?? 2000;
  const maxAttempts = options?.maxAttempts ?? 120;
  let last: PrintBatchDetail | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    last = await getPrintBatch(batchId);
    if (BATCH_TERMINAL.has(String(last.status ?? "").toUpperCase())) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (!last) throw new ApiError("Batch poll timed out with no response.", 408);
  return last;
}
