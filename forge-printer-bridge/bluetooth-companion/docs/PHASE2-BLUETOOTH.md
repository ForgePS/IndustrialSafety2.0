# Phase 2 — Bluetooth Companion

## Scope

Deliver the **Forge Bluetooth Printer Companion** Electron app that:

1. Hosts `\\.\pipe\ForgePrinterBridgeBluetooth` (JSON lines) in the Electron **main** process
2. Runs **Brady Web SDK** (`@bradycorporation/brady-web-sdk@3.3.0`) in the **renderer**
3. Maps Brady printer state into Forge printer payloads and error codes
4. Provides the §18 pairing UI and status screens
5. Persists Brady ownership / reconnect ids under ProgramData `\Bluetooth\`

## Explicit non-goals

- Inventing or reverse-engineering Brady BLE GATT protocols
- Calling undocumented Brady SDK methods
- Binding any public TCP port for companion IPC
- Replacing Phase 1 Windows spooler transport

## Status enum (§20)

`NOT_CONFIGURED` · `SCANNING` · `PAIRING` · `CONNECTED` · `READY` · `PRINTING` · `DISCONNECTED` · `OUT_OF_RANGE` · `PRINTER_ERROR` · `PERMISSION_REQUIRED` · `USER_ACTION_REQUIRED`

## Capabilities (§7) — i4311 BLE

| Capability | Value | Notes |
|------------|-------|-------|
| print | true | |
| bitmapPrint | true | `printBitmap(HTMLImageElement)` |
| multipleCopies | true | `setCopies(n)` |
| cut | false | SDK cut is M211/M511; not advertised for i4311 BLE |
| feed | false | SDK feed is M211/M511; not advertised for i4311 BLE |
| batteryStatus | true | when `batteryLevelPercentage` available |
| dpi | [300] | i4311 profile |

## IPC examples

PRINT request:

```json
{
  "type": "PRINT",
  "jobId": "PRINT-001",
  "printerId": "PRINTER-002",
  "artifactPath": "C:\\\\ProgramData\\\\Forge Public Safety\\\\Printer Bridge\\\\Cache\\\\job.png",
  "copies": 1,
  "requestId": "req-1"
}
```

Responses:

```json
{ "type": "PRINT_RESULT", "jobId": "PRINT-001", "success": true, "requestId": "req-1" }
{ "type": "STATUS", "status": "READY", "printer": { "model": "i4311" }, "requestId": "req-1" }
{ "type": "ERROR", "code": "BLUETOOTH_DISCONNECTED", "message": "...", "requestId": "req-1" }
{ "type": "DISCOVER_RESULT", "devices": [{ "deviceId": "SDK_ID", "name": "Brady" }], "requestId": "req-1" }
{ "type": "CONNECT_RESULT", "success": true, "deviceId": "SDK_ID", "printer": {}, "requestId": "req-1" }
```

## Layout (spec §63)

```text
bluetooth-companion/
├── package.json
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   └── named-pipe-server.ts
├── src/
│   ├── index.html
│   ├── renderer.ts
│   ├── ui/
│   ├── services/
│   └── brady/
│       ├── BradySdkAdapter.ts
│       ├── BradyPrinterMapper.ts
│       ├── BradyCapabilities.ts
│       ├── BradyErrorMapper.ts
│       └── BradyBluetoothService.ts
├── services/
├── README.md
└── docs/PHASE2-BLUETOOTH.md
```

## Tray integration

Windows tray menu item **Connect Bluetooth Printer** should launch or focus `ForgePrinterBridge.Bluetooth.exe`. Closing the companion window keeps the process alive via tray so the named pipe remains available; **Quit** from the tray exits.

## Documented Brady API uncertainties

See README and inline comments in `src/brady/`. Summary:

1. **i4311 property matrix** — Brady documents properties as may be `null`/`undefined` per model; we treat absence as unknown, not failure.
2. **Electron Web Bluetooth chooser** — Chromium’s chooser is replaced by Electron `select-bluetooth-device`; Brady’s `showDiscoveredBleDevices` still calls Web Bluetooth underneath.
3. **Reconnect + user gesture** — `showDiscoveredBleDevices(savedId)` is the documented reconnect pattern; browsers/Electron may still require a user gesture → `USER_ACTION_REQUIRED`.
4. **Ownership id semantics** — Brady docs emphasize M211/M610 ownership; we persist the returned id for all models and pass it back on reconnect without inventing alternate BLE identity schemes.
5. **`getConnectionErrorMessage`** — documented to return `""` after successes; we only map non-empty strings.
6. **cut/feed** — not enabled for i4311 BLE even though methods exist on the SDK class for other models.
