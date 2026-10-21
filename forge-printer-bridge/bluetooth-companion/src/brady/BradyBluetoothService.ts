import type {
  BluetoothStatus,
  CompanionRequest,
  CompanionResponse,
  ConnectResultResponse,
  DiscoverResultResponse,
  ForgetResultResponse,
  PrinterInfoPayload,
  PrinterInfoResponse,
  PrintResultResponse,
  StatusResponse,
} from "../../services/protocol";
import { BradySdkAdapter } from "./BradySdkAdapter";
import { BradyErrorMapper } from "./BradyErrorMapper";

export type StatusChangeHandler = (
  status: BluetoothStatus,
  printer: PrinterInfoPayload | null
) => void;

const RECONNECT_BACKOFF_MS = [
  5_000,
  15_000,
  30_000,
  60_000,
  5 * 60_000,
] as const;

/**
 * High-level Brady Bluetooth service used by the renderer.
 * Wraps only documented Brady Web SDK methods via BradySdkAdapter.
 */
export class BradyBluetoothService {
  private readonly adapter = new BradySdkAdapter();
  private status: BluetoothStatus = "NOT_CONFIGURED";
  private printer: PrinterInfoPayload | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private reconnectEnabled = false;
  private cancelRequested = false;
  private readonly statusHandlers = new Set<StatusChangeHandler>();

  initialize(): void {
    this.adapter.initialize(false);
    this.adapter.onUpdate((printer) => {
      this.printer = printer;
      if (this.adapter.isConnected()) {
        const mapped = BradyErrorMapper.fromPrinterState({
          message: printer?.message,
          messageTitle: printer?.messageTitle,
          errorSeverity: printer?.errorSeverity,
          isSupplyValid: printer?.isSupplyValid,
          isRibbonValid: printer?.isRibbonValid,
          status: printer?.status,
        });
        if (mapped) {
          this.setStatus("PRINTER_ERROR", printer);
        } else {
          this.setStatus("READY", printer);
        }
      }
    });
  }

  onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status, this.printer);
    return () => this.statusHandlers.delete(handler);
  }

  getStatus(): BluetoothStatus {
    return this.status;
  }

  getPrinter(): PrinterInfoPayload | null {
    return this.printer;
  }

  private setStatus(
    status: BluetoothStatus,
    printer: PrinterInfoPayload | null = this.printer
  ): void {
    this.status = status;
    this.printer = printer;
    for (const handler of this.statusHandlers) {
      handler(status, printer);
    }
  }

  async handlePipeRequest(
    request: CompanionRequest
  ): Promise<CompanionResponse> {
    switch (request.type) {
      case "BLUETOOTH_STATUS":
        return this.statusResponse(request.requestId);
      case "DISCOVER":
        return this.discover(request.requestId);
      case "CONNECT": {
        const connectReq = request as {
          deviceId?: string | null;
          savedId?: string | null;
          requestId?: string;
        };
        const ownership =
          connectReq.savedId ?? connectReq.deviceId ?? null;
        const result = await this.connect(ownership, connectReq.requestId);
        if (ownership) {
          this.adapter.setOwnershipDeviceId(ownership);
          this.reconnectEnabled = true;
          if (!result.success) {
            // Keep phone-like retry without immediately duplicating the connect attempt.
            this.scheduleReconnect(ownership);
          }
        }
        return result;
      }
      case "DISCONNECT":
        return this.disconnect(request.requestId);
      case "PRINT":
        return this.print(request as {
          type: "PRINT";
          jobId: string;
          artifactPath: string;
          copies?: number;
          requestId?: string;
        });
      case "CANCEL":
        this.cancelRequested = true;
        return this.statusResponse(request.requestId);
      case "GET_PRINTER_INFO":
        return this.printerInfo(request.requestId);
      case "FORGET":
        return this.forget(request.requestId);
      case "HEARTBEAT":
        return {
          type: "HEARTBEAT_RESULT",
          ok: true,
          status: this.status,
          requestId: request.requestId,
        };
      default:
        return {
          type: "ERROR",
          code: "INVALID_REQUEST",
          message: `Unsupported request type: ${(request as { type: string }).type}`,
          requestId: (request as { requestId?: string }).requestId,
        };
    }
  }

  private statusResponse(requestId?: string): StatusResponse {
    return {
      type: "STATUS",
      status: this.status,
      printer: this.printer,
      requestId,
    };
  }

  private printerInfo(requestId?: string): PrinterInfoResponse {
    return {
      type: "PRINTER_INFO",
      status: this.status,
      printer: this.adapter.getPrinterInfo(),
      requestId,
    };
  }

  async discover(requestId?: string): Promise<DiscoverResultResponse | CompanionResponse> {
    const supported = await this.adapter.isSupportedBrowser();
    if (!supported) {
      this.setStatus("PERMISSION_REQUIRED", null);
      return {
        type: "ERROR",
        code: "BLUETOOTH_PERMISSION_REQUIRED",
        message: "Web Bluetooth is not supported in this Chromium session.",
        requestId,
      };
    }

    this.setStatus("SCANNING", this.printer);
    this.cancelRequested = false;

    try {
      // Fresh discovery: pass null ownership (documented for models that allow it).
      const deviceId = await this.adapter.showDiscoveredBleDevices(null);
      if (!deviceId) {
        const mapped = BradyErrorMapper.fromConnectionFailure(
          this.adapter.getConnectionErrorMessage()
        );
        this.setStatus(
          mapped.code === "BLUETOOTH_PERMISSION_REQUIRED"
            ? "PERMISSION_REQUIRED"
            : "USER_ACTION_REQUIRED",
          null
        );
        return {
          type: "ERROR",
          code: mapped.code,
          message: mapped.message,
          requestId,
        };
      }

      this.printer = this.adapter.getPrinterInfo();
      this.setStatus("CONNECTED", this.printer);
      return {
        type: "DISCOVER_RESULT",
        devices: [
          {
            deviceId,
            name: this.printer?.displayName,
          },
        ],
        requestId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus("USER_ACTION_REQUIRED", null);
      return {
        type: "ERROR",
        code: "BLUETOOTH_DEVICE_NOT_FOUND",
        message,
        requestId,
      };
    }
  }

  async connect(
    deviceId: string | null,
    requestId?: string
  ): Promise<ConnectResultResponse> {
    const supported = await this.adapter.isSupportedBrowser();
    if (!supported) {
      this.setStatus("PERMISSION_REQUIRED", null);
      return {
        type: "CONNECT_RESULT",
        success: false,
        code: "BLUETOOTH_PERMISSION_REQUIRED",
        message: "Web Bluetooth is not supported in this Chromium session.",
        requestId,
      };
    }

    this.setStatus("PAIRING", this.printer);

    try {
      const ownership =
        deviceId ?? this.adapter.getOwnershipDeviceId() ?? null;
      const connectedId =
        await this.adapter.showDiscoveredBleDevices(ownership);

      if (!connectedId || !this.adapter.isConnected()) {
        const mapped = BradyErrorMapper.fromConnectionFailure(
          this.adapter.getConnectionErrorMessage()
        );
        this.setStatus(
          mapped.code === "BLUETOOTH_PERMISSION_REQUIRED"
            ? "PERMISSION_REQUIRED"
            : "DISCONNECTED",
          null
        );
        return {
          type: "CONNECT_RESULT",
          success: false,
          deviceId: null,
          code: mapped.code,
          message: mapped.message,
          requestId,
        };
      }

      this.printer = this.adapter.getPrinterInfo();
      this.reconnectAttempt = 0;
      this.setStatus("READY", this.printer);
      return {
        type: "CONNECT_RESULT",
        success: true,
        deviceId: connectedId,
        printer: this.printer,
        requestId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus("DISCONNECTED", null);
      return {
        type: "CONNECT_RESULT",
        success: false,
        code: "BLUETOOTH_DISCONNECTED",
        message,
        requestId,
      };
    }
  }

  async disconnect(requestId?: string): Promise<CompanionResponse> {
    this.stopReconnectLoop();
    try {
      const ok = await this.adapter.disconnect();
      this.setStatus("DISCONNECTED", this.printer);
      return {
        type: "DISCONNECT_RESULT",
        success: ok,
        requestId,
      };
    } catch (err) {
      return {
        type: "ERROR",
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        requestId,
      };
    }
  }

  async forget(requestId?: string): Promise<ForgetResultResponse> {
    this.stopReconnectLoop();
    try {
      if (this.adapter.isConnected()) {
        await this.adapter.disconnect();
      }
    } catch {
      // best-effort
    }
    this.adapter.setOwnershipDeviceId(null);
    this.printer = null;
    this.setStatus("NOT_CONFIGURED", null);
    return { type: "FORGET_RESULT", success: true, requestId };
  }

  async print(request: {
    jobId: string;
    artifactPath: string;
    copies?: number;
    requestId?: string;
  }): Promise<PrintResultResponse> {
    this.cancelRequested = false;

    if (!this.adapter.isConnected()) {
      const mapped = BradyErrorMapper.disconnected();
      this.setStatus("DISCONNECTED", this.printer);
      return {
        type: "PRINT_RESULT",
        jobId: request.jobId,
        success: false,
        code: mapped.code,
        message: mapped.message,
        requestId: request.requestId,
      };
    }

    const stateErr = BradyErrorMapper.fromPrinterState({
      message: this.printer?.message,
      messageTitle: this.printer?.messageTitle,
      errorSeverity: this.printer?.errorSeverity,
      isSupplyValid: this.printer?.isSupplyValid,
      isRibbonValid: this.printer?.isRibbonValid,
      status: this.printer?.status,
    });
    if (stateErr) {
      this.setStatus("PRINTER_ERROR", this.printer);
      return {
        type: "PRINT_RESULT",
        jobId: request.jobId,
        success: false,
        code: stateErr.code,
        message: stateErr.message,
        requestId: request.requestId,
      };
    }

    this.setStatus("PRINTING", this.printer);

    try {
      const api = window.forgeCompanion;
      const dataUrl = await api.readArtifactAsDataUrl(request.artifactPath);
      const img = await loadImageElement(dataUrl);

      if (this.cancelRequested) {
        this.setStatus("READY", this.printer);
        return {
          type: "PRINT_RESULT",
          jobId: request.jobId,
          success: false,
          code: "PRINT_FAILED",
          message: "Print cancelled.",
          requestId: request.requestId,
        };
      }

      const copies =
        typeof request.copies === "number" && request.copies > 0
          ? Math.floor(request.copies)
          : 1;
      this.adapter.setCopies(copies);

      // Flatten to opaque B&W so thermal printers get a clean bitmap.
      const printable = await toBradyPrintableImage(img);
      const ok = await this.adapter.printBitmap(printable, 0, 0);
      if (!ok) {
        const mapped = BradyErrorMapper.printFailed(
          "BradySdk.printBitmap returned false (often means no printer connected)."
        );
        this.setStatus(
          this.adapter.isConnected() ? "PRINTER_ERROR" : "DISCONNECTED",
          this.printer
        );
        return {
          type: "PRINT_RESULT",
          jobId: request.jobId,
          success: false,
          code: mapped.code,
          message: mapped.message,
          requestId: request.requestId,
        };
      }

      this.setStatus("READY", this.adapter.getPrinterInfo());
      return {
        type: "PRINT_RESULT",
        jobId: request.jobId,
        success: true,
        requestId: request.requestId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus(
        this.adapter.isConnected() ? "PRINTER_ERROR" : "DISCONNECTED",
        this.printer
      );
      return {
        type: "PRINT_RESULT",
        jobId: request.jobId,
        success: false,
        code: "PRINT_FAILED",
        message,
        requestId: request.requestId,
      };
    }
  }

  /**
   * Startup / tray reconnect: call showDiscoveredBleDevices(savedId) with backoff.
   * Web Bluetooth may still require a user gesture — surface USER_ACTION_REQUIRED.
   */
  startReconnectLoop(savedOwnershipId: string): void {
    this.reconnectEnabled = true;
    this.reconnectAttempt = 0;
    this.adapter.setOwnershipDeviceId(savedOwnershipId);
    void this.reconnectOnce(savedOwnershipId);
  }

  stopReconnectLoop(): void {
    this.reconnectEnabled = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(savedOwnershipId: string): void {
    if (!this.reconnectEnabled) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    const delay =
      RECONNECT_BACKOFF_MS[
        Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)
      ];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      void this.reconnectOnce(savedOwnershipId);
    }, delay);
  }

  private async reconnectOnce(savedOwnershipId: string): Promise<void> {
    if (!this.reconnectEnabled) return;
    if (this.adapter.isConnected()) {
      this.setStatus("READY", this.adapter.getPrinterInfo());
      return;
    }

    this.setStatus("SCANNING", this.printer);

    try {
      const id = await this.adapter.showDiscoveredBleDevices(savedOwnershipId);
      if (id && this.adapter.isConnected()) {
        this.reconnectAttempt = 0;
        this.setStatus("READY", this.adapter.getPrinterInfo());
        return;
      }

      const errMsg = this.adapter.getConnectionErrorMessage();
      if (
        errMsg.toLowerCase().includes("gesture") ||
        errMsg.toLowerCase().includes("user")
      ) {
        this.setStatus("USER_ACTION_REQUIRED", this.printer);
      } else {
        this.setStatus("DISCONNECTED", this.printer);
      }
    } catch {
      this.setStatus("USER_ACTION_REQUIRED", this.printer);
    }

    this.scheduleReconnect(savedOwnershipId);
  }
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Failed to decode print artifact as an image."));
    img.src = dataUrl;
  });
}

async function toBradyPrintableImage(
  source: HTMLImageElement
): Promise<HTMLImageElement> {
  const width = source.naturalWidth;
  const height = source.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not prepare label bitmap for Brady printing.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grey = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    const v = grey < 180 ? 0 : 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return loadImageElement(canvas.toDataURL("image/png"));
}
