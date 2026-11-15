# Forge Printer Bridge installer

## For end users (recommended)

1. Get **`ForgePrinterBridgeSetup.exe`** from IT (built under `artifacts/setup/`).
2. Double-click it and approve the Windows security prompt.
3. In Forge: **Print Manager → Printer Bridges → Add** → create a code → **Open Printer Bridge on this PC** → enter the code.

Silent deploy (Intune / SCCM / script):

```text
ForgePrinterBridgeSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
```

## Build Setup.exe (developers / release)

```powershell
cd forge-printer-bridge
powershell -ExecutionPolicy Bypass -File .\installer\Build-Setup.ps1
```

Requires:

- .NET 8 SDK (to publish service/tray)
- Inno Setup 6+ (`winget install --id JRSoftware.InnoSetup -e`)
- Brady Bluetooth companion unpack at `bluetooth-companion/release/win-unpacked` (or `artifacts/tray/Bluetooth`) for BLE support

Output: `artifacts/setup/ForgePrinterBridgeSetup.exe`

## Dev install without Setup.exe

Double-click `Install Forge Printer Bridge.cmd` (uses published artifacts + PowerShell). Prefer building Setup.exe for anyone who is not a developer.
