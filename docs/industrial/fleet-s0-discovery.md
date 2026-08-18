# FLEET-S0 Discovery Checkpoint

**Date:** 2026-08-17  
**Pilot tenant:** `producers-rice-mill` only (Vehicle Spreadsheet.xlsx)  
**Architecture:** Aurora Model A (not Firestore)

## Spreadsheet → domain

| Sheet | Rows | Default `assetType` | Status |
|-------|------|---------------------|--------|
| Personal | ~38 | PASSENGER_VEHICLE | ACTIVE; fringe flag |
| Fleet | ~42 | FLEET_VEHICLE | ACTIVE; commute column |
| Bob-Trash Trucks | ~19 | BOB_TRUCK / TRASH_TRUCK | 2290, IRP |
| Big Trucks | ~13 | TRACTOR_TRUCK / DUMP_TRUCK | 2290, IRP |
| Const. Equipment | ~11 | CONSTRUCTION_EQUIPMENT | ACTIVE |
| Removed | ~15 | (preserve type if known) | REMOVED |

Shared columns: Year, Make, Model, Color, VIN, License, Ren Date, Location, Assigned Driver, County Assessed, Insured?, Mileage, Notes.

## REUSED

- Tenants / RLS / Cognito auth
- Permissions `industrial.fleet.view` / `industrial.fleet.manage`
- Module registry `FLEET` + flag `industrial.module.fleet.enabled`
- Sites (`industrial_sites`), Personnel (`industrial_personnel`, company drivers)
- Import platform template `industrial.fleet.v1` (extended)
- Sneat Industrial shell, Incidents/Personnel UI patterns
- Notifications table/infra (0032)
- Existing `industrial_fleet_vehicles` / `_drivers` / `_driver_settings` tables

## EXTENDED

- Vehicle columns for asset type, registration, compliance, fringe/commute, disposition
- Driver Drizzle model aligned to live DDL (MVR, insurance dates, site, DOB)
- Flat Model A fleet APIs beyond thin tenant list/create
- Company Drivers remains Personnel read-through; Fleet Drivers is editable roster

## NEW

- History: assignment, mileage, engine hours, maintenance, fleet documents
- FleetWorkspace UI (`/modules/fleet`)
- VIN check-digit helper
- producers-rice-mill-only spreadsheet seed scripts
- Fleet reports + settings surfaces

## Schema drift fixed in S1

Drizzle lacked: `assigned_driver_id`, driver MVR/insurance/site/employee_number/DOB/notes, `industrial_fleet_driver_settings`.
