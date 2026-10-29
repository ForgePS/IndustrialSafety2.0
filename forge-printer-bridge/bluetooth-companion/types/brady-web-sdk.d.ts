/**
 * Minimal TypeScript surface for documented Brady Web SDK APIs only.
 * Source of truth: https://sdk.bradyid.com/web_api_documentation/
 *
 * Uncertainty: i4311-specific property availability is not exhaustively
 * documented on the Brady site; properties may be null/undefined until
 * connected and may remain undefined for unsupported models.
 */
declare module "brady-web-sdk" {
  export type BradyPrinterUpdatesCallback = (mostRecentUpdates: string[] | null) => void;

  export default class BradySdk {
    constructor(callback: BradyPrinterUpdatesCallback, collectAnalytics?: boolean);

    /** Opens Web Bluetooth discovery / reconnect. Returns ownership device id or null. */
    showDiscoveredBleDevices(ownershipIdOrNull: string | null): Promise<string | null>;

    isConnected(): boolean;
    getConnectionErrorMessage(): string;
    isSupportedBrowser(): Promise<boolean>;

    printBitmap(bitmap: HTMLImageElement, xOffset?: number, yOffset?: number): Promise<boolean>;

    setCopies(copies: number): void;
    disconnect(): Promise<boolean>;

    /** Documented for M211/M511 only — not used on i4311 BLE path. */
    feed?(): Promise<boolean>;
    /** Documented for M211/M511 only — not used on i4311 BLE path. */
    cut?(): Promise<boolean>;

    status?: string | null;
    printerName?: string | null;
    printerModel?: string | null;
    dotsPerInch?: number | null;
    batteryLevelPercentage?: number | null;
    supplyName?: string | null;
    isSupplyValid?: boolean | null;
    isRibbonValid?: boolean | null;
    message?: string | null;
    messageTitle?: string | null;
    messageRemedy?: string | null;
    errorSeverity?: string | null;
    supplyRemainingPercentage?: number | null;
    ribbonRemainingPercent?: number | null;
    firmwareVersionNumber?: string | null;
    isAcConnected?: boolean | null;
    printOptions?: {
      cutOption?: number;
      copies?: number;
      collate?: boolean;
    } | null;
  }
}

declare module "@bradycorporation/brady-web-sdk" {
  export { default } from "brady-web-sdk";
}

declare module "@bradycorporation/brady-web-sdk/dist/bundle.js" {
  export { default } from "brady-web-sdk";
}
