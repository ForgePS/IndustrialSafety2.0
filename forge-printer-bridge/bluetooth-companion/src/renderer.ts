import { BradyBluetoothService } from "./brady/BradyBluetoothService";
import {
  renderPairingScreen,
  renderConnectedScreen,
  renderStatusScreen,
} from "./ui/pairing";
import { getCompanionApi, publishStatus, tryGetCompanionApi } from "./services/companion-api";
import type { BluetoothStatus, PrinterInfoPayload } from "../services/protocol";

const app = document.getElementById("app");
if (!app) {
  throw new Error("#app root missing");
}

function showFatal(message: string, detail?: string): void {
  app!.innerHTML = `
    <section class="screen status" role="alert">
      <h1>Companion failed to start</h1>
      <p class="hint">${escapeHtml(message)}</p>
      ${detail ? `<p class="hint"><code>${escapeHtml(detail)}</code></p>` : ""}
      <div class="actions">
        <button type="button" class="primary" id="btn-reload">Reload</button>
      </div>
    </section>
  `;
  document.getElementById("btn-reload")?.addEventListener("click", () => {
    location.reload();
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let service: BradyBluetoothService;
try {
  service = new BradyBluetoothService();
  service.initialize();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  showFatal("Brady Web SDK failed to initialize in this window.", message);
  throw err;
}

let currentView: "pairing" | "connected" | "status" = "pairing";

function showPairing(): void {
  currentView = "pairing";
  renderPairingScreen(app!);
  const scanBtn = document.getElementById("btn-scan") as HTMLButtonElement | null;
  const hint = document.getElementById("pairing-hint");
  const list = document.getElementById("device-list");

  scanBtn?.addEventListener("click", async () => {
    if (!scanBtn || !hint) return;
    scanBtn.disabled = true;
    hint.hidden = false;
    hint.textContent = "Scanning… select your Brady printer when prompted.";
    try {
      const result = await service.discover();
      if (result.type === "DISCOVER_RESULT" && result.devices.length > 0) {
        showConnected(service.getPrinter());
      } else if (result.type === "ERROR") {
        hint.textContent = result.message;
        if (list) {
          list.hidden = true;
        }
      }
    } catch (err) {
      hint.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      scanBtn.disabled = false;
    }
  });

  tryGetCompanionApi()?.onBluetoothDeviceList((devices) => {
    if (!list || currentView !== "pairing") return;
    list.hidden = false;
    list.innerHTML = "";
    for (const device of devices) {
      const li = document.createElement("li");
      li.textContent = device.deviceName || device.deviceId;
      li.addEventListener("click", () => {
        tryGetCompanionApi()?.selectBluetoothDevice(device.deviceId);
      });
      list.appendChild(li);
    }
  });
}

function showConnected(printer: PrinterInfoPayload | null): void {
  currentView = "connected";
  renderConnectedScreen(app!, {
    name: printer?.displayName,
    model: printer?.model,
    status: printer?.status ?? service.getStatus(),
    batteryLevelPercentage: printer?.batteryLevelPercentage,
  });

  document.getElementById("btn-save")?.addEventListener("click", async () => {
    const ownershipId = printer?.bluetoothDeviceId || printer?.id || null;
    if (!ownershipId) {
      alert("No Brady ownership device id available to save yet.");
      return;
    }
    await getCompanionApi().savePairing({
      ownershipDeviceId: ownershipId,
      printerName: printer?.displayName,
      printerModel: printer?.model,
      savedAt: new Date().toISOString(),
    });
    showStatus(service.getStatus(), service.getPrinter());
  });

  document
    .getElementById("btn-disconnect")
    ?.addEventListener("click", async () => {
      await service.disconnect();
      showStatus(service.getStatus(), service.getPrinter());
    });
}

function showStatus(
  status: BluetoothStatus,
  printer: PrinterInfoPayload | null
): void {
  currentView = "status";
  const detail = printer
    ? [printer.displayName, printer.model, printer.messageTitle || printer.message]
        .filter(Boolean)
        .join(" · ")
    : undefined;
  renderStatusScreen(app!, status, detail);

  document.getElementById("btn-show-pairing")?.addEventListener("click", () => {
    showPairing();
  });

  document.getElementById("btn-retry")?.addEventListener("click", async () => {
    const saved = await getCompanionApi().getSavedPairing();
    if (!saved?.ownershipDeviceId) {
      showPairing();
      return;
    }
    const result = await service.connect(saved.ownershipDeviceId);
    if (result.success) {
      showConnected(result.printer ?? service.getPrinter());
    } else {
      showStatus(service.getStatus(), service.getPrinter());
    }
  });
}

// Paint the pairing screen first so a later IPC/preload failure cannot leave #app blank.
showPairing();

service.onStatusChange((status, printer) => {
  try {
    publishStatus(status, printer);
  } catch (err) {
    console.warn("[companion] publishStatus failed:", err);
  }

  if (status === "USER_ACTION_REQUIRED" || status === "PERMISSION_REQUIRED") {
    notifyUserGestureRequired();
  } else if (status === "READY" || status === "CONNECTED") {
    // Quiet success — optional OS toast is noisy for phone-like reconnect.
  }

  if (currentView === "status") {
    showStatus(status, printer);
  } else if (
    currentView === "connected" &&
    (status === "READY" || status === "CONNECTED")
  ) {
    showConnected(printer);
  } else if (
    status === "DISCONNECTED" ||
    status === "NOT_CONFIGURED" ||
    status === "USER_ACTION_REQUIRED" ||
    status === "PERMISSION_REQUIRED"
  ) {
    if (currentView !== "pairing") {
      showStatus(status, printer);
    }
  }
});

let lastGestureNoticeAt = 0;
function notifyUserGestureRequired(): void {
  const now = Date.now();
  if (now - lastGestureNoticeAt < 30_000) {
    return;
  }
  lastGestureNoticeAt = now;
  try {
    getCompanionApi().focusWindow();
  } catch {
    // preload may be unavailable
  }
  try {
    if (typeof Notification === "undefined") {
      return;
    }
    const body = "Click to reconnect Brady printer";
    if (Notification.permission === "granted") {
      new Notification("Forge Printer Bridge", { body });
    } else if (Notification.permission !== "denied") {
      void Notification.requestPermission().then((perm) => {
        if (perm === "granted") {
          new Notification("Forge Printer Bridge", { body });
        }
      });
    }
  } catch (err) {
    console.warn("[companion] gesture notification failed:", err);
  }
}

try {
  getCompanionApi().onPipeRequest(async (request) => {
    if (request.type === "FORGET") {
      await getCompanionApi().clearPairing();
    }
    const response = await service.handlePipeRequest(request);
    if (
      request.type === "CONNECT" &&
      response.type === "CONNECT_RESULT" &&
      response.success
    ) {
      showConnected(response.printer ?? service.getPrinter());
    }
    if (request.type === "DISCOVER" && response.type === "DISCOVER_RESULT") {
      showConnected(service.getPrinter());
    }
    if (request.type === "DISCONNECT" || request.type === "FORGET") {
      showStatus(service.getStatus(), service.getPrinter());
    }
    return response;
  });
} catch (err) {
  console.warn("[companion] pipe request bridge unavailable:", err);
}

async function bootstrap(): Promise<void> {
  try {
    const api = tryGetCompanionApi();
    if (!api) {
      // Keep pairing UI; show a soft hint for missing preload.
      const hint = document.getElementById("pairing-hint");
      if (hint) {
        hint.hidden = false;
        hint.textContent =
          "Preload bridge missing — scan may still work in this window, but the Windows service cannot talk to this companion.";
      }
      return;
    }
    const saved = await api.getSavedPairing();
    if (saved?.ownershipDeviceId) {
      showStatus("SCANNING", null);
      service.startReconnectLoop(saved.ownershipDeviceId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[companion] bootstrap failed:", err);
    const hint = document.getElementById("pairing-hint");
    if (hint) {
      hint.hidden = false;
      hint.textContent = `Startup warning: ${message}`;
    }
  }
}

void bootstrap();
