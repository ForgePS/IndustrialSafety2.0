/**
 * Client-only Brady Web SDK helpers for Direct Bluetooth printing.
 * Mirrors Brady's official WebSdkDemo: connect on user gesture, then
 * printBitmap(HTMLImageElement) from a live blob URL.
 * Uses documented Brady Web SDK APIs only — never invent BLE GATT calls.
 */
"use client";

type BradySdkModule = typeof import("@bradycorporation/brady-web-sdk");
type BradySdkInstance = InstanceType<BradySdkModule["default"]>;

let sdkPromise: Promise<BradySdkInstance> | null = null;
let ownershipDeviceId: string | null = null;

function assertBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("Brady Web Bluetooth is only available in the browser.");
  }
}

async function getSdk(): Promise<BradySdkInstance> {
  assertBrowser();
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const mod = await import("@bradycorporation/brady-web-sdk");
      const BradySdk = mod.default;
      return new BradySdk(() => {
        /* status is read on demand from SDK properties */
      }, false);
    })();
  }
  return sdkPromise;
}

/** Brady fills message fields with i18n keys like "PrinterStatus_CutError_Title". */
function humanizeBradyText(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  if (!v.startsWith("PrinterStatus_")) return v;
  if (v.startsWith("PrinterStatus_Initialized")) return "";
  return v
    .replace(/^PrinterStatus_/, "")
    .replace(/_(Title|Remedy)$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

function bradyStatusParts(sdk: BradySdkInstance): string[] {
  const parts: string[] = [];
  for (const raw of [sdk.messageTitle, sdk.message, sdk.messageRemedy]) {
    const text = humanizeBradyText(raw);
    if (text && !parts.includes(text)) parts.push(text);
  }
  return parts;
}

function describeBradyPrinterError(sdk: BradySdkInstance, fallback: string): string {
  // isSupplyValid / isRibbonValid are sticky false after reconnect (and always false on
  // direct-thermal media), so only Brady's own message fields are trustworthy here.
  const parts = bradyStatusParts(sdk);
  const connection = sdk.getConnectionErrorMessage()?.trim();
  if (connection) parts.push(connection);
  return parts.length ? parts.join(" ") : fallback;
}

export type BradyPrinterAlert = {
  /** Stable identity so a batch can ignore an alert that was already showing at start. */
  key: string;
  text: string;
  /** True when the printer reports an error state that stops printing. */
  blocking: boolean;
};

/**
 * Printer-side status (out of labels, jam, cover open, …). Brady i-series printBitmap
 * resolves once bytes are written, not when the label prints, so batches must poll this.
 */
export async function readDirectBradyPrinterAlert(): Promise<BradyPrinterAlert | null> {
  const sdk = await getSdk();
  if (!sdk.isConnected()) {
    return { key: "disconnected", text: "Bluetooth to the Brady dropped.", blocking: true };
  }
  const status = String(sdk.status ?? "").trim();
  const severity = String(sdk.errorSeverity ?? "").trim();
  const parts = bradyStatusParts(sdk);
  if (!parts.length) return null;
  const level = `${status} ${severity}`.toLowerCase().trim();
  if (level === "" || /^connected( unknown)?$/.test(level)) return null;
  // i-series severity strings come straight from the printer and are not documented,
  // so anything that is not clearly informational counts as a stop.
  const informational = [status, severity].every((v) =>
    /^(|connected|none|unknown|info|information|informational|ok|0|warn|warning)$/i.test(v),
  );
  return {
    key: [status, severity, ...parts].join("|"),
    text: parts.join(" "),
    blocking: !informational,
  };
}

function finitePercent(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export type BradyPrinterSnapshot = {
  connected: boolean;
  model: string | null;
  status: string | null;
  severity: string | null;
  text: string | null;
  supplyRemainingPct: number | null;
  ribbonRemainingPct: number | null;
  directThermal: boolean | null;
};

/** Raw printer state for batch telemetry and supply-out detection. */
export async function readDirectBradyPrinterSnapshot(): Promise<BradyPrinterSnapshot> {
  const sdk = await getSdk();
  const parts = bradyStatusParts(sdk);
  return {
    connected: sdk.isConnected(),
    model: String(sdk.printerModel ?? "").trim() || null,
    status: String(sdk.status ?? "").trim() || null,
    severity: String(sdk.errorSeverity ?? "").trim() || null,
    text: parts.length ? parts.join(" ") : null,
    supplyRemainingPct: finitePercent(sdk.supplyRemainingPercentage),
    ribbonRemainingPct: finitePercent(sdk.ribbonRemainingPercent),
    directThermal:
      typeof sdk.supplyIsDirectThermal === "boolean" ? sdk.supplyIsDirectThermal : null,
  };
}


/**
 * Cheap capability check — does not load the Brady Web SDK bundle.
 * Full SDK support is re-checked inside pair/print helpers.
 */
export async function isDirectBluetoothSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    if (!("bluetooth" in navigator)) return false;
    const sdk = await getSdk();
    return await sdk.isSupportedBrowser();
  } catch {
    return "bluetooth" in navigator;
  }
}

/**
 * Brady Web SDK 3.3.0 `showDiscoveredBleDevices` returns a boolean (not the
 * ownership string documented in older samples). The real ID is written to
 * localStorage key `ownershipID` on success.
 */
function readBradyOwnershipId(): string | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem("ownershipID");
  const id = typeof raw === "string" ? raw.trim() : "";
  return id || null;
}

function writeBradyOwnershipId(id: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem("ownershipID", id);
}

async function discoverAndConnect(preferredOwnershipId?: string | null): Promise<string> {
  const sdk = await getSdk();
  if (preferredOwnershipId?.trim()) {
    writeBradyOwnershipId(preferredOwnershipId.trim());
  }

  const ok = await sdk.showDiscoveredBleDevices();
  if (!ok || !sdk.isConnected()) {
    const msg = sdk.getConnectionErrorMessage() || "No Brady printer selected.";
    throw new Error(msg);
  }

  const ownershipId = readBradyOwnershipId();
  if (!ownershipId) {
    throw new Error(
      "Brady connected but did not return an ownership ID. Disconnect and pair again.",
    );
  }
  ownershipDeviceId = ownershipId;
  return ownershipId;
}

export async function pairDirectBradyPrinter(): Promise<{
  deviceId: string;
  savedId: string;
  name?: string;
}> {
  const sdk = await getSdk();
  const supported = await sdk.isSupportedBrowser();
  if (!supported) {
    throw new Error(
      "Web Bluetooth is not supported in this browser. Android tablets: use Chrome or Edge. iPad and iPhone: open this page in the Bluefy browser (Safari and Chrome on iOS cannot use Bluetooth).",
    );
  }

  const deviceId = await discoverAndConnect(null);
  const name = sdk.printerName?.trim() || undefined;
  return {
    deviceId,
    savedId: deviceId,
    ...(name ? { name } : {}),
  };
}

export async function reconnectDirectBradyPrinter(savedId?: string | null): Promise<string> {
  const sdk = await getSdk();
  const supported = await sdk.isSupportedBrowser();
  if (!supported) {
    throw new Error(
      "Web Bluetooth is not supported in this browser. Android tablets: use Chrome or Edge. iPad and iPhone: open this page in the Bluefy browser (Safari and Chrome on iOS cannot use Bluetooth).",
    );
  }

  try {
    return await discoverAndConnect(savedId ?? ownershipDeviceId ?? readBradyOwnershipId());
  } catch (first) {
    // Clear stale ownership and let the user pick again (Brady demo open scan).
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("ownershipID");
    }
    try {
      return await discoverAndConnect(null);
    } catch {
      throw first instanceof Error
        ? first
        : new Error("Could not reconnect to Brady printer.");
    }
  }
}

/**
 * Must run during the Print click (fresh user gesture) BEFORE createPrintJob / artifact waits.
 * Matches Brady demo: connect button → later printBitmap on already-connected SDK.
 */
export async function ensureDirectBradyConnected(savedId?: string | null): Promise<string> {
  const sdk = await getSdk();
  const supported = await sdk.isSupportedBrowser();
  if (!supported) {
    throw new Error(
      "Web Bluetooth is not supported in this browser. Android tablets: use Chrome or Edge. iPad and iPhone: open this page in the Bluefy browser (Safari and Chrome on iOS cannot use Bluetooth).",
    );
  }

  if (sdk.isConnected()) {
    return ownershipDeviceId ?? savedId ?? "connected";
  }

  return reconnectDirectBradyPrinter(savedId ?? ownershipDeviceId);
}

/**
 * Preload Brady Web SDK during idle time so Print click can open the BLE
 * chooser immediately (Brady demo instantiates BradySdk on page load).
 */
export async function warmDirectBradySdk(): Promise<void> {
  try {
    await getSdk();
  } catch {
    // ignore — capability check happens on print
  }
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load print artifact image."));
    img.src = url;
  });
}

export async function printPngViaDirectBluetooth(opts: {
  pngUrl?: string;
  pngBytes?: Uint8Array | ArrayBuffer;
  copies?: number;
  savedId?: string;
  /** False mid-batch: the chooser needs a user click, so a drop must pause instead. */
  allowChooser?: boolean;
}): Promise<void> {
  if (!opts.pngUrl && !opts.pngBytes) {
    throw new Error("Direct Bluetooth print requires pngUrl or pngBytes.");
  }

  const sdk = await getSdk();
  if (!sdk.isConnected() && opts.allowChooser !== false) {
    await ensureDirectBradyConnected(opts.savedId ?? ownershipDeviceId);
  }

  if (!sdk.isConnected()) {
    throw new Error(
      describeBradyPrinterError(sdk, "Brady printer is not connected. Pair/reconnect, then retry."),
    );
  }

  // Keep blob URL alive until AFTER printBitmap — Brady re-reads img.src (demo never revokes early).
  let objectUrl: string | null = null;
  try {
    let img: HTMLImageElement;
    if (opts.pngBytes) {
      const copy =
        opts.pngBytes instanceof Uint8Array
          ? Uint8Array.from(opts.pngBytes)
          : new Uint8Array(opts.pngBytes);
      const blob = new Blob([copy], { type: "image/png" });
      objectUrl = URL.createObjectURL(blob);
      img = await loadImageElement(objectUrl);
    } else {
      img = await loadImageElement(opts.pngUrl!);
    }

    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error("Print artifact image is empty or failed to decode as PNG.");
    }
    if (img.naturalWidth < 32 || img.naturalHeight < 32) {
      throw new Error(
        `Print artifact is too small (${img.naturalWidth}x${img.naturalHeight}). Expected a PNG label bitmap.`,
      );
    }

    const copies =
      typeof opts.copies === "number" && opts.copies > 0 ? Math.floor(opts.copies) : 1;
    sdk.setCopies(copies);
    // Match Brady demo default cut path; i4311 has no cut feature.
    if (typeof sdk.setCutOption === "function") {
      sdk.setCutOption(0); // EndOfJob
    }

    // Same signature as Brady WebSdkDemo: printBitmap(imageToPrint)
    const ok = await sdk.printBitmap(img);
    if (!ok) {
      throw new Error(
        describeBradyPrinterError(
          sdk,
          "Brady printBitmap returned false — printer may be disconnected or the chooser was cancelled.",
        ),
      );
    }
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Send several labels as ONE Brady print job (one page per label). The i4311 silently
 * stops printing after roughly 20 separate jobs in a session, so batches group labels.
 */
export async function printPngsAsOneJobViaDirectBluetooth(opts: {
  pngs: Uint8Array[];
  copies?: number;
}): Promise<void> {
  if (!opts.pngs.length) return;
  const sdk = await getSdk();
  if (!sdk.isConnected()) {
    throw new Error(
      describeBradyPrinterError(sdk, "Brady printer is not connected. Pair/reconnect, then retry."),
    );
  }

  // Keep blob URLs alive until AFTER printBitmaps — Brady re-reads img.src.
  const objectUrls: string[] = [];
  try {
    const images: HTMLImageElement[] = [];
    for (const bytes of opts.pngs) {
      const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "image/png" }));
      objectUrls.push(url);
      const img = await loadImageElement(url);
      if (img.naturalWidth < 32 || img.naturalHeight < 32) {
        throw new Error(
          `Print artifact is too small (${img.naturalWidth}x${img.naturalHeight}). Expected a PNG label bitmap.`,
        );
      }
      images.push(img);
    }

    const copies =
      typeof opts.copies === "number" && opts.copies > 0 ? Math.floor(opts.copies) : 1;
    sdk.setCopies(copies);
    if (typeof sdk.setCutOption === "function") {
      sdk.setCutOption(1); // EndOfLabel: one job holds many labels, so cut between each
    }

    const ok = await sdk.printBitmaps(images);
    if (!ok) {
      throw new Error(
        describeBradyPrinterError(
          sdk,
          sdk.isConnected()
            ? "Brady did not accept the labels. Click Resume to try again."
            : "Bluetooth to the Brady dropped.",
        ),
      );
    }
  } finally {
    for (const url of objectUrls) URL.revokeObjectURL(url);
  }
}
