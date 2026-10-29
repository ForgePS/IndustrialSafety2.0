/**
 * Shared Mobile Print Manager types (Field Version).
 * Native Capacitor adapters and Web Bluetooth adapters both speak this model.
 */

export type MobileBluetoothState =
  "unsupported" | "powered_off" | "unauthorized" | "ready" | "unknown";

export type MobilePermissionResult =
  { status: "granted" } | { status: "denied"; canOpenSettings: boolean } | { status: "prompt" };

export type MobilePrinterDiscoveryState =
  | "SCANNING"
  | "FOUND"
  | "AUTHORIZED"
  | "UNAUTHORIZED"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "UNAVAILABLE"
  | "ERROR";

export type MobilePrinterDevice = {
  /** Platform-local identifier (Web Bluetooth device id / native UUID). */
  deviceId: string;
  name: string;
  vendor?: string;
  model?: string;
  transport:
    "BLUETOOTH_BLE" | "BLUETOOTH_CLASSIC" | "NETWORK" | "CLOUD_QUEUE" | "FORGE_PRINT_BRIDGE";
  signalStrength?: "strong" | "good" | "weak" | "very_weak";
  discoveryState: MobilePrinterDiscoveryState;
  /** Linked Forge printer record when already registered. */
  forgePrinterId?: string;
  bluetoothSavedId?: string;
};

export type MobilePrinterStatus = {
  deviceId: string;
  connected: boolean;
  ready: boolean;
  message?: string;
};

export type MobilePrinterCapabilities = {
  formats: Array<"PNG" | "ZPL" | "PDF">;
  maxWidthInches?: number;
  maxHeightInches?: number;
  profileId?: string;
};

export type MobilePrintOptions = {
  copies?: number;
  widthInches?: number;
  heightInches?: number;
  jobId?: string;
};

export type MobilePrintResult = {
  ok: boolean;
  jobId?: string;
  errorCode?: string;
  errorMessage?: string;
  /** Transfer finished but printer confirmation unknown. */
  resultUnknown?: boolean;
};

export type ScanOptions = {
  timeoutMs?: number;
  /** Prefer known Brady / label printers only. */
  supportedOnly?: boolean;
};
