import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { CompanionPreloadApi, SavedPairing } from "../services/preload-api";
import type {
  BluetoothStatus,
  CompanionRequest,
  CompanionResponse,
  PrinterInfoPayload,
} from "../services/protocol";

const api: CompanionPreloadApi = {
  getSavedPairing: () => ipcRenderer.invoke("pairing:get"),
  savePairing: (pairing: SavedPairing) => ipcRenderer.invoke("pairing:save", pairing),
  clearPairing: () => ipcRenderer.invoke("pairing:clear"),
  readArtifactAsDataUrl: (artifactPath) => ipcRenderer.invoke("artifact:readDataUrl", artifactPath),
  reportStatus: (status, printer) => {
    ipcRenderer.send("companion:status", { status, printer });
  },
  onPipeRequest: (handler) => {
    const listener = async (
      _event: IpcRendererEvent,
      payload: { correlationId: string; request: CompanionRequest },
    ) => {
      try {
        const response = await handler(payload.request);
        ipcRenderer.send("companion:pipe-response", {
          correlationId: payload.correlationId,
          response,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ipcRenderer.send("companion:pipe-response", {
          correlationId: payload.correlationId,
          response: {
            type: "ERROR",
            code: "INTERNAL_ERROR",
            message,
            requestId: payload.request.requestId,
          } satisfies CompanionResponse,
        });
      }
    };
    ipcRenderer.on("companion:pipe-request", listener);
    return () => ipcRenderer.removeListener("companion:pipe-request", listener);
  },
  onBluetoothDeviceList: (handler) => {
    const listener = (
      _event: IpcRendererEvent,
      devices: Array<{ deviceId: string; deviceName: string }>,
    ) => {
      handler(devices);
    };
    ipcRenderer.on("bluetooth:device-list", listener);
    return () => ipcRenderer.removeListener("bluetooth:device-list", listener);
  },
  selectBluetoothDevice: (deviceId) => {
    ipcRenderer.send("bluetooth:select-device", deviceId);
  },
  focusWindow: () => {
    ipcRenderer.send("window:focus");
  },
};

contextBridge.exposeInMainWorld("forgeCompanion", api);

export type { CompanionPreloadApi, SavedPairing, BluetoothStatus, PrinterInfoPayload };
