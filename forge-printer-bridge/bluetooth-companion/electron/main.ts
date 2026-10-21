import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  Tray,
  Menu,
  nativeImage,
} from "electron";
import * as fs from "fs";
import * as path from "path";
import { NamedPipeServer } from "./named-pipe-server";
import {
  BLUETOOTH_NAMED_PIPE,
  BluetoothStatus,
  CompanionRequest,
  CompanionResponse,
  PrinterInfoPayload,
  PROGRAM_DATA_BLUETOOTH_DIR,
} from "../services/protocol";

interface SavedPairing {
  ownershipDeviceId: string;
  printerName?: string;
  printerModel?: string;
  savedAt: string;
}

const PAIRING_FILE = "paired-device.json";
const PIPE_REQUEST_TIMEOUT_MS = 120_000;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pipeServer: NamedPipeServer | null = null;
let latestStatus: BluetoothStatus = "NOT_CONFIGURED";
let latestPrinter: PrinterInfoPayload | null = null;

type BluetoothSelectCallback = (deviceId: string) => void;
let pendingBluetoothSelect: BluetoothSelectCallback | null = null;
let preferredBluetoothDeviceName: string | null = null;
let autoSelectFirstBluetooth = false;

const pendingPipeResponses = new Map<
  string,
  {
    resolve: (value: CompanionResponse) => void;
    reject: (reason?: unknown) => void;
    timer: NodeJS.Timeout;
  }
>();

function ensureBluetoothDataDir(): string {
  const dir = PROGRAM_DATA_BLUETOOTH_DIR;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Persist pairing under ProgramData.
 * ACL note (deploy/installer): restrict
 * C:\ProgramData\Forge Public Safety\Printer Bridge\Bluetooth\
 * to SYSTEM, Administrators, and the interactive user / service account.
 * Do not world-read ownership device ids.
 */
function pairingFilePath(): string {
  return path.join(ensureBluetoothDataDir(), PAIRING_FILE);
}

function readPairing(): SavedPairing | null {
  try {
    const file = pairingFilePath();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as SavedPairing;
  } catch (err) {
    console.error("[pairing] read failed:", err);
    return null;
  }
}

function writePairing(pairing: SavedPairing): void {
  const file = pairingFilePath();
  fs.writeFileSync(file, JSON.stringify(pairing, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function clearPairingFile(): void {
  const file = pairingFilePath();
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

function resolveHtmlPath(): string {
  const built = path.join(__dirname, "..", "src", "index.html");
  if (fs.existsSync(built)) return built;
  return path.join(__dirname, "..", "..", "src", "index.html");
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 520,
    height: 640,
    show: true,
    title: "Forge Bluetooth Printer Companion",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(resolveHtmlPath());

  /**
   * Electron replaces the Chromium Web Bluetooth chooser with this event.
   * Brady SDK still calls navigator.bluetooth.requestDevice internally via
   * showDiscoveredBleDevices — we must select a deviceId here.
   */
  win.webContents.on(
    "select-bluetooth-device",
    (event, deviceList, callback) => {
      event.preventDefault();
      pendingBluetoothSelect = callback;

      const devices = deviceList.map((d) => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName || "Unknown Brady printer",
      }));

      win.webContents.send("bluetooth:device-list", devices);

      if (autoSelectFirstBluetooth && devices.length > 0) {
        const preferred = preferredBluetoothDeviceName
          ? devices.find((d) =>
              d.deviceName
                .toLowerCase()
                .includes(preferredBluetoothDeviceName!.toLowerCase())
            )
          : undefined;
        const chosen = preferred ?? devices[0];
        callback(chosen.deviceId);
        pendingBluetoothSelect = null;
        return;
      }

      // Keep scanning until renderer selects or cancel.
      if (devices.length === 0) {
        // Electron continues discovery while callback is held.
      }
    }
  );

  return win;
}

function setupBluetoothPermissions(): void {
  // Electron's Permission union may omit "bluetooth" depending on typings;
  // runtime still receives bluetooth permission prompts for Web Bluetooth.
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      const name = String(permission);
      if (
        name === "bluetooth" ||
        name === "clipboard-read" ||
        name === "media"
      ) {
        callback(true);
        return;
      }
      callback(false);
    }
  );

  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission) => {
      const name = String(permission);
      return name === "bluetooth" || name === "clipboard-sanitized-write";
    }
  );
}

function createTray(): void {
  // 1x1 empty icon placeholder — installer may replace with branded asset.
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("Forge Bluetooth Printer Companion");
  const menu = Menu.buildFromTemplate([
    {
      label: "Open Companion",
      click: () => {
        if (!mainWindow) mainWindow = createWindow();
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: "Connect Bluetooth Printer",
      click: () => {
        if (!mainWindow) mainWindow = createWindow();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send("ui:show-pairing");
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (!mainWindow) mainWindow = createWindow();
    mainWindow.show();
    mainWindow.focus();
  });
}

function forwardPipeRequest(
  request: CompanionRequest
): Promise<CompanionResponse> {
  if (!mainWindow || mainWindow.webContents.isDestroyed()) {
    return Promise.resolve({
      type: "ERROR",
      code: "INTERNAL_ERROR",
      message: "Companion renderer is not ready.",
      requestId: request.requestId,
    });
  }

  const correlationId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  // PRINT / CONNECT / DISCOVER need Web Bluetooth user-gesture-friendly UI focus.
  if (
    request.type === "PRINT" ||
    request.type === "CONNECT" ||
    request.type === "DISCOVER"
  ) {
    mainWindow.show();
  }

  if (request.type === "DISCOVER" || request.type === "CONNECT") {
    autoSelectFirstBluetooth = request.type === "CONNECT";
    preferredBluetoothDeviceName = null;
  }

  return new Promise<CompanionResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingPipeResponses.delete(correlationId);
      resolve({
        type: "ERROR",
        code: "COMPANION_BUSY",
        message: `Timed out waiting for renderer to handle ${request.type}.`,
        requestId: request.requestId,
      });
    }, PIPE_REQUEST_TIMEOUT_MS);

    pendingPipeResponses.set(correlationId, { resolve, reject, timer });
    mainWindow!.webContents.send("companion:pipe-request", {
      correlationId,
      request,
    });
  });
}

async function handlePipeRequest(
  request: CompanionRequest
): Promise<CompanionResponse> {
  switch (request.type) {
    case "HEARTBEAT":
      return {
        type: "HEARTBEAT_RESULT",
        ok: true,
        status: latestStatus,
        requestId: request.requestId,
        uptimeMs: pipeServer?.uptimeMs ?? 0,
      };
    case "BLUETOOTH_STATUS":
      return {
        type: "STATUS",
        status: latestStatus,
        printer: latestPrinter,
        requestId: request.requestId,
        companionVersion: app.getVersion(),
      };
    default:
      return forwardPipeRequest(request);
  }
}

function registerIpc(): void {
  ipcMain.handle("pairing:get", () => readPairing());
  ipcMain.handle("pairing:save", (_event, pairing: SavedPairing) => {
    writePairing(pairing);
  });
  ipcMain.handle("pairing:clear", () => {
    clearPairingFile();
  });

  ipcMain.handle(
    "artifact:readDataUrl",
    async (_event, artifactPath: string) => {
      if (!artifactPath || typeof artifactPath !== "string") {
        throw new Error("artifactPath is required");
      }
      // Only allow local absolute paths (Forge service drops under ProgramData/Cache).
      if (!path.isAbsolute(artifactPath)) {
        throw new Error("artifactPath must be an absolute local path");
      }
      const data = await fs.promises.readFile(artifactPath);
      const ext = path.extname(artifactPath).toLowerCase();
      const mime =
        ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".bmp"
              ? "image/bmp"
              : "image/png";
      return `data:${mime};base64,${data.toString("base64")}`;
    }
  );

  ipcMain.on(
    "companion:pipe-response",
    (
      _event,
      payload: { correlationId: string; response: CompanionResponse }
    ) => {
      const pending = pendingPipeResponses.get(payload.correlationId);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingPipeResponses.delete(payload.correlationId);
      pending.resolve(payload.response);
    }
  );

  ipcMain.on(
    "companion:status",
    (
      _event,
      payload: { status: BluetoothStatus; printer?: PrinterInfoPayload | null }
    ) => {
      latestStatus = payload.status;
      latestPrinter = payload.printer ?? null;
      pipeServer?.broadcast({
        type: "STATUS",
        status: latestStatus,
        printer: latestPrinter,
      });
    }
  );

  ipcMain.on("bluetooth:select-device", (_event, deviceId: string | null) => {
    if (pendingBluetoothSelect) {
      pendingBluetoothSelect(deviceId ?? "");
      pendingBluetoothSelect = null;
    }
  });

  ipcMain.on("window:focus", () => {
    if (!mainWindow) mainWindow = createWindow();
    mainWindow.show();
    mainWindow.focus();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setupBluetoothPermissions();
    registerIpc();
    mainWindow = createWindow();
    createTray();

    pipeServer = new NamedPipeServer(handlePipeRequest);
    try {
      await pipeServer.start(BLUETOOTH_NAMED_PIPE);
    } catch (err) {
      console.error(
        `[named-pipe] Failed to listen on ${BLUETOOTH_NAMED_PIPE}:`,
        err
      );
    }
  });

  app.on("window-all-closed", () => {
    // Keep companion alive for pipe/heartbeat when window closed (tray mode).
    // User must Quit from tray to exit.
  });

  app.on("before-quit", async () => {
    await pipeServer?.stop();
  });
}
