import { describe, expect, it } from "vitest";
import { BRADY_I4311_DPI, ForgePrintMode, inchesToPixels, classifyPrintManagerPrinterHealth } from "@forge/contracts";
import { ForgeError } from "@forge/errors";
import {
  DEFAULT_HEIGHT_IN,
  DEFAULT_WIDTH_IN,
} from "./industrial-label-renderer.service.js";
import {
  computeBatchStatusFromCounters,
  defaultTransportForConnection,
  generatePairingCode,
  buildBridgeClaimJobPayload,
  isDirectBluetoothPrintPath,
  isPairingCodeFormat,
  isPrimaryPrinterUnavailable,
  isTerminalSuccessStatus,
  resolveFailoverDecision,
  resolvePrinterCapabilities,
} from "./industrial-print.service.js";

describe("industrial print helpers", () => {
  it("converts inches to pixels at Brady i4311 300 DPI", () => {
    expect(inchesToPixels(1, BRADY_I4311_DPI)).toBe(300);
    expect(inchesToPixels(4, 300)).toBe(1200);
    expect(inchesToPixels(2, 300)).toBe(600);
    expect(DEFAULT_WIDTH_IN).toBe(4);
    expect(DEFAULT_HEIGHT_IN).toBe(4);
  });

  it("formats pairing codes as FPB-XXX-XXX", () => {
    const generated = generatePairingCode();
    expect(generated).toMatch(/^FPB-\d{3}-\d{3}$/);
    expect(isPairingCodeFormat(generated)).toBe(true);
    expect(isPairingCodeFormat("FPB-739-842")).toBe(true);
    expect(isPairingCodeFormat("BAD")).toBe(false);
  });

  it("treats completed / sent-to-printer as terminal success (no re-queue)", () => {
    expect(isTerminalSuccessStatus("COMPLETED")).toBe(true);
    expect(isTerminalSuccessStatus("SENT_TO_PRINTER")).toBe(true);
    expect(isTerminalSuccessStatus("QUEUED")).toBe(false);
    expect(isTerminalSuccessStatus("FAILED")).toBe(false);
  });

  it("defaults USB/Ethernet/WiFi to Windows spooler and Bluetooth to Brady Web Bluetooth", () => {
    expect(defaultTransportForConnection("USB")).toBe("WINDOWS_SPOOLER");
    expect(defaultTransportForConnection("ETHERNET")).toBe("WINDOWS_SPOOLER");
    expect(defaultTransportForConnection("WIFI")).toBe("WINDOWS_SPOOLER");
    expect(defaultTransportForConnection("BLUETOOTH_BLE")).toBe("BRADY_WEB_BLUETOOTH");
    expect(defaultTransportForConnection("BLUETOOTH")).toBe("BRADY_WEB_BLUETOOTH");
    expect(defaultTransportForConnection(null)).toBe("WINDOWS_SPOOLER");
  });

  it("hides cut/feed for i4311 Brady Web Bluetooth capabilities", () => {
    const caps = resolvePrinterCapabilities({
      model: "i4311",
      connectionType: "BLUETOOTH_BLE",
      transportType: "BRADY_WEB_BLUETOOTH",
      supportsCut: true,
      supportsFeed: true,
      supportsBitmap: true,
      supportsMultipleCopies: true,
      dpi: 300,
    });
    expect(caps.print).toBe(true);
    expect(caps.bitmapPrint).toBe(true);
    expect(caps.cut).toBe(false);
    expect(caps.feed).toBe(false);
    expect(caps.batteryStatus).toBe(true);
    expect(caps.dpi).toEqual([300]);
  });

  it("classifies Print Manager printer health for dashboard cards", () => {
    expect(
      classifyPrintManagerPrinterHealth({
        enabled: true,
        online: true,
        ready: true,
      }),
    ).toBe("ONLINE");
    expect(
      classifyPrintManagerPrinterHealth({
        enabled: true,
        online: false,
        ready: false,
      }),
    ).toBe("OFFLINE");
    expect(
      classifyPrintManagerPrinterHealth({
        enabled: true,
        online: true,
        ready: false,
      }),
    ).toBe("WARNING");
    expect(
      classifyPrintManagerPrinterHealth({
        enabled: false,
        online: true,
        ready: true,
      }),
    ).toBe("OFFLINE");
    expect(
      classifyPrintManagerPrinterHealth({
        enabled: true,
        online: true,
        ready: true,
        lastErrorCode: "MEDIA_OUT",
      }),
    ).toBe("ERROR");
  });

  it("includes Windows queue identity on bridge claim payloads", () => {
    const payload = buildBridgeClaimJobPayload({
      job: {
        id: "job-1",
        tenantId: "tenant-1",
        bridgeId: "bridge-1",
        printerId: "printer-uuid",
        templateId: null,
        templateVersion: null,
        widthInches: 4,
        heightInches: 2,
        dpi: 300,
        artifactType: "PNG",
        artifactSha256: "abc",
        copies: 1,
        orientation: "AUTO",
        cutMode: null,
        requestedBy: null,
        expiresAt: null,
      },
      printer: {
        windowsQueueName: "Brady i4311",
        deviceIdentifier: "Brady i4311",
        bluetoothDeviceId: null,
        bluetoothSavedId: null,
        name: "Brady",
        displayName: "Safety Brady",
      },
      artifactUrl: "https://example.com/label.png",
      status: "DELIVERING",
    });
    expect(payload.windowsQueueName).toBe("Brady i4311");
    expect(payload.deviceIdentifier).toBe("Brady i4311");
    expect(payload.printerId).toBe("printer-uuid");
    expect(payload.printerName).toBe("Safety Brady");
  });
});

describe("Phase 3 direct Bluetooth / batch / failover helpers", () => {
  it("allows direct job path when printer has no bridge", () => {
    expect(
      isDirectBluetoothPrintPath({
        bridgeId: null,
        transportType: "BRADY_WEB_BLUETOOTH",
      }),
    ).toBe(true);
    expect(
      isDirectBluetoothPrintPath({
        printMode: ForgePrintMode.DIRECT_BLUETOOTH,
        bridgeId: "bridge-1",
        transportType: "WINDOWS_SPOOLER",
      }),
    ).toBe(true);
    expect(
      isDirectBluetoothPrintPath({
        printMode: ForgePrintMode.BRIDGE,
        bridgeId: "bridge-1",
        transportType: "WINDOWS_SPOOLER",
      }),
    ).toBe(false);
  });

  it("shapes batch counters into PRINTING / COMPLETED / PARTIAL / FAILED", () => {
    expect(
      computeBatchStatusFromCounters({ totalJobs: 3, completedJobs: 1, failedJobs: 0 }),
    ).toBe("PRINTING");
    expect(
      computeBatchStatusFromCounters({ totalJobs: 3, completedJobs: 3, failedJobs: 0 }),
    ).toBe("COMPLETED");
    expect(
      computeBatchStatusFromCounters({ totalJobs: 3, completedJobs: 2, failedJobs: 1 }),
    ).toBe("PARTIAL");
    expect(
      computeBatchStatusFromCounters({ totalJobs: 2, completedJobs: 0, failedJobs: 2 }),
    ).toBe("FAILED");
  });

  it("requires acceptFailover before switching to fallback printer", () => {
    expect(
      isPrimaryPrinterUnavailable({
        enabled: true,
        ready: false,
        isDirect: false,
        bridge: { enabled: true, status: "ONLINE" },
      }),
    ).toBe(true);

    const prompt = resolveFailoverDecision({
      unavailable: true,
      acceptFailover: false,
      fallbackPrinterId: "fb-1",
      fallbackPrinterName: "Backup Brady",
    });
    expect(prompt).toEqual({
      action: "prompt_failover",
      fallbackPrinterId: "fb-1",
      fallbackPrinterName: "Backup Brady",
    });

    // Mirror service error shape the UI can prompt on.
    if (prompt.action === "prompt_failover") {
      const err = new ForgeError(
        "BAD_REQUEST",
        `Primary printer unavailable. Failover to ${prompt.fallbackPrinterName} available — set acceptFailover to continue.`,
        {
          details: [
            {
              code: "PRINTER_FAILOVER_AVAILABLE",
              fallbackPrinterId: prompt.fallbackPrinterId,
              fallbackPrinterName: prompt.fallbackPrinterName,
            },
          ],
        },
      );
      expect(err.details).toEqual([
        {
          code: "PRINTER_FAILOVER_AVAILABLE",
          fallbackPrinterId: "fb-1",
          fallbackPrinterName: "Backup Brady",
        },
      ]);
    }

    expect(
      resolveFailoverDecision({
        unavailable: true,
        acceptFailover: true,
        fallbackPrinterId: "fb-1",
        fallbackPrinterName: "Backup Brady",
      }),
    ).toEqual({ action: "use_fallback", fallbackPrinterId: "fb-1" });

    expect(
      resolveFailoverDecision({
        unavailable: true,
        acceptFailover: true,
        fallbackPrinterId: null,
      }),
    ).toEqual({ action: "unavailable" });
  });
});
