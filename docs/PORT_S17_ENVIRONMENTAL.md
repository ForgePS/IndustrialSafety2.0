# Port slice 17: Environmental Safety

1.0 had no real environmental module. Under `legacy/forge-platform`, "environmental safety" was one more generic record type (default category `waste`) with a title and a free-text status. So this slice is built from the parity matrix row ("Waste/environmental records, inspections, events, permit/obligation tracking, corrective actions and reporting"). It is shaped around:
- permit conditions with recurring monitoring and reporting;
- spill and release reporting with agency notice;
- RCRA hazardous waste manifests, with the 40 CFR 262.42 exception report windows.

The 2.0 menu: Compliance Programs → **Environmental** (`/environmental`). It has tabs for **Overview**, **Events**, **Permits**, **Obligations** and **Waste**.

## What it does

- **Overview** (`/environmental`): four lists of what needs attention:
  - obligations overdue or due within 14 days;
  - open events;
  - permits expired or expiring within 90 days;
  - manifests needing follow-up or an exception report.

  It also has a **Report an event** button. People who can only report land here too.
- **Permits** (`/environmental/permits`, `/permits/new`, `/permits/[id]`, `/permits/[id]/edit`):
  - Fields: title, type (air, water discharge, stormwater, hazardous waste, SPCC plan, drinking water, other), permit number, agency, location, status (pending, active, terminated), issued, effective and expiry dates, an optional controlled document from the document library, and notes.
  - A permit in force needs its number. Expiry can't be before the effective or issued date.
  - The register and the permit show the state: pending, not yet in effect, active, expiring within 90 days, expired, or terminated.
  - A permit's page lists its obligations, with **Add obligation**.
  - A permit with obligations can't move to another location.
  - Archiving a permit pauses its obligations.
- **Obligations** (`/environmental/obligations`, `/obligations/new`, `/obligations/[id]`, `/obligations/[id]/edit`): recurring compliance tasks.
  - Fields: title, type (monitoring, report, inspection, training, plan review, renewal, other), frequency (weekly, monthly, quarterly, semiannual, annual, one time), next due date, location, optional permit, owner, and instructions.
  - Each is shown as overdue, due within 14 days, or on track.
  - **Record completion** takes the completion date (not in the future), a result (done, or problem found, which needs notes) and notes. It logs the occurrence and moves the due date on by one period, clamping to the end of the month. A one-time obligation becomes inactive.
  - Each occurrence can be recorded once. Two people recording at the same time can't both advance it.
  - Completions are append-only. Obligations can be paused and resumed.
- **Events** (`/environmental/events`, `/events/new`, `/events/[id]`, `/events/[id]/edit`):
  - Numbered `ENV-2026-0001` per company and year.
  - Types: spill or release, permit exceedance, complaint, notice of violation, other.
  - Fields: when it happened, location, optional permit, description, and immediate actions.
  - A spill also records the substance, quantity and unit, and where it went (air, surface water, stormwater, sewer, soil, groundwater, contained). Whether it was fully contained is also recorded.
  - Times can't be in the future.
  - **Reportable** events record the agency, when it was notified (not before the event) and its reference. The page flags "agency notice not recorded" until they're set.
  - **Corrective actions** on an event are Corrective Actions with an owner (personnel) and due date. The event shows each one's number and status. An action counts as done once its Corrective Action is pending verification, verified or closed. An action can be removed with a reason.
  - **Close** (with optional notes) is refused while the agency notice is missing on a reportable event, or while any action isn't done. The page lists what's in the way.
  - A closed event is frozen until it's **reopened** with a reason.
  - The list filters open and closed. Reporters can always open the events they reported.
- **Waste shipments** (`/environmental/waste`, `/waste/new`, `/waste/[id]/edit`): hazardous waste manifests.
  - Fields:
    - manifest tracking number: 9 digits + 3 letters, with spaces and dashes stripped and letters uppercased;
    - shipped date and location;
    - generator status at shipment (very small, small or large quantity generator);
    - waste description and EPA waste codes (a comma list, uppercased and de-duplicated);
    - quantity and unit;
    - transporter and receiving facility;
    - when the signed copy came back, and when an exception report was filed.
  - Each manifest number is used once per company.
  - The list shows each manifest's state:
    - signed copy received;
    - not required for a very small generator;
    - exception report filed;
    - waiting;
    - for a large generator, follow up with the facility after 35 days, and an exception report due after 45;
    - for a small generator, an exception report due after 60 days.
  - Shipments can be archived and restored.
- **Report:** an **Environmental events** report in the report catalog. Its columns are number, time, type, location, substance, quantity, unit, media, reportable, agency, notice time, status and closed time. It covers the last 12 months by default and is scoped like the events list.
- Everything is written to the audit log.

## Scope

- Location-scoped people see and change records at their own locations only.
- Every action re-checks permission and location on the server, whatever the page showed.

## Permissions

- `environmental.view`: see permits, obligations, events and shipments. Scopeable.
- `environmental.report`: report events and add to open ones. Scopeable.
- `environmental.manage`: manage permits, obligations, shipments and events; record completions; close and reopen events. Scopeable.
- **Grants:**
  - Read-only: view, company-wide.
  - Supervisors: view and report, at location scope.
  - Location administrators: everything, at location scope.
  - Safety managers, company admins, company administrators and owners: everything, company-wide.
  - Employees: none.

## Schema

`20261120140000_s17_environmental.sql`:
- **Feature and menu:** the `environmental` feature, with plan entitlements (internal-demo, enterprise), and the menu entry `nav.environmental` under Compliance Programs.
- **Numbering:** `forge_env_sequences` and `next_forge_env_number(org)` (service role only).
- **Tables:**
  - `forge_env_permits`: checked type and status; a permit in force has its number; date order.
  - `forge_env_obligations`: checked type and frequency; an active obligation has a due date. Removed with its permit.
  - `forge_env_obligation_completions`: one per obligation and due date; a problem has notes.
  - `forge_env_events`:
    - checked type and media;
    - quantity and unit together;
    - a spill names its substance and media;
    - an agency notice names the agency and isn't before the event;
    - closed has its time;
    - a closed reportable event has its notice.
  - `forge_env_event_actions`: one Corrective Action each; removal needs a reason.
  - `forge_env_waste_shipments`: checked manifest format, generator status and units; quantity above zero; dates not before shipping; a manifest number used once per company among unarchived shipments.
  - All have RLS on, no anon or authenticated access, and service role only.
- **Trigger `forge_env_guard`:**
  - Companies never change.
  - Locations, permits, documents and owners stay in one company, and owners are active members.
  - Completions can't be edited.
  - An action's event and Corrective Action are fixed.
  - Event numbers never change.
  - A closed event is frozen, except for:
    - reopening;
    - links cleared when a permit or user is deleted.

## Tests

- **Unit:** `node --experimental-strip-types --test apps/web/tests/port-s17-environmental-rules.test.cjs` (7). Covers dates and month clamping, the permit form and state, obligations and completions, the event form, close blockers, the shipment form, and manifest states.
- **Database:** `node apps/web/tests/port-s17-environmental-db.cjs`. Covers:
  - numbering;
  - permit, obligation and completion checks;
  - one company and member owners;
  - append-only completions;
  - event checks, a fixed number, and the agency notice before closing;
  - frozen closed events and reopening;
  - action removal;
  - manifest format, dates and uniqueness;
  - no direct access;
  - permissions and grants.
- **Playwright:** `port-s17-environmental.spec.cjs` (4). Covers:
  - an employee kept out;
  - a permit refused without its number, then saved and expiring soon, with an overdue quarterly obligation added from it. Both show on the overview. Recording a completion with a problem needs notes, then logs it and clears the overdue state;
  - a reportable diesel spill refused without its media, then recorded. A corrective action is added. Closing is refused until the agency notice is recorded and the Corrective Action is pending verification, then the event closes and can't be edited;
  - a 50-day-old large generator manifest, with its number and codes normalized. It shows as exception report due on the list and the overview, and is cleared by recording the exception report. The events report is in the catalog.
- **Not in CI:** like slices 8–16, these aren't in the CI workflow yet.

## Remaining

- Reminders: a cron emailing owners about obligations due and permits expiring, and an alert to environmental managers when a reportable event is raised.
- Monitoring data: sample results against permit limits, with exceedances raised automatically.
- Emissions and waste totals: monthly generator status counting, and air emissions inventories.
- Inspections: SPCC, stormwater (SWPPP) and satellite and central accumulation area checklists, possibly through the inspections module.
- Attachments on events and shipments (photos, the signed manifest copy).
- Linking events to incidents.
- 1.0 data migration: 1.0's generic `waste` records.
