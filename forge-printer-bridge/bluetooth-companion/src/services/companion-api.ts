import type { CompanionPreloadApi } from "../../services/preload-api";
import type { BluetoothStatus, PrinterInfoPayload } from "../../services/protocol";

declare global {
  interface Window {
    forgeCompanion: CompanionPreloadApi;
  }
}

/** Thin helpers around the preload bridge (renderer-only). */
export function tryGetCompanionApi(): CompanionPreloadApi | null {
  return window.forgeCompanion ?? null;
}

export function getCompanionApi(): CompanionPreloadApi {
  const api = tryGetCompanionApi();
  if (!api) {
    throw new Error("forgeCompanion preload API is not available.");
  }
  return api;
}

export function publishStatus(
  status: BluetoothStatus,
  printer?: PrinterInfoPayload | null
): void {
  const api = tryGetCompanionApi();
  if (!api) return;
  api.reportStatus(status, printer);
}
