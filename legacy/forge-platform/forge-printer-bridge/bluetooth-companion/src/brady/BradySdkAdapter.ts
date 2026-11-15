import BradySdk from "brady-web-sdk";
import { BradyPrinterMapper } from "./BradyPrinterMapper";
import type { PrinterInfoPayload } from "../../services/protocol";

export type BradySdkUpdateListener = (
  printer: PrinterInfoPayload | null,
  mostRecentUpdates: string[] | null,
) => void;

/**
 * Thin adapter over documented Brady Web SDK APIs only.
 * Do not add undocumented BLE GATT / proprietary protocol calls.
 */
export class BradySdkAdapter {
  private sdk: BradySdk | null = null;
  private ownershipDeviceId: string | null = null;
  private readonly listeners = new Set<BradySdkUpdateListener>();

  initialize(collectAnalytics = false): void {
    if (this.sdk) return;
    this.sdk = new BradySdk((mostRecentUpdates) => {
      const printer = this.sdk
        ? BradyPrinterMapper.toPrinterInfo(this.sdk, this.ownershipDeviceId)
        : null;
      for (const listener of this.listeners) {
        listener(printer, mostRecentUpdates);
      }
    }, collectAnalytics);
  }

  onUpdate(listener: BradySdkUpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSdk(): BradySdk {
    if (!this.sdk) {
      throw new Error("BradySdkAdapter.initialize() must be called first.");
    }
    return this.sdk;
  }

  getOwnershipDeviceId(): string | null {
    return this.ownershipDeviceId;
  }

  setOwnershipDeviceId(id: string | null): void {
    this.ownershipDeviceId = id;
  }

  async isSupportedBrowser(): Promise<boolean> {
    return this.getSdk().isSupportedBrowser();
  }

  isConnected(): boolean {
    return this.getSdk().isConnected();
  }

  getConnectionErrorMessage(): string {
    return this.getSdk().getConnectionErrorMessage();
  }

  /**
   * Documented reconnect / pair entry point.
   * Brady Web SDK 3.3.0 returns boolean success and stores the ownership id in
   * localStorage (`ownershipID`). Pass a saved id by writing that key first.
   */
  async showDiscoveredBleDevices(ownershipIdOrNull: string | null): Promise<string | null> {
    if (ownershipIdOrNull) {
      localStorage.setItem("ownershipID", ownershipIdOrNull);
    }
    const ok = await this.getSdk().showDiscoveredBleDevices();
    if (!ok || !this.getSdk().isConnected()) {
      return null;
    }
    const stored = localStorage.getItem("ownershipID")?.trim() || null;
    if (stored) {
      this.ownershipDeviceId = stored;
    }
    return stored;
  }

  async printBitmap(img: HTMLImageElement, xOffset = 0, yOffset = 0): Promise<boolean> {
    return this.getSdk().printBitmap(img, xOffset, yOffset);
  }

  setCopies(n: number): void {
    this.getSdk().setCopies(n);
  }

  async disconnect(): Promise<boolean> {
    const ok = await this.getSdk().disconnect();
    return ok;
  }

  getPrinterInfo(): PrinterInfoPayload | null {
    if (!this.sdk || !this.sdk.isConnected()) {
      return this.sdk ? BradyPrinterMapper.toPrinterInfo(this.sdk, this.ownershipDeviceId) : null;
    }
    return BradyPrinterMapper.toPrinterInfo(this.sdk, this.ownershipDeviceId);
  }
}
