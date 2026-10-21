import { describe, expect, it, vi, beforeEach } from "vitest";
import { bradyAdapter, pdfLabelAdapter, bridgeAdapter } from "./label-print";

const createPrintJob = vi.fn();
const listPrinters = vi.fn(async () => []);
const pollPrintJobUntilTerminal = vi.fn();
const getPrinter = vi.fn();
const printJobViaDirectBluetooth = vi.fn();

vi.mock("@/lib/print-api", () => ({
  createPrintJob: (...args: unknown[]) =>
    (createPrintJob as (...a: unknown[]) => unknown)(...args),
  listPrinters: (...args: unknown[]) =>
    (listPrinters as (...a: unknown[]) => unknown)(...args),
  pollPrintJobUntilTerminal: (...args: unknown[]) =>
    (pollPrintJobUntilTerminal as (...a: unknown[]) => unknown)(...args),
  getPrinter: (...args: unknown[]) => (getPrinter as (...a: unknown[]) => unknown)(...args),
  isDirectBluetoothPrinter: (printer: {
    bridgeId: string | null;
    transportType?: string | null;
  }) =>
    !printer.bridgeId &&
    String(printer.transportType ?? "").toUpperCase() === "BRADY_WEB_BLUETOOTH",
}));

vi.mock("@/lib/direct-print", () => ({
  printJobViaDirectBluetooth: (...args: unknown[]) =>
    (printJobViaDirectBluetooth as (...a: unknown[]) => unknown)(...args),
}));

describe("label-print adapters", () => {
  beforeEach(() => {
    createPrintJob.mockReset();
    listPrinters.mockReset();
    pollPrintJobUntilTerminal.mockReset();
    getPrinter.mockReset();
    printJobViaDirectBluetooth.mockReset();
  });

  it("Brady adapter reports unavailable without a printerId", async () => {
    const result = await bradyAdapter({
      stickerObjectUrl: "blob:test",
      label: "Line 2",
    });
    expect(result.adapter).toBe("brady");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not configured/i);
  });

  it("PDF adapter accepts a sticker blob", async () => {
    const result = await pdfLabelAdapter({
      stickerObjectUrl: "blob:test",
      label: "Line 2",
      stickerBlob: new Blob(["x"], { type: "image/png" }),
    });
    expect(result.ok).toBe(true);
  });

  it("PDF adapter fails cleanly without an image", async () => {
    const result = await pdfLabelAdapter({
      stickerObjectUrl: "",
      label: "Line 2",
    });
    expect(result.ok).toBe(false);
  });

  it("bridge adapter uses DIRECT_BLUETOOTH printMode for printers without bridgeId", async () => {
    getPrinter.mockResolvedValue({
      id: "p1",
      bridgeId: null,
      transportType: "BRADY_WEB_BLUETOOTH",
      connectionType: "BLUETOOTH_BLE",
      bluetoothSavedId: "saved-1",
      name: "Brady Direct",
      displayName: "Brady Direct",
    });
    createPrintJob.mockResolvedValue({ id: "job-1", printerId: "p1", status: "QUEUED" });
    printJobViaDirectBluetooth.mockResolvedValue({
      ok: true,
      job: { id: "job-1", status: "COMPLETED" },
      message: "Label Sent Successfully",
    });

    const result = await bridgeAdapter({
      stickerObjectUrl: "blob:test",
      label: "Asset",
      printerId: "p1",
    });

    expect(createPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({ printMode: "DIRECT_BLUETOOTH", printerId: "p1" }),
    );
    expect(printJobViaDirectBluetooth).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.status).toBe("COMPLETED");
  });

  it("bridge adapter uses BRIDGE printMode for bridge-attached printers", async () => {
    getPrinter.mockResolvedValue({
      id: "p2",
      bridgeId: "bridge-1",
      transportType: "WINDOWS_SPOOLER",
      connectionType: "USB",
      name: "Shop USB",
      displayName: null,
    });
    createPrintJob.mockResolvedValue({ id: "job-2", printerId: "p2", status: "QUEUED" });
    pollPrintJobUntilTerminal.mockResolvedValue({
      id: "job-2",
      status: "COMPLETED",
      errorMessage: null,
    });

    const result = await bridgeAdapter({
      stickerObjectUrl: "blob:test",
      label: "Asset",
      printerId: "p2",
    });

    expect(createPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({ printMode: "BRIDGE", printerId: "p2" }),
    );
    expect(printJobViaDirectBluetooth).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});
