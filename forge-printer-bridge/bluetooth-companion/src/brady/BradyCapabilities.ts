import type { PrinterCapabilitiesPayload } from "../../services/protocol";

/**
 * Capabilities for Brady i4311 over BLE via Brady Web SDK (spec §7).
 *
 * cut/feed are documented on Brady Web SDK only for M211/M511 — not the
 * i4311 BLE chart. Do not advertise Cut/Feed on this transport.
 */
export const BRADY_I4311_BLE_CAPABILITIES: PrinterCapabilitiesPayload = {
  print: true,
  bitmapPrint: true,
  multipleCopies: true,
  cut: false,
  feed: false,
  batteryStatus: true,
  dpi: [300],
};

export function capabilitiesForModel(model: string | null | undefined): PrinterCapabilitiesPayload {
  const normalized = (model ?? "").toLowerCase().replace(/\s+/g, "");
  if (normalized.includes("i4311") || normalized === "") {
    return { ...BRADY_I4311_BLE_CAPABILITIES };
  }

  // Unknown Brady model on BLE: still no cut/feed unless documented for that model.
  return {
    print: true,
    bitmapPrint: true,
    multipleCopies: true,
    cut: false,
    feed: false,
    batteryStatus: true,
    dpi: [300],
  };
}
