/**
 * UI ↔ native print bridge contract.
 *
 * Production iOS should eventually implement this via Capacitor / CoreBluetooth.
 * Field Version currently provides a Web Bluetooth Brady adapter that satisfies
 * the same contract so the Mobile Print Manager UI stays transport-agnostic.
 */
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

export type ForgeNativePrintBridge = {
  getBluetoothState(): Promise<MobileBluetoothState>;
  requestBluetoothPermission(): Promise<MobilePermissionResult>;
  scanPrinters(options?: ScanOptions): Promise<MobilePrinterDevice[]>;
  stopScan(): Promise<void>;
  connectPrinter(deviceId: string): Promise<{ ok: boolean; message?: string }>;
  disconnectPrinter(deviceId: string): Promise<void>;
  getPrinterStatus(deviceId: string): Promise<MobilePrinterStatus>;
  getCapabilities(deviceId: string): Promise<MobilePrinterCapabilities>;
  /**
   * Send a print payload. For Brady Web Bluetooth this is typically a PNG data URL
   * or bytes; native ZPL adapters may accept raw ZPL strings.
   */
  sendPrintPayload(
    deviceId: string,
    payload: string | Uint8Array,
    options?: MobilePrintOptions,
  ): Promise<MobilePrintResult>;
};

export type MobilePrinterAdapter = {
  id: string;
  label: string;
  supports(device: MobilePrinterDevice): boolean;
  discover(options?: ScanOptions): Promise<MobilePrinterDevice[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  getStatus(deviceId: string): Promise<MobilePrinterStatus>;
  getCapabilities(deviceId: string): Promise<MobilePrinterCapabilities>;
  print(
    deviceId: string,
    payload: string | Uint8Array,
    options?: MobilePrintOptions,
  ): Promise<MobilePrintResult>;
};
