import { composeQrLinkStickerBlob, printQrLinkSticker } from "@/lib/qr-link-sticker";
import {
  createPrintJob,
  getPrinter,
  isDirectBluetoothPrinter,
  listPrinters,
  pollPrintJobUntilTerminal,
  type CreatePrintJobBody,
} from "@/lib/print-api";

export type LabelPrintAdapter = "browser" | "pdf" | "brady" | "bridge";

export type LabelPrintRequest = {
  stickerObjectUrl: string;
  label: string;
  stickerBlob?: Blob | null;
  displayCode?: string | null;
  companyName?: string | null;
  /** When set, bridge/brady adapters submit a Forge Print Service job. */
  printerId?: string | null;
  module?: string;
  recordType?: string;
  recordId?: string;
  fieldValues?: Record<string, string>;
  copies?: number;
  widthInches?: number;
  heightInches?: number;
};

export type LabelPrintResult = {
  adapter: LabelPrintAdapter;
  ok: boolean;
  message?: string;
  jobId?: string;
  status?: string;
};

/** Browser print via existing sticker popup (primary path). */
export async function browserPrintAdapter(request: LabelPrintRequest): Promise<LabelPrintResult> {
  await printQrLinkSticker(
    request.stickerObjectUrl,
    request.label,
    request.stickerBlob ?? null,
  );
  return { adapter: "browser", ok: true };
}

/** PDF / download path — returns the composed sticker blob for save. */
export async function pdfLabelAdapter(request: LabelPrintRequest): Promise<LabelPrintResult> {
  if (!request.stickerBlob && !request.stickerObjectUrl) {
    return { adapter: "pdf", ok: false, message: "No sticker image available." };
  }
  return { adapter: "pdf", ok: true, message: "Use Download PNG for a print-ready file." };
}

function buildJobBody(request: LabelPrintRequest, printerId: string): CreatePrintJobBody {
  const fieldValues: Record<string, string> = {
    ...(request.fieldValues ?? {}),
    title: request.fieldValues?.title || request.label,
  };
  if (request.displayCode) fieldValues.displayCode = request.displayCode;
  if (request.companyName) fieldValues.companyName = request.companyName;

  return {
    printerId,
    copies: request.copies ?? 1,
    fieldValues,
    ...(request.module ? { module: request.module } : {}),
    ...(request.recordType ? { recordType: request.recordType } : {}),
    ...(request.recordId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      request.recordId,
    )
      ? { recordId: request.recordId }
      : {}),
    ...(request.widthInches != null ? { widthInches: request.widthInches } : {}),
    ...(request.heightInches != null ? { heightInches: request.heightInches } : {}),
  };
}

/**
 * Forge Printer Bridge adapter. Requires printerId; otherwise reports not configured.
 * Direct Bluetooth printers use printMode DIRECT_BLUETOOTH and the browser SDK path.
 */
export async function bridgeAdapter(request: LabelPrintRequest): Promise<LabelPrintResult> {
  if (!request.printerId) {
    return {
      adapter: "bridge",
      ok: false,
      message:
        "Printer bridge is not configured. Select a printer or use browser print.",
    };
  }

  const printer = await getPrinter(request.printerId);
  const direct = isDirectBluetoothPrinter(printer);
  const body: CreatePrintJobBody = {
    ...buildJobBody(request, request.printerId),
    printMode: direct ? "DIRECT_BLUETOOTH" : "BRIDGE",
  };

  const created = await createPrintJob(body);

  if (direct) {
    const { printJobViaDirectBluetooth } = await import("@/lib/direct-print");
    const result = await printJobViaDirectBluetooth(
      created.id,
      printer,
      request.copies ?? 1,
    );
    return {
      adapter: "bridge",
      ok: result.ok,
      jobId: result.job?.id ?? created.id,
      status: result.job?.status ?? (result.ok ? "COMPLETED" : "FAILED"),
      ...(result.message ? { message: result.message } : {}),
    };
  }

  const finalJob = await pollPrintJobUntilTerminal(created.id);
  const status = String(finalJob.status ?? "").toUpperCase();
  if (status === "COMPLETED" || status === "SENT_TO_PRINTER") {
    return {
      adapter: "bridge",
      ok: true,
      jobId: finalJob.id,
      status,
      message:
        status === "SENT_TO_PRINTER" ? "Sent to Printer" : "Label Sent Successfully",
    };
  }
  return {
    adapter: "bridge",
    ok: false,
    jobId: finalJob.id,
    status,
    message: finalJob.errorMessage || `Print job ended with status ${status}.`,
  };
}

/**
 * Brady i4311 path — aliases to the Forge Printer Bridge adapter.
 */
export async function bradyAdapter(request: LabelPrintRequest): Promise<LabelPrintResult> {
  const result = await bridgeAdapter(request);
  if (result.ok) {
    return {
      adapter: "brady",
      ok: true,
      ...(result.jobId ? { jobId: result.jobId } : {}),
      ...(result.status ? { status: result.status } : {}),
      ...(result.message ? { message: result.message } : {}),
    };
  }
  return {
    adapter: "brady",
    ok: false,
    message:
      result.message ??
      "Brady printer is not configured. Use browser print or download PNG.",
    ...(result.jobId ? { jobId: result.jobId } : {}),
    ...(result.status ? { status: result.status } : {}),
  };
}

export type LabelPrintService = {
  print: (request: LabelPrintRequest, preferred?: LabelPrintAdapter) => Promise<LabelPrintResult>;
};

export function createLabelPrintService(): LabelPrintService {
  return {
    async print(request, preferred = "browser") {
      if (preferred === "bridge" || preferred === "brady") {
        let printerRequest = request;
        if (!request.printerId) {
          try {
            const printers = await listPrinters({ enabled: "true" });
            const preferredPrinter =
              printers.find((p) => p.isDefault && p.ready) ??
              printers.find((p) => p.isDefault) ??
              printers.find((p) => p.ready) ??
              printers[0];
            if (preferredPrinter) {
              printerRequest = { ...request, printerId: preferredPrinter.id };
            }
          } catch {
            // Fall through — bridge adapter will report not configured.
          }
        }

        if (preferred === "brady") {
          const brady = await bradyAdapter(printerRequest);
          if (brady.ok) return brady;
          return browserPrintAdapter(request);
        }

        const bridge = await bridgeAdapter(printerRequest);
        if (bridge.ok) return bridge;
        return browserPrintAdapter(request);
      }
      if (preferred === "pdf") return pdfLabelAdapter(request);
      return browserPrintAdapter(request);
    },
  };
}

const defaultService = createLabelPrintService();

export async function printQrLabel(
  request: LabelPrintRequest,
  preferred: LabelPrintAdapter = "browser",
): Promise<LabelPrintResult> {
  return defaultService.print(request, preferred);
}

export { composeQrLinkStickerBlob };
