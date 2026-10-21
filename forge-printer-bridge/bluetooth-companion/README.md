# Forge Bluetooth Printer Companion

Phase 2 Electron companion that connects the Forge Printer Bridge Windows Service to Brady printers over **Bluetooth Low Energy** using only the documented **Brady Web SDK**.

Product name: **Forge Bluetooth Printer Companion**  
Executable (electron-builder): **ForgePrinterBridge.Bluetooth.exe**

## Phase 1 vs Phase 2

| | Phase 1 | Phase 2 (this app) |
|--|---------|---------------------|
| Path | Forge → Cloud → Bridge Service → Windows Spooler → Brady driver → i4311 | Forge → Cloud → Bridge Service → **named pipe** → **this companion** → Brady Web SDK → BLE → printer |
| Process | Always-on Windows Service | Interactive user-session Electron app (Web Bluetooth requires a UI session) |
| Protocol | Spooler / GDI | Documented Brady Web SDK only (no reverse-engineered BLE) |

Phase 1 remains the USB / Ethernet / Wi-Fi path. This companion does **not** replace the spooler transport.

## Named pipe IPC (security)

- Pipe name: `\\.\pipe\ForgePrinterBridgeBluetooth`
- **Named pipe only** — never expose a public TCP port
- JSON lines protocol (one JSON object per line)
- Intended clients: Forge Printer Bridge Service (same machine) + the logged-in interactive user session hosting this companion
- Pairing data stored under `C:\ProgramData\Forge Public Safety\Printer Bridge\Bluetooth\` — installer should ACL this folder to SYSTEM, Administrators, and the interactive user (do not world-read ownership device ids)

### Requests (Service → Companion)

`BLUETOOTH_STATUS` · `DISCOVER` · `CONNECT` · `DISCONNECT` · `PRINT` · `CANCEL` · `GET_PRINTER_INFO` · `HEARTBEAT` · `FORGET`

### Responses

`STATUS` · `PRINT_RESULT` · `ERROR` · `DISCOVER_RESULT` · `CONNECT_RESULT` · `HEARTBEAT_RESULT` · `PRINTER_INFO` · `FORGET_RESULT` · `DISCONNECT_RESULT`

## Brady Web SDK

- Package: `@bradycorporation/brady-web-sdk` **pinned to 3.3.0**
- Docs: https://sdk.bradyid.com/web_api_documentation/
- Analytics disabled in companion (`new BradySdk(callback, false)`)
- APIs used: `showDiscoveredBleDevices`, `isConnected`, `getConnectionErrorMessage`, `isSupportedBrowser`, `printBitmap`, `setCopies`, `disconnect`, plus documented instance properties after connect

### i4311 support

Initial Forge profile targets **Brady i4311** at **300 DPI** over BLE:

- `print` / `bitmapPrint` / `multipleCopies` (via `setCopies`): **true**
- `cut` / `feed`: **false** on the i4311 BLE path (SDK `cut`/`feed` are documented for M211/M511)
- `batteryStatus`: **true** when `batteryLevelPercentage` is present
- `dpi`: `[300]`

## Architecture

```text
electron/main.ts          Named pipe server + Bluetooth permissions + tray
electron/preload.ts       contextBridge IPC
electron/named-pipe-server.ts
src/renderer.ts           Pairing UI + request handling
src/brady/*               Isolated Brady Web SDK wrappers
```

- Named pipe runs in the **main** process
- Brady Web SDK / Web Bluetooth run in the **renderer** (Chromium)
- Main ↔ renderer via `ipcMain` / preload `contextBridge`

## Startup behavior

1. Companion must start in an **interactive user session** (tray “Connect Bluetooth Printer” launches/focuses this app)
2. Load saved ownership device id from ProgramData
3. Attempt reconnect with `showDiscoveredBleDevices(savedId)` using backoff: 5s → 15s → 30s → 60s → max 5 minutes
4. If Web Bluetooth requires a gesture: surface `USER_ACTION_REQUIRED` / `PERMISSION_REQUIRED`
5. Answer `HEARTBEAT` from the service while the companion is running

## Develop

Requirements: Windows 10/11, Node.js 20+ (Electron 33+), Bluetooth adapter.

```powershell
cd forge-printer-bridge\bluetooth-companion
npm install
npm run dev
```

Scripts:

| Script | Purpose |
|--------|---------|
| `npm run dev` | Build + launch Electron |
| `npm run build` | Compile main/preload + bundle renderer |
| `npm start` | Launch Electron (after build) |
| `npm run dist` | electron-builder Windows portable/nsis |

## PRINT flow

1. Service sends `PRINT` with local `artifactPath` (PNG preferred)
2. Main reads the file and returns a data URL to the renderer
3. Renderer loads `HTMLImageElement`, calls `setCopies(n)`, then `printBitmap(img)`
4. Returns `PRINT_RESULT` with Forge codes via `BradyErrorMapper`

## License

Forge Industrial Safety — internal companion for Forge Printer Bridge.
