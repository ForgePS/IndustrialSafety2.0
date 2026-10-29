export function renderPairingScreen(root: HTMLElement): void {
  root.innerHTML = `
    <section class="screen pairing" aria-labelledby="pairing-title">
      <h1 id="pairing-title">CONNECT BRADY BLUETOOTH PRINTER</h1>
      <ol class="steps">
        <li>Turn on the Brady printer.</li>
        <li>Verify Bluetooth is enabled.</li>
        <li>Place the printer near this computer.</li>
      </ol>
      <button type="button" class="primary" id="btn-scan">SCAN FOR BRADY PRINTERS</button>
      <p class="hint" id="pairing-hint" hidden></p>
      <ul class="device-list" id="device-list" hidden></ul>
    </section>
  `;
}

export function renderConnectedScreen(
  root: HTMLElement,
  info: {
    model?: string;
    status?: string;
    name?: string;
    batteryLevelPercentage?: number | null;
  },
): void {
  const battery =
    typeof info.batteryLevelPercentage === "number"
      ? `<p class="meta">Battery: ${info.batteryLevelPercentage}%</p>`
      : "";

  root.innerHTML = `
    <section class="screen connected" aria-labelledby="connected-title">
      <h1 id="connected-title">Printer connected</h1>
      <p class="meta"><strong>Name:</strong> ${escapeHtml(info.name ?? "Brady printer")}</p>
      <p class="meta"><strong>Model:</strong> ${escapeHtml(info.model ?? "—")}</p>
      <p class="meta"><strong>Status:</strong> ${escapeHtml(info.status ?? "CONNECTED")}</p>
      ${battery}
      <div class="actions">
        <button type="button" class="primary" id="btn-save">SAVE PRINTER</button>
        <button type="button" class="secondary" id="btn-disconnect">Disconnect</button>
      </div>
    </section>
  `;
}

export function renderStatusScreen(root: HTMLElement, status: string, detail?: string): void {
  root.innerHTML = `
    <section class="screen status" aria-labelledby="status-title">
      <h1 id="status-title">Printer status</h1>
      <p class="status-badge" data-status="${escapeHtml(status)}">${escapeHtml(status)}</p>
      ${detail ? `<p class="hint">${escapeHtml(detail)}</p>` : ""}
      <div class="actions">
        <button type="button" class="primary" id="btn-show-pairing">Connect Bluetooth Printer</button>
        <button type="button" class="secondary" id="btn-retry">Retry reconnect</button>
      </div>
    </section>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
