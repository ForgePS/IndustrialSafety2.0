import type {
  BluetoothStatus,
  CompanionRequest,
  CompanionResponse,
  PrinterInfoPayload,
} from "./protocol";

export interface SavedPairing {
  ownershipDeviceId: string;
  printerName?: string;
  printerModel?: string;
  savedAt: string;
}

export interface CompanionPreloadApi {
  getSavedPairing: () => Promise<SavedPairing | null>;
  savePairing: (pairing: SavedPairing) => Promise<void>;
  clearPairing: () => Promise<void>;
  readArtifactAsDataUrl: (artifactPath: string) => Promise<string>;
  reportStatus: (status: BluetoothStatus, printer?: PrinterInfoPayload | null) => void;
  onPipeRequest: (handler: (request: CompanionRequest) => Promise<CompanionResponse>) => () => void;
  onBluetoothDeviceList: (
    handler: (devices: Array<{ deviceId: string; deviceName: string }>) => void,
  ) => () => void;
  selectBluetoothDevice: (deviceId: string | null) => void;
  focusWindow: () => void;
}
