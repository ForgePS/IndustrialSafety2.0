import type {
  ForgeBluetoothErrorCode,
} from "../../services/protocol";

export interface MappedBradyError {
  code: ForgeBluetoothErrorCode;
  message: string;
}

/**
 * Maps Brady SDK / Web Bluetooth failure signals to Forge error codes.
 * Only uses documented SDK surfaces (connection error string, printer
 * message/title/severity, isConnected, printBitmap boolean).
 */
export class BradyErrorMapper {
  static fromConnectionFailure(connectionErrorMessage: string): MappedBradyError {
    const msg = (connectionErrorMessage || "").trim();
    const lower = msg.toLowerCase();

    if (!msg) {
      return {
        code: "BLUETOOTH_DEVICE_NOT_FOUND",
        message: "Bluetooth connection failed or was cancelled.",
      };
    }

    if (
      lower.includes("permission") ||
      lower.includes("not allowed") ||
      lower.includes("denied")
    ) {
      return {
        code: "BLUETOOTH_PERMISSION_REQUIRED",
        message: msg,
      };
    }

    if (
      lower.includes("cancel") ||
      lower.includes("user gesture") ||
      lower.includes("chooser")
    ) {
      return {
        code: "BLUETOOTH_USER_CANCELLED",
        message: msg,
      };
    }

    if (
      lower.includes("not found") ||
      lower.includes("no device") ||
      lower.includes("unavailable")
    ) {
      return {
        code: "BLUETOOTH_DEVICE_NOT_FOUND",
        message: msg,
      };
    }

    return {
      code: "BLUETOOTH_DISCONNECTED",
      message: msg,
    };
  }

  static fromPrinterState(input: {
    message?: string | null;
    messageTitle?: string | null;
    errorSeverity?: string | null;
    isSupplyValid?: boolean | null;
    isRibbonValid?: boolean | null;
    status?: string | null;
  }): MappedBradyError | null {
    const combined = `${input.messageTitle ?? ""} ${input.message ?? ""} ${input.status ?? ""}`.toLowerCase();

    if (
      input.isSupplyValid === false ||
      (combined.includes("supply") && combined.includes("missing"))
    ) {
      return {
        code: "MEDIA_MISSING",
        message: input.message || input.messageTitle || "Media / supply missing or invalid.",
      };
    }

    if (input.isRibbonValid === false || combined.includes("ribbon")) {
      return {
        code: "RIBBON_MISSING",
        message: input.message || input.messageTitle || "Ribbon missing or invalid.",
      };
    }

    if (combined.includes("busy") || combined.includes("printing")) {
      return {
        code: "PRINTER_BUSY",
        message: input.message || input.messageTitle || "Printer is busy.",
      };
    }

    const severity = (input.errorSeverity ?? "").toLowerCase();
    if (severity.includes("error") || combined.includes("error")) {
      return {
        code: "PRINTER_ERROR",
        message: input.message || input.messageTitle || "Printer reported an error.",
      };
    }

    return null;
  }

  static printFailed(detail?: string): MappedBradyError {
    return {
      code: "PRINT_FAILED",
      message: detail || "printBitmap returned false or threw.",
    };
  }

  static disconnected(detail?: string): MappedBradyError {
    return {
      code: "BLUETOOTH_DISCONNECTED",
      message: detail || "Brady printer is not connected over Bluetooth.",
    };
  }
}
