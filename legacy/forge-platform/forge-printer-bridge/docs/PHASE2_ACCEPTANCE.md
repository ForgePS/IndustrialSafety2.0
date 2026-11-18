# Forge Print Bridge — Phase 2 (Windows spooler path)

## Acceptance checklist

1. In Forge: **Settings → Printer Bridges** (or Print Manager → Bridges) create a pairing code.
2. On the Windows PC: tray icon → **Register with Forge…** → paste code → Register.
3. Service restarts and heartbeats; discovered printers appear as **Unpublished**.
4. Admin clicks **Publish** on the target printer.
5. Admin clicks **Test** — job is claimed by the bridge and printed via Windows spooler.

## What Phase 2 closed

- Tray pairing UI (`Register with Forge…`)
- Claim payloads include `windowsQueueName` / device ids so the correct queue is used
- Discovered printers default to unpublished until Publish
- Publish / Unpublish + Test on Printer Bridges and Print Manager → Printers
- Rolling file logs under `%ProgramData%\Forge\PrinterBridge\Logs`

## Deferred

- MSI installer / auto-updater
- Direct ZPL / label designer
- Named-pipe tray↔service status
