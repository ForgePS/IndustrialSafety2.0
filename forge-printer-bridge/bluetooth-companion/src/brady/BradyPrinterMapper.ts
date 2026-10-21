import type { PrinterInfoPayload } from "../../services/protocol";
import { capabilitiesForModel } from "./BradyCapabilities";
import type BradySdk from "brady-web-sdk";

/**
 * Maps documented BradySdk instance properties into Forge printer payloads.
 */
export class BradyPrinterMapper {
  static toPrinterInfo(
    sdk: BradySdk,
    ownershipDeviceId?: string | null
  ): PrinterInfoPayload {
    const model = sdk.printerModel ?? undefined;
    const name = sdk.printerName ?? model ?? "Brady Bluetooth Printer";

    return {
      id: ownershipDeviceId ?? undefined,
      displayName: name ?? undefined,
      model: model ?? undefined,
      manufacturer: "Brady",
      status: sdk.status ?? undefined,
      dpi: typeof sdk.dotsPerInch === "number" ? sdk.dotsPerInch : 300,
      batteryLevelPercentage:
        typeof sdk.batteryLevelPercentage === "number"
          ? sdk.batteryLevelPercentage
          : null,
      supplyName: sdk.supplyName ?? null,
      isSupplyValid: sdk.isSupplyValid ?? null,
      isRibbonValid: sdk.isRibbonValid ?? null,
      message: sdk.message ?? null,
      messageTitle: sdk.messageTitle ?? null,
      errorSeverity: sdk.errorSeverity ?? null,
      bluetoothDeviceId: ownershipDeviceId ?? null,
      capabilities: capabilitiesForModel(model),
    };
  }
}
