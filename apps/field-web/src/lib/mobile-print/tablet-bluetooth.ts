/**
 * Brady Web Bluetooth device hints.
 *
 * Android tablets: Chrome, Edge, Samsung Internet, Opera.
 * iPad / iPhone: Safari and Chrome do not implement Web Bluetooth. Brady's
 * documented iOS browser is Bluefy (https://apps.apple.com/app/id1492822055).
 */

export type TabletBluetoothHint = {
  kind: "android-tablet" | "ios" | "desktop" | "unknown";
  /** True when this page can call navigator.bluetooth (Chrome, Edge, Bluefy). */
  webBluetoothPresent: boolean;
  headline: string;
  detail: string;
};

const BLUEFY_APP_STORE = "https://apps.apple.com/app/id1492822055";

export function bluefyAppStoreUrl(): string {
  return BLUEFY_APP_STORE;
}

export function isIosLikeDevice(ua = "", platform = "", maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports as Macintosh; touch points distinguish it from a Mac.
  return platform === "MacIntel" && maxTouchPoints > 1;
}

export function isAndroidTablet(ua = ""): boolean {
  return /Android/i.test(ua) && !/Mobile/i.test(ua);
}

export function detectTabletBluetoothHint(): TabletBluetoothHint {
  if (typeof navigator === "undefined") {
    return {
      kind: "unknown",
      webBluetoothPresent: false,
      headline: "Bluetooth printing",
      detail: "Open this page in a browser that supports Web Bluetooth.",
    };
  }

  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const webBluetoothPresent = "bluetooth" in navigator;
  const ios = isIosLikeDevice(ua, platform, maxTouchPoints);

  if (ios && !webBluetoothPresent) {
    return {
      kind: "ios",
      webBluetoothPresent: false,
      headline: "Open Forge in Bluefy on this iPad",
      detail:
        "Safari and Chrome on iPad cannot reach Bluetooth printers. Install Bluefy, open this same Forge page there, then pair. Android tablets can use Chrome.",
    };
  }

  if (ios) {
    return {
      kind: "ios",
      webBluetoothPresent: true,
      headline: "iPad Bluetooth ready",
      detail: "This browser can pair a Brady printer. Stay in Bluefy while you print.",
    };
  }

  if (isAndroidTablet(ua)) {
    return {
      kind: "android-tablet",
      webBluetoothPresent,
      headline: webBluetoothPresent ? "Tablet Bluetooth ready" : "Use Chrome on this tablet",
      detail: webBluetoothPresent
        ? "Direct Bluetooth printing is available on this Android tablet."
        : "Open Forge in Chrome or Edge on this tablet, then pair the Brady printer.",
    };
  }

  return {
    kind: "desktop",
    webBluetoothPresent,
    headline: webBluetoothPresent ? "Web Bluetooth ready" : "Use Chrome or Edge",
    detail: webBluetoothPresent
      ? "Direct Bluetooth printing is available in this browser."
      : "Open Forge in Chrome or Edge over HTTPS. On iPad, use the Bluefy browser instead.",
  };
}
