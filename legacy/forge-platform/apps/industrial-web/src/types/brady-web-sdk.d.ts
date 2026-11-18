/**
 * Minimal TypeScript surface for documented Brady Web SDK APIs only.
 * Source of truth: https://sdk.bradyid.com/web_api_documentation/
 */
declare module "@bradycorporation/brady-web-sdk" {
  export type BradyPrinterUpdatesCallback = (mostRecentUpdates: string[] | null) => void;

  export default class BradySdk {
    constructor(callback: BradyPrinterUpdatesCallback, collectAnalytics?: boolean);

    /** SDK 3.3.0 returns boolean success; ownership id is stored in localStorage. */
    showDiscoveredBleDevices(ownershipIdOrNull?: string | null): Promise<boolean | string | null>;
    isConnected(): boolean;
    getConnectionErrorMessage(): string;
    isSupportedBrowser(): Promise<boolean>;
    printBitmap(bitmap: HTMLImageElement, xOffset?: number, yOffset?: number): Promise<boolean>;
    /** One print job with one page per bitmap (i-series sends this as a single job). */
    printBitmaps(bitmaps: HTMLImageElement[], xOffset?: number, yOffset?: number): Promise<boolean>;
    setCopies(copies: number): void;
    setCutOption?(cutOption: number): void;
    disconnect(): Promise<boolean>;

    printerName?: string | null;
    printerModel?: string | null;
    status?: string | null;
    supplyName?: string | null;
    isSupplyValid?: boolean | null;
    isRibbonValid?: boolean | null;
    message?: string | null;
    messageTitle?: string | null;
    messageRemedy?: string | null;
    errorSeverity?: string | null;
    dotsPerInch?: number | null;
    supplyRemainingPercentage?: number | null;
    ribbonRemainingPercent?: number | null;
    supplyIsDirectThermal?: boolean | null;
  }
}
