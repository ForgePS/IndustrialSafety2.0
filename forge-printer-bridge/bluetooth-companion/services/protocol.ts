/**
 * Shared JSON-lines IPC protocol for Forge Printer Bridge ↔ Bluetooth Companion.
 * Pipe: \\.\pipe\ForgePrinterBridgeBluetooth (main process only — never TCP).
 */

export const BLUETOOTH_NAMED_PIPE = String.raw`\\.\pipe\ForgePrinterBridgeBluetooth`;

export const PROGRAM_DATA_BLUETOOTH_DIR =
  String.raw`C:\ProgramData\Forge Public Safety\Printer Bridge\Bluetooth`;

export type CompanionRequestType =
  | "BLUETOOTH_STATUS"
  | "DISCOVER"
  | "CONNECT"
  | "DISCONNECT"
  | "PRINT"
  | "CANCEL"
  | "GET_PRINTER_INFO"
  | "HEARTBEAT"
  | "FORGET";

export type BluetoothStatus =
  | "NOT_CONFIGURED"
  | "SCANNING"
  | "PAIRING"
  | "CONNECTED"
  | "READY"
  | "PRINTING"
  | "DISCONNECTED"
  | "OUT_OF_RANGE"
  | "PRINTER_ERROR"
  | "PERMISSION_REQUIRED"
  | "USER_ACTION_REQUIRED";

export type ForgeBluetoothErrorCode =
  | "BLUETOOTH_DISCONNECTED"
  | "BLUETOOTH_PERMISSION_REQUIRED"
  | "BLUETOOTH_DEVICE_NOT_FOUND"
  | "BLUETOOTH_USER_CANCELLED"
  | "PRINTER_BUSY"
  | "MEDIA_MISSING"
  | "RIBBON_MISSING"
  | "PRINT_FAILED"
  | "PRINTER_ERROR"
  | "NOT_SUPPORTED"
  | "INVALID_REQUEST"
  | "COMPANION_BUSY"
  | "INTERNAL_ERROR";

export interface PrinterInfoPayload {
  id?: string;
  displayName?: string;
  model?: string;
  manufacturer?: string;
  status?: string;
  dpi?: number;
  batteryLevelPercentage?: number | null;
  supplyName?: string | null;
  isSupplyValid?: boolean | null;
  isRibbonValid?: boolean | null;
  message?: string | null;
  messageTitle?: string | null;
  errorSeverity?: string | null;
  bluetoothDeviceId?: string | null;
  capabilities?: PrinterCapabilitiesPayload;
}

export interface PrinterCapabilitiesPayload {
  print: boolean;
  bitmapPrint: boolean;
  multipleCopies: boolean;
  cut: boolean;
  feed: boolean;
  batteryStatus: boolean;
  dpi: number[];
}

export interface DiscoveredDevicePayload {
  deviceId: string;
  name?: string;
}

export interface CompanionRequestBase {
  type: CompanionRequestType;
  requestId?: string;
}

export interface PrintRequest extends CompanionRequestBase {
  type: "PRINT";
  jobId: string;
  printerId?: string;
  artifactPath: string;
  copies?: number;
}

export interface ConnectRequest extends CompanionRequestBase {
  type: "CONNECT";
  /** Brady SDK ownership / reconnect id when known. */
  deviceId?: string | null;
  /** Alias for ownership device id (service / cloud use savedId). */
  savedId?: string | null;
}

export interface DiscoverRequest extends CompanionRequestBase {
  type: "DISCOVER";
}

export type CompanionRequest =
  | CompanionRequestBase
  | PrintRequest
  | ConnectRequest
  | DiscoverRequest;

export interface StatusResponse {
  type: "STATUS";
  status: BluetoothStatus;
  printer?: PrinterInfoPayload | null;
  requestId?: string;
  companionVersion?: string;
}

export interface PrintResultResponse {
  type: "PRINT_RESULT";
  jobId: string;
  success: boolean;
  message?: string;
  code?: ForgeBluetoothErrorCode;
  requestId?: string;
}

export interface ErrorResponse {
  type: "ERROR";
  code: ForgeBluetoothErrorCode;
  message: string;
  requestId?: string;
}

export interface DiscoverResultResponse {
  type: "DISCOVER_RESULT";
  devices: DiscoveredDevicePayload[];
  requestId?: string;
}

export interface ConnectResultResponse {
  type: "CONNECT_RESULT";
  success: boolean;
  deviceId?: string | null;
  printer?: PrinterInfoPayload | null;
  message?: string;
  code?: ForgeBluetoothErrorCode;
  requestId?: string;
}

export interface HeartbeatResponse {
  type: "HEARTBEAT_RESULT";
  ok: true;
  status: BluetoothStatus;
  requestId?: string;
  uptimeMs?: number;
}

export interface PrinterInfoResponse {
  type: "PRINTER_INFO";
  printer?: PrinterInfoPayload | null;
  status: BluetoothStatus;
  requestId?: string;
}

export interface ForgetResultResponse {
  type: "FORGET_RESULT";
  success: boolean;
  requestId?: string;
}

export interface DisconnectResultResponse {
  type: "DISCONNECT_RESULT";
  success: boolean;
  requestId?: string;
}

export type CompanionResponse =
  | StatusResponse
  | PrintResultResponse
  | ErrorResponse
  | DiscoverResultResponse
  | ConnectResultResponse
  | HeartbeatResponse
  | PrinterInfoResponse
  | ForgetResultResponse
  | DisconnectResultResponse;

export function parseJsonLine(line: string): CompanionRequest | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as CompanionRequest;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function toJsonLine(payload: CompanionResponse | CompanionRequest): string {
  return `${JSON.stringify(payload)}\n`;
}
