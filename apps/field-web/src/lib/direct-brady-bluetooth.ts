/**
 * Client-only Brady Web SDK helpers for Direct Bluetooth printing (field-web).
 *
 * Matches industrial / Brady WebSdkDemo:
 * 1) Connect on the Print tap (user gesture → BLE chooser)
 * 2) Create/wait for PNG while connected when possible
 * 3) Keep a live blob: URL → HTMLImageElement → printBitmap(img)
 *
 * Bluefy/iPad notes:
 * - showDiscoveredBleDevices always opens the chooser; never call it mid-print
 *   as a "retry" (that is the double-select failure mode).
 * - printBitmap(false) also means supply props are missing — wait for status,
 *   do not disconnect/reconnect.
 * - Brady reloads img.src via a new Image(); keep the blob URL until after print.
 * - isSupplyValid / isRibbonValid default to false and stay sticky after BLE
 *   reconnect. Direct-thermal media has no ribbon, so isRibbonValid stays false
 *   forever — never surface either flag as "invalid / mismatched".
 *
 * Brady Web SDK 3.3.0: showDiscoveredBleDevices() reads localStorage ownershipID
 * and returns boolean; ownership ID is written to localStorage on success.
 */
"use client";

type BradySdkModule = typeof import("@bradycorporation/brady-web-sdk");
type BradySdkInstance = InstanceType<BradySdkModule["default"]>;

let sdkPromise: Promise<BradySdkInstance> | null = null;
let ownershipDeviceId: string | null = null;
const statusListeners = new Set<() => void>();
let printerUpdateCount = 0;
let lastPrinterUpdateKeys: string[] = [];

function assertBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("Brady Web Bluetooth is only available in the browser.");
  }
}

function notifyBradyStatus(): void {
  for (const listener of [...statusListeners]) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
}

async function getSdk(): Promise<BradySdkInstance> {
  assertBrowser();
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const mod = await import("@bradycorporation/brady-web-sdk");
      const BradySdk = mod.default;
      return new BradySdk((updates) => {
        printerUpdateCount += 1;
        lastPrinterUpdateKeys = Array.isArray(updates) ? updates.slice(0, 12) : [];
        notifyBradyStatus();
      }, false);
    })();
  }
  return sdkPromise;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Count of status pushes from the printer. i-series printers chatter while printing, so a
 * batch can treat "no pushes across several labels" as the printer having gone quiet.
 */
export function getDirectBradyUpdateStats(): { count: number; lastKeys: string[] } {
  return { count: printerUpdateCount, lastKeys: lastPrinterUpdateKeys };
}

/** Drop the BLE link and reconnect from scratch (one chooser; call from a user tap). */
export async function forceReconnectDirectBrady(savedId?: string | null): Promise<string> {
  const sdk = await getSdk();
  if (sdk.isConnected()) {
    try {
      await sdk.disconnect();
    } catch {
      // stale link; reconnect below replaces it
    }
    await sleep(500);
  }
  return ensureDirectBradyConnected(savedId, { settle: false });
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
    return {
      key: "disconnected",
      text: "Bluetooth to the Brady dropped.",
      blocking: true,
    };
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

function describeBradyPrinterError(sdk: BradySdkInstance, fallback: string): string {
  const parts = bradyStatusParts(sdk);
  // Never invent ribbon/supply-invalid copy from sticky SDK flags.
  // Brady's own message* fields are the only trustworthy printer text.
  const connection = sdk.getConnectionErrorMessage()?.trim();
  if (connection) parts.push(connection);

  if (!parts.length && sdk.isConnected()) {
    const supply = sdk.supplyName ? String(sdk.supplyName).trim() : "";
    const w = Number(sdk.supplyWidth);
    const h = Number(sdk.supplyHeight);
    const size =
      Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
        ? `${w}×${h}`
        : "";
    if (supply || size) {
      parts.push(
        `Printer reported supply${supply ? ` “${supply}”` : ""}${size ? ` ${size}` : ""}. Tap Print again.`,
      );
    }
  }
  return parts.length ? parts.join(" ") : fallback;
}

/** Brady printBitmap needs identity + width; height is often 0 on continuous media. */
function isBradySupplyReady(sdk: BradySdkInstance): boolean {
  if (!sdk.isConnected()) return false;
  const model = String(sdk.printerModel ?? "").trim();
  const name = String(sdk.supplyName ?? "").trim();
  const dims = String(sdk.supplyDimensions ?? "").trim();
  const width = Number(sdk.supplyWidth);
  const hasWidth = Number.isFinite(width) && width > 0;
  return Boolean((model || name) && (hasWidth || dims));
}

/** Enough to attempt printBitmap after a soft settle timeout. */
function isBradySupplyPartial(sdk: BradySdkInstance): boolean {
  if (!sdk.isConnected()) return false;
  return Boolean(
    String(sdk.printerModel ?? "").trim() ||
      String(sdk.supplyName ?? "").trim() ||
      String(sdk.supplyDimensions ?? "").trim() ||
      (Number.isFinite(Number(sdk.supplyWidth)) && Number(sdk.supplyWidth) > 0),
  );
}

/**
 * Best-effort wait for supply props. Never hard-fails while BLE is still up —
 * Brady often leaves model/name/width empty for seconds (or forever) after
 * connect; printBitmap is the real authority (matches industrial / WebSdkDemo).
 */
async function settleBradySupplyStatus(
  sdk: BradySdkInstance,
  timeoutMs = 5000,
): Promise<void> {
  if (isBradySupplyReady(sdk)) return;

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!sdk.isConnected()) {
      throw new Error(
        describeBradyPrinterError(
          sdk,
          "Bluetooth dropped while waiting for the printer. Keep it on and try again in Bluefy.",
        ),
      );
    }
    if (isBradySupplyReady(sdk) || isBradySupplyPartial(sdk)) return;
    await sleep(250);
  }
  // Still connected with no supply props — proceed anyway.
}

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

function clearBradyOwnershipId(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem("ownershipID");
  ownershipDeviceId = null;
}

/** Clear stale Bluefy/Brady session (needed after renaming the printer on-device). */
export async function clearDirectBradySession(): Promise<void> {
  clearBradyOwnershipId();
  try {
    const sdk = await getSdk();
    if (sdk.isConnected()) {
      await sdk.disconnect();
    }
  } catch {
    // ignore — session clear is best-effort
  }
}

const BRADY_NAME_HINT =
  "Brady Web Bluetooth only lists printers whose Bluetooth name starts with the model (for example i4311, M211, M511). If you renamed the printer on the device, set the Bluetooth name back so it begins with that model, then Pair again.";

function isStaleBleBondError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("unknown error") ||
    lower.includes("retrieve services") ||
    lower.includes("networkerror") ||
    lower.includes("network error") ||
    (lower.includes("connection to") && lower.includes("failed")) ||
    lower.includes("gatt") ||
    lower.includes("bonding")
  );
}

function enrichBleConnectError(raw: string): string {
  const msg = raw.trim() || "Bluetooth connection failed.";
  if (isStaleBleBondError(msg)) {
    return `${msg} Tap Print again and select the Brady when prompted. If it keeps failing, tap Re-pair (or forget the printer in iOS Bluetooth settings, then Pair again).`;
  }
  return msg;
}

function bradyConnectFailureMessage(sdk: BradySdkInstance, fallback: string): string {
  const raw = (sdk.getConnectionErrorMessage() || fallback).trim();
  const lower = raw.toLowerCase();
  if (
    lower.includes("no device") ||
    lower.includes("not found") ||
    lower.includes("cancelled") ||
    lower.includes("canceled") ||
    lower.includes("user cancelled") ||
    lower.includes("user canceled") ||
    lower.includes("no brady") ||
    lower.includes("not selected")
  ) {
    return `${raw} ${BRADY_NAME_HINT}`;
  }
  return enrichBleConnectError(raw);
}

async function discoverAndConnect(preferredOwnershipId?: string | null): Promise<string> {
  const sdk = await getSdk();

  // One chooser only — never open a second scan in the same connect attempt.
  // Stale-bond recovery: clear ownership first on iOS/Bluefy (caller), not a second picker.
  if (preferredOwnershipId?.trim()) {
    writeBradyOwnershipId(preferredOwnershipId.trim());
  } else {
    clearBradyOwnershipId();
  }

  const ok = await sdk.showDiscoveredBleDevices();
  if (!ok || !sdk.isConnected()) {
    throw new Error(bradyConnectFailureMessage(sdk, "No Brady printer selected."));
  }

  const ownershipId = readBradyOwnershipId();
  if (!ownershipId) {
    throw new Error(
      "Brady connected but did not return an ownership ID. Disconnect and pair again.",
    );
  }
  ownershipDeviceId = ownershipId;
  await settleBradySupplyStatus(sdk, 2000);
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

  // Drop stale ownership from a previous name/session so Bluefy opens a fresh chooser.
  await clearDirectBradySession();

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

  // Prefer saved ownership for silent reconnect; discoverAndConnect clears it and
  // reopens the chooser if Bluefy returns the common NetworkError / Unknown error.
  return discoverAndConnect(savedId ?? ownershipDeviceId ?? readBradyOwnershipId());
}

function isLikelyIosWebBluetooth(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Bluefy/i.test(ua) || /iPad|iPhone|iPod/i.test(ua);
}

/**
 * Connect during the Print click (fresh user gesture) BEFORE createPrintJob waits.
 * If already connected with supply status, this is a no-op (no second chooser).
 * Pass settle:false for a fast link on the Print tap; settle fully right before printBitmap.
 */
export async function ensureDirectBradyConnected(
  savedId?: string | null,
  opts?: { settle?: boolean },
): Promise<string> {
  const sdk = await getSdk();
  const supported = await sdk.isSupportedBrowser();
  if (!supported) {
    throw new Error(
      "Web Bluetooth is not supported in this browser. Android tablets: use Chrome or Edge. iPad and iPhone: open this page in the Bluefy browser (Safari and Chrome on iOS cannot use Bluetooth).",
    );
  }

  const shouldSettle = opts?.settle !== false;

  if (sdk.isConnected()) {
    if (shouldSettle) {
      await settleBradySupplyStatus(sdk, 5000);
    }
    return ownershipDeviceId ?? savedId ?? readBradyOwnershipId() ?? "connected";
  }

  // Bluefy/iOS: ownershipID auto-reconnect often fails with NetworkError /
  // "Connection … Unknown error" after getPrimaryServices. Always open a fresh
  // chooser there; Android Chrome can still use saved ownership.
  if (isLikelyIosWebBluetooth()) {
    clearBradyOwnershipId();
    return discoverAndConnect(null);
  }

  return reconnectDirectBradyPrinter(savedId ?? ownershipDeviceId ?? readBradyOwnershipId());
}

export type BradySupplySize = {
  widthInches: number;
  heightInches: number;
  supplyName?: string;
  printerName?: string;
};

function normalizeBradyDimInches(raw: number): number | null {
  if (!Number.isFinite(raw) || raw <= 0) return null;
  // Brady Web SDK usually reports inches; some firmwares report mm.
  const inches = raw > 14 ? raw / 25.4 : raw;
  if (!Number.isFinite(inches) || inches < 0.4 || inches > 12) return null;
  return Math.round(inches * 100) / 100;
}

function parseBradySupplyDimensions(raw: string | null | undefined): {
  widthInches: number;
  heightInches: number;
} | null {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const w = normalizeBradyDimInches(Number(m[1]));
  const h = normalizeBradyDimInches(Number(m[2]));
  if (w == null || h == null) return null;
  return { widthInches: w, heightInches: h };
}

/**
 * Connect if needed (user gesture), wait for supply status, return installed size.
 * Use this from a Detect / Print tap so Bluefy can open the BLE chooser.
 */
export async function detectDirectBradySupplySize(
  savedId?: string | null,
): Promise<BradySupplySize> {
  await ensureDirectBradyConnected(savedId);
  const sdk = await getSdk();

  if (!isBradySupplyReady(sdk)) {
    await settleBradySupplyStatus(sdk, 12000);
  }
  if (!isBradySupplyReady(sdk)) {
    throw new Error(
      "Printer is linked, but label size was not reported yet. Confirm labels are loaded, wait a moment, then tap Detect again.",
    );
  }

  const size = await readConnectedBradySupplySize();
  if (!size) {
    throw new Error(
      "Brady did not report a label width. Reseat the cartridge and tap Detect again.",
    );
  }
  return size;
}

/** Read installed size from an already-connected Brady (no chooser). */
export async function readConnectedBradySupplySize(): Promise<BradySupplySize | null> {
  try {
    const sdk = await getSdk();
    if (!sdk.isConnected() || !isBradySupplyReady(sdk)) return null;

    const fromDims = parseBradySupplyDimensions(sdk.supplyDimensions ?? null);
    const width =
      fromDims?.widthInches ?? normalizeBradyDimInches(Number(sdk.supplyWidth));
    const height =
      fromDims?.heightInches ?? normalizeBradyDimInches(Number(sdk.supplyHeight));
    if (width == null) return null;

    const heightInches =
      height != null && height >= 0.4 && height <= 12 ? height : width;
    const supplyName = sdk.supplyName ? String(sdk.supplyName).trim() : "";
    const printerName = sdk.printerName ? String(sdk.printerName).trim() : "";
    return {
      widthInches: width,
      heightInches,
      ...(supplyName ? { supplyName } : {}),
      ...(printerName ? { printerName } : {}),
    };
  } catch {
    return null;
  }
}

export async function warmDirectBradySdk(): Promise<void> {
  try {
    await getSdk();
  } catch {
    // ignore
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

/**
 * Composite onto opaque white. Do NOT 1-bit threshold — that erodes
 * anti-aliased QR modules and makes codes unscannable on Brady thermal.
 * Brady's print pipeline handles dithering for the printhead.
 */
async function toBradyPrintableImage(
  source: HTMLImageElement,
): Promise<HTMLImageElement> {
  const width = source.naturalWidth;
  const height = source.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare label bitmap for Brady printing.");

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return loadImageElement(canvas.toDataURL("image/png"));
}

export async function printPngViaDirectBluetooth(opts: {
  pngUrl?: string;
  pngBytes?: Uint8Array | ArrayBuffer;
  copies?: number;
  savedId?: string;
  /**
   * When false (default), never open the BLE chooser — Print must already be connected.
   * A second chooser mid-print is the Bluefy triple-select failure mode.
   */
  allowChooser?: boolean;
}): Promise<void> {
  if (!opts.pngUrl && !opts.pngBytes) {
    throw new Error("Direct Bluetooth print requires pngUrl or pngBytes.");
  }

  const sdk = await getSdk();
  const allowChooser = opts.allowChooser === true;

  if (!sdk.isConnected()) {
    if (!allowChooser) {
      throw new Error(
        "Bluetooth dropped after the printer was selected. Tap Print once, pick the Brady, and leave the printer awake until the label finishes.",
      );
    }
    await ensureDirectBradyConnected(opts.savedId ?? ownershipDeviceId ?? readBradyOwnershipId(), {
      settle: true,
    });
  }

  if (!sdk.isConnected()) {
    throw new Error(
      describeBradyPrinterError(
        sdk,
        "Brady printer is not connected. Tap Print and select the printer once when prompted.",
      ),
    );
  }

  try {
    await settleBradySupplyStatus(sdk, 2000);
  } catch {
    if (!sdk.isConnected()) {
      throw new Error(
        "Bluetooth dropped before print. Tap Print once and select the Brady when prompted.",
      );
    }
  }

  // Keep blob URL alive until AFTER printBitmap — Brady reloads img.src (demo never revokes early).
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
    if (typeof sdk.setCutOption === "function") {
      sdk.setCutOption(0); // EndOfJob
    }

    const printable = await toBradyPrintableImage(img);

    let ok = await sdk.printBitmap(printable, 0, 0);
    if (!ok && sdk.isConnected()) {
      await sleep(1000);
      if (sdk.isConnected()) {
        ok = await sdk.printBitmap(printable, 0, 0);
      }
    }
    if (!ok) {
      throw new Error(
        describeBradyPrinterError(
          sdk,
          sdk.isConnected()
            ? "Print did not start. Keep the Brady awake and tap Print once more."
            : "Bluetooth dropped during print. Tap Print once and select the Brady when prompted.",
        ),
      );
    }
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
