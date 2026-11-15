import { describe, expect, it, vi, beforeEach } from "vitest";

const getPrintJob = vi.fn();
const reportPrintJobStatus = vi.fn();
const printPngViaDirectBluetooth = vi.fn();
const isDirectBluetoothSupported = vi.fn();
const ensureDirectBradyConnected = vi.fn();
const getPrintJobArtifactBytes = vi.fn();

vi.mock("@/lib/print-api", () => ({
  getPrintJob: (...args: unknown[]) => getPrintJob(...args),
  reportPrintJobStatus: (...args: unknown[]) => reportPrintJobStatus(...args),
  getPrintJobArtifactBytes: (...args: unknown[]) => getPrintJobArtifactBytes(...args),
  createPrintJob: vi.fn(),
  getPrinter: vi.fn(),
  isDirectBluetoothPrinter: vi.fn(),
  pollPrintJobUntilTerminal: vi.fn(),
}));

vi.mock("@/lib/direct-brady-bluetooth", () => ({
  isDirectBluetoothSupported: (...args: unknown[]) => isDirectBluetoothSupported(...args),
  ensureDirectBradyConnected: (...args: unknown[]) => ensureDirectBradyConnected(...args),
  printPngViaDirectBluetooth: (...args: unknown[]) => printPngViaDirectBluetooth(...args),
}));

// Each test cold-imports ./direct-print, which can exceed the 5s default when the whole suite runs.
describe("printJobViaDirectBluetooth", { timeout: 30_000 }, () => {
  beforeEach(() => {
    getPrintJob.mockReset();
    reportPrintJobStatus.mockReset();
    printPngViaDirectBluetooth.mockReset();
    isDirectBluetoothSupported.mockReset();
    ensureDirectBradyConnected.mockReset();
    getPrintJobArtifactBytes.mockReset();
  });

  it("prints artifact and reports COMPLETED", async () => {
    isDirectBluetoothSupported.mockResolvedValue(true);
    getPrintJob.mockResolvedValue({
      id: "job-1",
      status: "QUEUED",
      artifactUrl: "https://example.com/label.png",
    });
    reportPrintJobStatus.mockResolvedValue({ id: "job-1", status: "COMPLETED" });
    printPngViaDirectBluetooth.mockResolvedValue(undefined);
    ensureDirectBradyConnected.mockResolvedValue("saved-1");
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    getPrintJobArtifactBytes.mockResolvedValue(pngBytes);

    const { printJobViaDirectBluetooth } = await import("./direct-print");
    const result = await printJobViaDirectBluetooth(
      "job-1",
      { id: "p1", bluetoothSavedId: "saved-1" },
      2,
    );

    expect(ensureDirectBradyConnected).toHaveBeenCalledWith("saved-1");
    expect(getPrintJobArtifactBytes).toHaveBeenCalledWith("job-1");
    expect(printPngViaDirectBluetooth).toHaveBeenCalledWith(
      expect.objectContaining({
        pngBytes,
        copies: 2,
        savedId: "saved-1",
      }),
    );
    expect(reportPrintJobStatus).toHaveBeenCalledWith("job-1", { status: "COMPLETED" });
    expect(result.ok).toBe(true);
  });

  it("reports FAILED when Web Bluetooth is unsupported", async () => {
    isDirectBluetoothSupported.mockResolvedValue(false);
    getPrintJob.mockResolvedValue({ id: "job-2", status: "FAILED" });
    reportPrintJobStatus.mockResolvedValue({ id: "job-2", status: "FAILED" });

    const { printJobViaDirectBluetooth } = await import("./direct-print");
    const result = await printJobViaDirectBluetooth("job-2", { id: "p1", bluetoothSavedId: null });

    expect(reportPrintJobStatus).toHaveBeenCalledWith(
      "job-2",
      expect.objectContaining({ status: "FAILED", errorCode: "WEB_BLUETOOTH_UNSUPPORTED" }),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Web Bluetooth/i);
  });
});
