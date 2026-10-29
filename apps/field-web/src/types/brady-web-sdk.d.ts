/**

 * Minimal TypeScript surface for Brady Web SDK 3.3.0.

 * showDiscoveredBleDevices takes no args (reads localStorage ownershipID);

 * returns boolean. Ownership id is written to localStorage on success.

 */

declare module "@bradycorporation/brady-web-sdk" {
  export type BradyPrinterUpdatesCallback = (mostRecentUpdates: string[] | null) => void;

  export default class BradySdk {
    constructor(callback: BradyPrinterUpdatesCallback, collectAnalytics?: boolean);

    /** SDK 3.3.0: no required args; returns boolean success. */

    showDiscoveredBleDevices(ownershipIdOrNull?: string | null): Promise<boolean | string | null>;

    isConnected(): boolean;

    getConnectionErrorMessage(): string;

    isSupportedBrowser(): Promise<boolean>;

    printBitmap(
      bitmap: HTMLImageElement,

      xOffset?: number,

      yOffset?: number,
    ): Promise<boolean>;

    setCopies(copies: number): void;

    setCutOption?(cutOption: number): void;

    disconnect(): Promise<boolean>;

    printerName?: string | null;

    printerModel?: string | null;

    status?: string | null;

    supplyName?: string | null;

    supplyWidth?: number | null;

    supplyHeight?: number | null;

    supplyDimensions?: string | null;

    isSupplyValid?: boolean | null;

    isRibbonValid?: boolean | null;

    /** True when the installed media is direct thermal (no ribbon). */
    supplyIsDirectThermal?: boolean | null;

    message?: string | null;

    messageTitle?: string | null;

    messageRemedy?: string | null;

    errorSeverity?: string | null;

    supplyRemainingPercentage?: number | null;

    ribbonRemainingPercent?: number | null;

    dotsPerInch?: number | null;
  }
}
