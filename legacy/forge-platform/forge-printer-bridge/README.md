# Forge Printer Bridge

Windows desktop bridge that connects Forge Cloud Print Service to local Brady (and other) printers via the Windows print spooler and, in Phase 2, the Bluetooth companion.

**Phase 1** — USB / Ethernet / Wi-Fi (Windows spooler):

```text
Forge → Forge Cloud Print Service → Forge Printer Bridge → Windows Spooler → Brady Driver → i4311
```

**Phase 2** — Bluetooth (Electron companion + Brady Web SDK):

```text
Forge → Bridge Service → \\.\pipe\ForgePrinterBridgeBluetooth → Companion → Brady Web SDK → i4311
```

This solution does **not** invent a Brady BLE protocol. The Electron app lives under `bluetooth-companion/`.

## Solution layout

```text
forge-printer-bridge/
├── ForgePrinterBridge.sln
├── src/
│   ├── Forge.PrinterBridge.Core/
│   ├── Forge.PrinterBridge.Service/     → ForgePrinterBridge.Service.exe
│   ├── Forge.PrinterBridge.Tray/        → ForgePrinterBridge.Tray.exe
│   ├── Forge.PrinterBridge.Windows/
│   ├── Forge.PrinterBridge.Bluetooth/   → Named pipe client + companion transport
│   ├── Forge.PrinterBridge.Cloud/
│   ├── Forge.PrinterBridge.Security/
│   ├── Forge.PrinterBridge.Diagnostics/
│   ├── Forge.PrinterBridge.Updater/     (stub)
│   └── Forge.PrinterBridge.Shared/
├── bluetooth-companion/                 (Electron; separate)
├── installer/
├── tests/
│   └── Forge.PrinterBridge.Core.Tests/
├── docs/
│   ├── PHASE1.md
│   └── PHASE2.md
└── README.md
```

## Requirements

- Windows 10/11
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) (Windows Desktop workload)
- Brady i4311 Windows driver for spooler printing
- Phase 2: Forge Bluetooth Printer Companion (`ForgePrinterBridge.Bluetooth.exe`) for BLE

## Build

```powershell
cd forge-printer-bridge
dotnet restore ForgePrinterBridge.sln
dotnet build ForgePrinterBridge.sln -c Release
dotnet test ForgePrinterBridge.sln -c Release
```

Published outputs (example):

```powershell
dotnet publish src\Forge.PrinterBridge.Service\Forge.PrinterBridge.Service.csproj -c Release -r win-x64 --self-contained false -o .\artifacts\service
dotnet publish src\Forge.PrinterBridge.Tray\Forge.PrinterBridge.Tray.csproj -c Release -r win-x64 --self-contained false -o .\artifacts\tray
```

Service assembly / exe name: **`ForgePrinterBridge.Service`** / `ForgePrinterBridge.Service.exe`  
Tray assembly / exe name: **`ForgePrinterBridge.Tray`** / `ForgePrinterBridge.Tray.exe`

## Install paths (spec)

| Purpose        | Path                                                   |
| -------------- | ------------------------------------------------------ |
| Binaries       | `C:\Program Files\Forge Public Safety\Printer Bridge\` |
| App data       | `C:\ProgramData\Forge Public Safety\Printer Bridge\`   |
| Config         | `...\Config\`                                          |
| Queue / SQLite | `...\Queue\bridge.db`                                  |
| Cache          | `...\Cache\`                                           |
| Logs           | `...\Logs\`                                            |
| Diagnostics    | `...\Diagnostics\`                                     |
| Updates        | `...\Updates\`                                         |
| Bluetooth      | `...\Bluetooth\`                                       |

Credentials are stored with **Windows DPAPI** (`credentials.dpapi`), not plain JSON.

Named pipe (Phase 2 Bluetooth IPC): `\\.\pipe\ForgePrinterBridgeBluetooth`

### IPC security (spec §55)

Pipe ACL should allow only the Forge Printer Bridge Service, the authorized logged-in user, and the Bluetooth companion. Do not use localhost HTTP for IPC.

## Windows Service

- Display name: **Forge Printer Bridge Service**
- Internal name: `ForgePrinterBridgeService`
- Hosting: .NET Worker + `UseWindowsService` / `AddWindowsService`
- Recommended startup: **Automatic (Delayed Start)**
- Recovery: restart on first, second, and subsequent failures

Example sc.exe notes (installer will own the final registration):

```powershell
sc.exe create ForgePrinterBridgeService binPath= "C:\Program Files\Forge Public Safety\Printer Bridge\ForgePrinterBridge.Service.exe" start= delayed-auto
sc.exe failure ForgePrinterBridgeService reset= 86400 actions= restart/5000/restart/5000/restart/5000
```

Closing the tray application **does not** stop the Windows service.

## Configuration

`appsettings.json` (service):

```json
{
  "Cloud": {
    "ApiBaseUrl": "https://api.forgepublicsafety.com",
    "WebSocketPath": "/printer-bridge/v1/connect",
    "HeartbeatIntervalSeconds": 30
  },
  "Bridge": {
    "IncludeVirtualPrinters": false,
    "BluetoothWaitingTimeoutMinutes": 15,
    "LaunchBluetoothCompanionIfMissing": false,
    "BluetoothCompanionPath": null
  }
}
```

Override with environment variables using standard .NET configuration, or place machine config under ProgramData.

## Phase 1 vs Phase 2

| Capability                                | Phase 1      | Phase 2                               |
| ----------------------------------------- | ------------ | ------------------------------------- |
| Windows Service + tray                    | Yes          | —                                     |
| Printer discovery (System.Printing)       | Yes          | —                                     |
| Spooler printing                          | Yes          | —                                     |
| Cloud WSS + heartbeat                     | Yes          | —                                     |
| Artifact download + SHA-256               | Yes          | —                                     |
| Job idempotency                           | Yes          | —                                     |
| DPAPI credentials                         | Yes          | —                                     |
| Bluetooth companion / Brady Web SDK       | Docs only    | Yes (`Forge.PrinterBridge.Bluetooth`) |
| `WAITING_FOR_PRINTER` on BLE out-of-range | —            | Yes                                   |
| Transport router                          | Spooler only | Spooler + Bluetooth                   |

See [docs/PHASE1.md](docs/PHASE1.md) and [docs/PHASE2.md](docs/PHASE2.md).

## Tray menu

Left- or right-click the **Forge Printer Bridge** tray icon (Windows system tray; use the ^ chevron if hidden):

Open Printer Bridge, Printer Status, **Connect Bluetooth Printer…** (starts companion), Refresh Printers, Test Print, Diagnostics, Settings, Check for Updates, Restart Service, About.

**About** should show `Version 1.1.0 (Phase 2)`. If that menu item is missing, you are on a Phase 1 tray — rebuild/republish from this repo (`artifacts\tray\ForgePrinterBridge.Tray.exe`) and also build the companion (`bluetooth-companion` → `npm run dist`).

**Bluetooth Companion** must exist at `C:\Program Files\Forge Public Safety\Printer Bridge\ForgePrinterBridge.Bluetooth.exe` (or under `bluetooth-companion\release\win-unpacked` for local/dev).

## License / product

Forge Industrial Safety — Forge Printer Bridge.
