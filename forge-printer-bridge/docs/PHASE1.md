# Phase 1 — Forge Printer Bridge (Windows Spooler)

## Scope

Phase 1 delivers the always-on Windows bridge for USB / Ethernet / Wi-Fi printers:

1. **Forge.PrinterBridge.Service** — Worker Service with Windows Service lifetime
2. **Forge.PrinterBridge.Tray** — WinForms NotifyIcon UI (does not own service lifetime)
3. **Windows printer discovery** via `LocalPrintServer` / `System.Printing`
4. **WindowsSpoolerTransport** via `System.Drawing.Printing` + `System.Printing`
5. **Brady i4311 300 DPI helpers** (`InchesToPixels`)
6. **Local SQLite queue** under ProgramData with completed-job idempotency
7. **Cloud client** — HTTPS pairing + outbound `ClientWebSocket`, 30s heartbeat, `print.job.available` handling (signed URL download + SHA-256 verify + enqueue + status events)
8. **DPAPI credential store** for device token / bridge credentials
9. **Diagnostics** — cloud URL, credentials present, spooler reachable

## Explicitly out of scope

- Inventing or reverse-engineering Brady BLE
- Automatic updater implementation (project stub only)
- MSI/EXE installer packaging (placeholder under `installer/`)

> **Phase 2 note:** Bluetooth companion IPC, `BluetoothCompanionTransport`, and tray companion launch live in Phase 2 — see [PHASE2.md](./PHASE2.md). Phase 1 remains the Windows spooler path only.

## Key types

| Area | Type |
|------|------|
| Transport contract | `IPrinterTransport` (spec §58) |
| Spooler impl | `WindowsSpoolerTransport` |
| Discovery | `WindowsPrinterDiscovery` + `VirtualPrinterFilter` |
| Idempotency | `JobIdempotencyService` + `completed_jobs` table |
| Cloud | `CloudConnectionClient` |
| Secrets | `DpapiCredentialStore` |

## Acceptance focus (Phase 1)

- Bridge service stays running without an interactive Forge browser session
- Discovered Brady i4311 queues can receive spool jobs
- Duplicate cloud delivery of a completed `jobId` does not reprint
- Virtual printers (PDF / XPS / Fax / OneNote) filtered by default
- Tray exit leaves service running
