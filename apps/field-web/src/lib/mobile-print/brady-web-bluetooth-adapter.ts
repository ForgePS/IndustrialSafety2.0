/**
 * Brady Web Bluetooth adapter — wraps existing direct-brady-bluetooth helpers.
 * Satisfies ForgeNativePrintBridge until Capacitor CoreBluetooth ships for iOS.
 */
"use client";

import {
  ensureDirectBradyConnected,
  isDirectBluetoothSupported,
  pairDirectBradyPrinter,
  printPngViaDirectBluetooth,
  reconnectDirectBradyPrinter,
} from "@/lib/direct-brady-bluetooth";
import type { ForgeNativePrintBridge, MobilePrinterAdapter } from "./native-bridge";
import type {
  MobileBluetoothState,
  MobilePermissionResult,
  MobilePrintOptions,
  MobilePrintResult,
  MobilePrinterCapabilities,
  MobilePrinterDevice,
  MobilePrinterStatus,
  ScanOptions,
} from "./types";

const PROFILE = {
  vendor: "BRADY",
  model: "i4311",
  formats: ["PNG"] as Array<"PNG" | "ZPL" | "PDF">,
  profileId: "BRADY_I4311",
};

let lastPaired: MobilePrinterDevice | null = null;

function toDevice(partial: {
  deviceId: string;
  savedId?: string;
  name?: string;
}): MobilePrinterDevice {
  return {
    deviceId: partial.deviceId,
    name: partial.name || "Brady label printer",
    vendor: PROFILE.vendor,
    model: PROFILE.model,
    transport: "BLUETOOTH_BLE",
    discoveryState: "FOUND",
    bluetoothSavedId: partial.savedId || partial.deviceId,
  };
}

export function createBradyWebBluetoothBridge(): ForgeNativePrintBridge {
  return {
    async getBluetoothState(): Promise<MobileBluetoothState> {
      if (typeof window === "undefined") return "unsupported";
      if (!("bluetooth" in navigator)) return "unsupported";
      try {
        const supported = await isDirectBluetoothSupported();
        return supported ? "ready" : "unsupported";
      } catch {
        return "unknown";
      }
    },

    async requestBluetoothPermission(): Promise<MobilePermissionResult> {
      const state = await this.getBluetoothState();
      if (state === "unsupported") {
        return { status: "denied", canOpenSettings: true };
      }
      // Web Bluetooth permission is granted via the chooser during pair/scan.
      return { status: "prompt" };
    },

    async scanPrinters(_options?: ScanOptions): Promise<MobilePrinterDevice[]> {
      // Brady Web SDK uses an interactive chooser — treat pair as discover+select.
      const paired = await pairDirectBradyPrinter();
      lastPaired = toDevice({
        deviceId: paired.deviceId,
        savedId: paired.savedId,
        ...(paired.name ? { name: paired.name } : {}),
      });
      lastPaired.discoveryState = "AUTHORIZED";
      return [lastPaired];
    },

    async stopScan(): Promise<void> {
      /* Web SDK scan is interactive; nothing to cancel. */
    },

    async connectPrinter(deviceId: string): Promise<{ ok: boolean; message?: string }> {
      try {
        await reconnectDirectBradyPrinter(deviceId);
        if (lastPaired && lastPaired.deviceId === deviceId) {
          lastPaired.discoveryState = "CONNECTED";
        }
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Could not connect to printer.",
        };
      }
    },

    async disconnectPrinter(_deviceId: string): Promise<void> {
      if (lastPaired) lastPaired.discoveryState = "DISCONNECTED";
    },

    async getPrinterStatus(deviceId: string): Promise<MobilePrinterStatus> {
      const connected = Boolean(lastPaired && lastPaired.deviceId === deviceId);
      return {
        deviceId,
        connected,
        ready: connected,
        message: connected ? "Connected" : "Disconnected",
      };
    },

    async getCapabilities(_deviceId: string): Promise<MobilePrinterCapabilities> {
      return {
        formats: PROFILE.formats,
        profileId: PROFILE.profileId,
      };
    },

    async sendPrintPayload(
      deviceId: string,
      payload: string | Uint8Array,
      options?: MobilePrintOptions,
    ): Promise<MobilePrintResult> {
      try {
        if (typeof payload !== "string" || !payload.startsWith("data:image/")) {
          return {
            ok: false,
            errorCode: "FPM-1008",
            errorMessage: "Brady Web Bluetooth adapter expects a PNG data URL payload.",
            ...(options?.jobId ? { jobId: options.jobId } : {}),
          };
        }
        // Prefer gesture-time connect before transferring bytes.
        await ensureDirectBradyConnected(deviceId);
        await printPngViaDirectBluetooth({
          pngUrl: payload,
          copies: options?.copies ?? 1,
          savedId: deviceId,
        });
        return {
          ok: true,
          ...(options?.jobId ? { jobId: options.jobId } : {}),
        };
      } catch (err) {
        return {
          ok: false,
          errorCode: "FPM-1009",
          errorMessage: err instanceof Error ? err.message : "Print transfer failed.",
          ...(options?.jobId ? { jobId: options.jobId } : {}),
        };
      }
    },
  };
}

export const bradyWebBluetoothAdapter: MobilePrinterAdapter = {
  id: "brady-web-bluetooth",
  label: "Brady Web Bluetooth",
  supports(device) {
    return (
      device.transport === "BLUETOOTH_BLE" &&
      (!device.vendor || device.vendor.toUpperCase() === "BRADY")
    );
  },
  async discover(options) {
    return createBradyWebBluetoothBridge().scanPrinters(options);
  },
  async connect(deviceId) {
    const result = await createBradyWebBluetoothBridge().connectPrinter(deviceId);
    if (!result.ok) throw new Error(result.message || "Connect failed");
  },
  async disconnect(deviceId) {
    await createBradyWebBluetoothBridge().disconnectPrinter(deviceId);
  },
  async getStatus(deviceId) {
    return createBradyWebBluetoothBridge().getPrinterStatus(deviceId);
  },
  async getCapabilities(deviceId) {
    return createBradyWebBluetoothBridge().getCapabilities(deviceId);
  },
  async print(deviceId, payload, options) {
    return createBradyWebBluetoothBridge().sendPrintPayload(deviceId, payload, options);
  },
};

let activeBridge: ForgeNativePrintBridge | null = null;

/** Resolve the active native print bridge (Web Bluetooth today; Capacitor later). */
export function getMobilePrintBridge(): ForgeNativePrintBridge {
  if (!activeBridge) activeBridge = createBradyWebBluetoothBridge();
  return activeBridge;
}

/** Tests / future Capacitor wiring can override the active bridge. */
export function setMobilePrintBridge(bridge: ForgeNativePrintBridge | null): void {
  activeBridge = bridge;
}
