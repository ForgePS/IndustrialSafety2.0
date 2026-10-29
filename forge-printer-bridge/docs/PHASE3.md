# Phase 3 — Direct Bluetooth, Batch, Failover, Media, Health

## Scope delivered

| Item                        | Where                                                                   |
| --------------------------- | ----------------------------------------------------------------------- |
| Direct Forge Web Bluetooth  | industrial-web Brady Web SDK client + `POST /printers/direct-bluetooth` |
| Direct Field Bluetooth      | field-web `/more/print` + equipment Print Label                         |
| Batch + sequential printing | `POST /print-batches` + ForgePrintDialog multi-item mode                |
| Failover                    | Printer profile `fallbackPrinterId` + UI confirm (`acceptFailover`)     |
| Advanced media profiles     | CRUD `/printer-media-profiles` + dialog select + bridges admin          |
| Advanced printer health     | Health columns, `GET .../health`, `POST .../diagnostics`                |

## Migration

`0096_industrial_printer_bridge_s3.sql` — profile failover, batch fields, printer health columns.

## Flags

`forge.printing.directBluetooth.enabled`, `.batch.enabled`, `.failover.enabled` (declared in contracts).

## Smoke

1. Bridge print from Equipment / Supplies / LOTO **Print Label**
2. Chrome/Edge: Pair Direct Bluetooth → print → job COMPLETED
3. Set fallback on printer profile → offline primary → confirm failover prompt
4. Field: `/more/print/` pair; equipment detail Print Label
