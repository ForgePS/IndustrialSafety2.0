# Port slice 11: Fleet & DVIR (Industrial 1.0 → 2.0)

2.0 had DOT driver files and the insurance driver roster (slice 5), but no vehicles. This slice ports 1.0's Fleet module:
- vehicles;
- driver assignment;
- mileage and engine hours;
- registration, insurance and tax renewals;
- vehicle documents;
- maintenance;
- Driver Vehicle Inspection Reports (DVIRs), with mechanic certification and the next driver's review;
- vehicle QR codes;
- reminders;
- 1.0 spreadsheet import.

Drivers stay in DOT Compliance. The Fleet **Drivers** tab reads them from there.

1.0 reference (under `legacy/forge-platform/apps`):
- **API:** `platform-api/src/modules/industrial/`: `industrial-fleet.service.ts`, `dvir-helpers.ts`, `dvir-print.ts`, `industrial-public-dvir.controller.ts`, `scan-actions.ts`, and `industrial-domain.service.ts` (DVIR, roster).
- **Web:** `industrial-web/src/`: `components/fleet-workspace.tsx`, `fleet-asset-workspace.tsx`, `dvir-*.tsx`, `lib/fleet.ts`, `lib/dvir.ts`.
- **Import template:** `packages/imports/src/templates.ts` (`industrial.fleet.v1`).

## Data

Migrations:
- `20261118100000_s11_fleet.sql`
- `20261118101000_s11_vehicles.sql`: removal and restore.
- `20261118103000_s11_maintenance.sql`: links a repeat to the item it follows.

| Table | Holds |
| --- | --- |
| `forge_fleet_vehicles` | Every 1.0 column: unit, type, year / make / model, VIN, plate and state, registration date or month, location, division, assigned driver, DOT-regulated, status, mileage, engine hours, insurance details, county assessment, commute use, fringe, Form 2290, IRP, disposition. New: GVWR and annual inspection due date. Numbered `VEH-000001`. VIN and unit number are unique among active vehicles. |
| `forge_fleet_assignment_history` | Every driver assign / unassign. Written by a trigger, so editing a vehicle can't skip it as it could in 1.0. |
| `forge_fleet_meter_readings` | Mileage and engine hours. Each reading updates the vehicle. A lower reading is refused unless it is marked as a correction. Sources: manual, DVIR, maintenance, import. |
| `forge_fleet_status_history` | Every status change, with the reason and source (record edit, DVIR, DVIR certified, scan, scan issue, disposal, import). |
| `forge_fleet_dvirs` / `forge_fleet_dvir_defects` | DVIRs numbered `DVIR-<year>-000001`. Holds the 54-item checklist answers and the driver, mechanic and review signatures. Status: open → needs review → closed. One defect row per "No" answer. |
| `forge_fleet_maintenance` | Maintenance numbered `FM-<year>-000001`: type, open / completed / canceled, due by date and/or mileage, vendor, cost, repeat interval, and the DVIR it came from. |
| `forge_fleet_documents` | Title, registration, insurance, inspection and other documents with expiry dates. Stored in the private `forge-fleet` bucket; 1.0 kept them inline in the database. |
| `forge_fleet_settings` | Whether a DVIR defect takes the vehicle out of service and opens a repair (both on by default), the reminder window, and the DVIR retention period. |
| `forge_fleet_activity`, `forge_fleet_notice_log` | The vehicle's activity feed, and the reminders already sent. |

- **Guards:**
  - A submitted DVIR can't be changed.
  - The mechanic's and reviewer's signatures can't be changed once signed.
  - A review needs the mechanic's signature first.
  - A DVIR can't be deleted while a defect is open or within 3 months (49 CFR 396.11).
- **Access:** all fleet tables are server only.
- **QR codes:** `forge_qr_codes.target_type` adds `vehicle`, and scan issue reports get `vehicle_id`.

## Permissions

| Permission | Employee | Supervisor / location admin | Safety manager, company admin / owner |
| --- | --- | --- | --- |
| `fleet.view` | own (assigned vehicles) | location | organization |
| `fleet.dvir`: fill out DVIRs, sign the next-driver review (new) | own | location | organization |
| `fleet.maintenance` | | location | organization |
| `fleet.dvir_certify`: mechanic certification (new) | | location | organization |
| `fleet.export`: print and reports (new) | | location | organization |
| `fleet.create`, `fleet.edit`, `fleet.retire` | | | organization |
| `fleet.settings` (new) | | | organization |

Read-only users get `fleet.view` for the whole company. Location and division scopes also include the vehicles assigned to you. The **Fleet** menu entry (Equipment & Operations) is now live.

## Vehicles (`/fleet`)

- **Dashboard:**
  - vehicles in service, out of service and inactive;
  - insured and not insured;
  - vehicles by type;
  - registration renewals by how soon they're due;
  - open DVIR defects;
  - maintenance overdue and due soon;
  - the out-of-service list with reasons.
- **Vehicles list:** search by unit, VIN, plate, make / model or driver. Filters for type, status, location, insured, DOT-regulated and overdue registration.
- **Vehicle form:**
  - All fields, grouped.
  - A soft VIN check (length, letters, check digit) warns but never blocks a save.
  - Starting mileage is saved as a meter reading.
  - Assigning a driver who isn't a company driver yet turns that on, so DOT adds them to the insurance roster (as 1.0 did).
- **Vehicle page:**
  - **Actions:**
    - assign or unassign a driver;
    - record mileage or engine hours (a lower value needs "this is a correction");
    - out of service with a reason, or return to service;
    - remove as removed, sold or disposed, with date and notes;
    - archive.
  - **Sections:** assignment, meter, status and activity history; documents (upload, download, archive); recent DVIRs; open maintenance; QR codes.
- **Renewals:** registration, insurance, annual inspection and document expiries, grouped as overdue / 30 / 60 / 90 days / later.
- **Removed:** removed, sold and disposed vehicles, with a restore button.
- **Import from 1.0:**
  - Upload a CSV in 1.0's fleet template, or in our own export's format. Run a dry run first, then import.
  - **Matching:** rows match an existing vehicle by VIN, then unit number, then plate, and re-importing adds nothing. A row with none of the three is refused (1.0 duplicated those).
  - **Mileage:** mileage comes in as a meter reading. A lower mileage on an existing vehicle is reported, not applied.
  - **Drivers:** matched by employee number or exact name.
- **Reports:** inventory and removed-vehicle CSVs.

## DVIRs (`/fleet/dvirs`)

- **The checklist:** the same as 1.0's paper form: 35 truck items, 5 safety items and 14 trailer items, for both pre-trip and post-trip.
  - Each item is Yes, No or N/A, with an "All OK" button per section. A "No" needs a note.
  - "Condition satisfactory" isn't allowed with a defect.
  - Driver name and signature are required.
  - The odometer updates the vehicle's mileage if it isn't lower than the current reading.
- **When there's a defect** (fixes over 1.0, both on by default):
  - The vehicle goes **out of service**.
  - A **repair** maintenance record opens.
  - Mechanics with `fleet.dvir_certify` covering the vehicle are **notified**.
- **Mechanic certification:** "defects corrected" or "no correction needed", with notes and a signature.
  - Corrected completes the repair record; "not needed" cancels it.
  - Once no other DVIR on the vehicle is open, it returns to service.
- **Next driver's review:** needs a signed-in user with `fleet.dvir`. 1.0 let anyone holding the sticker link sign it. The review closes the DVIR.
- **List filters:** vehicle, follow-up (needs mechanic, needs review), trip and dates.
- **Print:** a single DVIR in the paper layout with all three signatures, or a day sheet with every DVIR for a vehicle on a date.
- **From a vehicle QR** (`/scan/<token>/dvir/pre_trip` or `post_trip`):
  - Employees identified by number can fill in the DVIR without a login, and so can signed-in users with `fleet.dvir`.
  - It is offered only for DOT-regulated vehicles that aren't out of service or removed. This is checked again on submit; 1.0 kept accepting DVIRs after DOT regulation was turned off.

## Maintenance (`/fleet/maintenance`)

- **Creating an item:** pick from 1.0's preset jobs or enter your own. Due by date and/or mileage, with vendor and cost, and it can repeat every N days or N miles. 1.0 had no recurring maintenance.
- **List:** shows open items, overdue first. "Due soon" means within the reminder window or 500 miles.
- **Completing:** records the date, odometer (written as a meter reading), cost and notes, and opens the next item for repeating maintenance. Canceling needs a reason.

## Drivers (`/fleet/drivers`)

- **What it shows:** company drivers (the insurance roster) and DOT-qualified drivers, merged into one row per person. Each row has:
  - roster status;
  - license, medical card and MVR expiry badges;
  - the vehicles assigned to them.
- **Read only:** drivers are edited in DOT Compliance, linked for users with `dot.view`.

## Reminders (`/api/fleet/cron`)

- **Calling it:** the route needs `Authorization: Bearer $FORGE_CRON_SECRET`, like the other cron routes.
- **What it covers:**
  - registration due;
  - insurance expiring;
  - annual inspection due;
  - maintenance due soon or overdue;
  - DVIR defects open for more than 24 hours;
  - vehicle documents expiring.
- **Recipients:**
  - Holders of `fleet.edit` get every reminder.
  - Holders of `fleet.maintenance` get the maintenance and DVIR reminders.
  - In both cases, only for vehicles within their scope.
- **Delivery:**
  - Each reminder goes to each person once per due date. Moving the due date reminds them again.
  - Everyone gets one digest per run, in-app and by email (sent by the existing email dispatcher).
- **1.0:** saved notification settings but sent nothing.

## Scan (vehicle QR codes)

- **Creating one:** in QR Management, a QR can point to a fleet vehicle (scan menu only). The vehicle page lists its QR codes and has **Create QR**.
- **The scan menu for a vehicle:**
  - Pre-trip / Post-trip DVIR (DOT-regulated units that are in service);
  - report an issue;
  - out of service / return to service;
  - vehicle history;
  - linked forms;
  - the vehicle record.

  Vehicles have no daily / weekly / monthly inspections or LOTO.
- **Out of service from a scan:** writes fleet status history (source "scan") and removes the DVIR actions until the vehicle is back in service.
- **Issue reports** on a vehicle:
  - create a Corrective Action linked to the vehicle;
  - can take the vehicle out of service;
  - also notify `fleet.edit` holders.
- **History** lists, for the vehicle:
  - status changes;
  - DVIRs with defects and follow-up;
  - maintenance;
  - issues;
  - scans.

## Changes from 1.0

- **History can't be skipped:** assignment and meter history are written for every change.
- **Mileage:** a lower reading must be marked as a correction.
- **Defects:** a defective DVIR takes the vehicle out of service, opens a repair and notifies mechanics (each can be turned off in settings). 1.0 did none of this.
- **Retention:** DVIRs are never deleted while a defect is open, or within 3 months. 1.0's purge deleted open DVIRs.
- **Review and certification:** the next-driver review needs a signed-in user with permission, and certification checks the record really is a DVIR.
- **Out-of-service rules:** only "out of service" hides the DVIR actions; 1.0 also hid them for inactive vehicles.
- **Turning off DOT regulation:** stops scan DVIRs for that vehicle.
- **Documents:** stored as files in private storage, not inline in the database.
- **Recurring maintenance and reminders** exist; 1.0 had neither.
- **Import:** re-importing doesn't duplicate vehicles.

## Not ported / gaps

- **Not in 1.0 either:** fuel logs, and Firebase's older fleet suite (work orders, PM programs, fleet checks), which 1.0 never migrated.
- **The custom report builder:** only the inventory and removed CSVs are ported.
- **Reminder scheduling:** the cron route exists, but it isn't scheduled in the hosting platform yet.
- **Notices:** the original driver isn't notified when the mechanic certifies.
- **Maintenance costs:** not totalled on the vehicle page.
- **Forklifts / powered industrial trucks:** a separate matrix row, not part of this slice.
- **Scope testing:** no browser test covers location-scoped or own-scoped users. The scope rules are checked in code, and the scan rules have unit tests.

## Code

- **Rules (pure):** `apps/web/src/lib/`
  - `forgeFleetRules.ts`
  - `forgeFleetDvirRules.ts`
  - `forgeFleetMaintenanceRules.ts`
  - `forgeFleetNotifyRules.ts`
  - `forgeFleetImportRules.ts`
- **Server:**
  - `forgeFleetAccess.ts` (scope, loaders, service status)
  - `forgeFleetVehicles.ts`
  - `forgeFleetImport.ts`
  - `forgeFleetDvirs.ts`
  - `forgeFleetMaintenance.ts`
  - `forgeFleetNotify.ts`
- **Pages:**
  - `apps/web/src/app/(back)/fleet/` (dashboard, vehicles, dvirs, maintenance, renewals, drivers, removed, import, reports, settings)
  - `apps/web/src/app/scan/[token]/dvir/`
  - `apps/web/src/app/api/fleet/cron/`
- **Components:** `apps/web/src/components/fleet/`.
- **Scan and QR changes:**
  - `forgeScanRules.ts`, `forgeScanContext.ts`
  - the `app/scan/` pages
  - `forgeScanHistory.ts`, `forgeScanIssues.ts`, `forgeScanNotify.ts`
  - the QR admin
  - `forgeResourceRegistry.ts` and `forgeRelationshipRegistry.ts` (new `fleet_vehicle` resource, so Corrective Actions can link to vehicles)
- **Storage:** `forge-fleet` was added to the storage bucket list.

## Tests

| File | What |
| --- | --- |
| `tests/port-s11-vehicles.test.cjs` | CSV parsing, header aliases, value conversion, match keys. |
| `tests/port-s11-dvirs.test.cjs` | "All OK", odometer decision, signatures, mechanic and review checks. |
| `tests/port-s11-maintenance.test.cjs`, `port-s11-fleet-cron.test.cjs` | Due states, repeats, reminder kinds and recipient scope. |
| `tests/port-s11-vehicle-scan.test.cjs` | Vehicle scan menu and permissions. |
| `tests/port-s11-fleet-cron.cjs` | Cron route: secret, one reminder per kind, one digest, no repeats, a moved due date reminded once. |
| `tests/port-s11-vehicles.spec.cjs` | Create with driver and mileage; edit; correction rule; out of service and back; documents; sold and restore; import dry run, import and re-import; renewals; inventory CSV. |
| `tests/port-s11-dvirs.spec.cjs` | Clean DVIR closes; defect → out of service and repair; certify → back in service and repair completed; review closes; signed parts can't be changed; print and day sheet; scan DVIR; non-DOT refused. |
| `tests/port-s11-maintenance.spec.cjs` | Repeating maintenance completed with mileage; cancel; overdue first; drivers tab; settings. |
| `tests/port-s11-vehicle-scan.spec.cjs` | Identify → DVIR; DOT and non-DOT menus; out of service from a scan; return; history; vehicle issue report; QR from the vehicle page. |
