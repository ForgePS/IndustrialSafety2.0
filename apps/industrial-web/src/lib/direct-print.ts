/**
 * Direct Bluetooth print path — matches Brady WebSdkDemo flow:
 * 1) Connect on user gesture (showDiscoveredBleDevices)
 * 2) Create/wait for PNG artifact
 * 3) blob URL → HTMLImageElement → printBitmap(img)
 */
"use client";

import {
  createPrintJob,
  getPrintJob,
  getPrintJobArtifactBytes,
  getPrinter,
  isDirectBluetoothPrinter,
  pollPrintJobUntilTerminal,
  reportPrintJobStatus,
  type CreatePrintJobBody,
  type ForgePrinter,
  type PrintJobDetail,
} from "@/lib/print-api";

export type DirectPrintResult = {
  job: PrintJobDetail | null;
  ok: boolean;
  message?: string;
};

async function loadBradyPrint() {
  return import("@/lib/direct-brady-bluetooth");
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

async function failUnsupported(jobId: string, message: string): Promise<DirectPrintResult> {
  try {
    await reportPrintJobStatus(jobId, {
      status: "FAILED",
      errorCode: "WEB_BLUETOOTH_UNSUPPORTED",
      errorMessage: message,
    });
  } catch {
    // best-effort
  }
  return { job: await getPrintJob(jobId), ok: false, message };
}

/**
 * Transmit an existing job via Brady Web SDK.
 * Caller must already have connected during the click gesture when possible.
 */
export async function printJobViaDirectBluetooth(
  jobId: string,
  printer: Pick<ForgePrinter, "bluetoothSavedId" | "id">,
  copies = 1,
): Promise<DirectPrintResult> {
  const {
    isDirectBluetoothSupported,
    ensureDirectBradyConnected,
    printPngViaDirectBluetooth,
  } = await loadBradyPrint();
  const supported = await isDirectBluetoothSupported();
  if (!supported) {
    return failUnsupported(
      jobId,
      "Web Bluetooth is not available in this browser. Use Chrome or Edge on HTTPS, or print via a Printer Bridge.",
    );
  }

  try {
    // No-op if already connected from createAndPrintDirect / dialog pre-connect.
    await ensureDirectBradyConnected(printer.bluetoothSavedId);

    const detail = await waitForArtifactUrl(jobId);
    const pngBytes = await getPrintJobArtifactBytes(jobId);
    await printPngViaDirectBluetooth({
      pngBytes,
      copies,
      ...(printer.bluetoothSavedId ? { savedId: printer.bluetoothSavedId } : {}),
    });
    const completed = await reportPrintJobStatus(jobId, { status: "COMPLETED" });
    return {
      job: {
        ...detail,
        ...completed,
        artifactUrl: detail.artifactUrl ?? null,
      },
      ok: true,
      message: "Label Sent Successfully",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Direct Bluetooth print failed.";
    try {
      await reportPrintJobStatus(jobId, {
        status: "FAILED",
        errorCode: "DIRECT_BLUETOOTH_PRINT_FAILED",
        errorMessage: message,
      });
    } catch {
      // best-effort
    }
    return { job: await getPrintJob(jobId), ok: false, message };
  }
}

/**
 * Create a print job; if Direct Bluetooth, connect first (Brady demo style), then print.
 */
export async function createAndPrintDirect(
  printer: ForgePrinter,
  body: Omit<CreatePrintJobBody, "printerId"> & { printerId?: string },
): Promise<DirectPrintResult> {
  const direct = isDirectBluetoothPrinter(printer);

  if (direct) {
    const { isDirectBluetoothSupported, ensureDirectBradyConnected } = await loadBradyPrint();
    const supported = await isDirectBluetoothSupported();
    if (!supported) {
      return {
        job: null,
        ok: false,
        message:
          "Web Bluetooth is not available in this browser. Use Chrome or Edge on HTTPS, or print via a Printer Bridge.",
      };
    }
    // CRITICAL: open BLE chooser during the Print click, before createPrintJob awaits.
    // Same split as Brady demo (Scan button, then Print) — gesture must still be valid.
    await ensureDirectBradyConnected(printer.bluetoothSavedId);
  }

  const created = await createPrintJob({
    ...body,
    printerId: body.printerId ?? printer.id,
    printMode: body.printMode ?? (direct ? "DIRECT_BLUETOOTH" : "BRIDGE"),
  });

  const resolvedId = created.printerId ?? printer.id;
  let resolved = printer;
  if (resolvedId !== printer.id) {
    try {
      resolved = await getPrinter(resolvedId);
    } catch {
      resolved = printer;
    }
  }

  if (isDirectBluetoothPrinter(resolved)) {
    return printJobViaDirectBluetooth(created.id, resolved, body.copies ?? 1);
  }

  const finalJob = await pollPrintJobUntilTerminal(created.id);
  const status = String(finalJob.status ?? "").toUpperCase();
  const ok = status === "COMPLETED" || status === "SENT_TO_PRINTER";
  return {
    job: finalJob,
    ok,
    message: ok
      ? status === "SENT_TO_PRINTER"
        ? "Sent to Printer"
        : "Label Sent Successfully"
      : finalJob.errorMessage || `Print job ended with status ${status}.`,
  };
}
