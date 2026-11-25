# Port slice 19: Forklifts

1.0's Forklifts module (`legacy/forge-platform`: `industrial_forklift_records`, `industrial-domain.service.ts`, the field app's `forklift-browser.tsx`) was a table of titled rows with a free-text status. The person's qualifications list showed them as "Forklift qualification". 1.0 had none of these:
- truck details;
- pre-shift checklist;
- defects or out of service;
- training or evaluation dates;
- expiry.

This slice therefore follows the parity matrix and OSHA 1910.178 rather than 1.0's code:

| Rule | What the slice does |
|---|---|
| (a)(4) | The nameplate must show the capacity with the attachments fitted. A truck with attachments and no nameplate check shows a warning. |
| (l) | Operators are trained and evaluated before they operate, and evaluated again at least every three years. Refresher training and a new evaluation follow an accident or near miss, unsafe operation, a poor evaluation, a different type of truck, or a workplace change. |
| (q)(7) | Trucks are examined before use, at least daily. A defect affecting safe operation takes the truck out of service until it is repaired. |

Menu: **Equipment & Operations** → Forklifts (`/forklifts`).

## Built on Assets

A forklift is an asset (`forge_assets`, type "Forklift / Powered Industrial Truck") with a forklift profile. These come from the asset:
- number, name, location and status;
- hour meter;
- maintenance;
- QR codes and status history.

Existing equipment can be set up as a forklift, so companies that already track their trucks as assets keep their history.

## What it does

### Overview (`/forklifts`)

- Counts: trucks in service and out of service, trucks not checked today (in the company's time zone), and open and critical defects.
- Lists: the out-of-service list with its reasons, trucks not checked today, and open critical defects.
- An operator summary: authorized, due for re-evaluation, expired, needs refresher and suspended, each linking to the filtered operator list.

### Trucks (`/forklifts/trucks`)

- **Profile:**
  - truck class I–VII (OSHA / ITA classes, with descriptions);
  - type of truck and power source. A class that doesn't match the power source is flagged; for example, Class I–III trucks are electric.
  - rated capacity, load center and maximum lift height;
  - attachments, and the date the nameplate was checked against them;
  - UL type designation (E, ES, EE, EX, D, DS, DY, G, GS, LP, LPS, CN, CNS), which says where the truck may be used;
  - notes.
- **Truck page:**
  - a red out-of-service banner;
  - take out of service with a reason, or return to service;
  - report a defect;
  - start a pre-shift check;
  - open defects, recent checks and history, with a link to the asset.

### Pre-shift checks

- **Checklist:** 21 built-in items in two sections: a visual check with the engine off, then an operational check.
  - Each item applies to every truck or only to some power sources. For example, battery and deadman switch items are for electric trucks, and LPG cylinder and engine fluid items for engine trucks.
  - Items are critical or not.
  - Some allow N/A, such as the fire extinguisher and lights, which apply only if fitted.
  - Companies add their own items, and archive them instead of deleting.
- **Answers:**
  - Every item that applies is answered once: OK, Defect or N/A.
  - A defect needs a description, and N/A is allowed only where the item permits it.
  - The hour meter reading can't be lower than the last reading.
- **Operator:**
  - The check is done by the operator.
  - When settings require it, the operator must be authorized for the truck's class today. A truck released to an unauthorized operator is what (l) forbids.
  - The page says so before the operator starts.
- **Defects:**
  - Each defect opens a defect record on the truck.
  - A critical defect takes the truck out of service at once, with the failed items as the reason (this can be turned off in settings).
  - Non-critical defects stay open while the truck stays in service.
- **Out of service:** an out-of-service truck can't be checked out for use.
- **Records:** checks can't be changed or deleted. Each one has a read-only view and a print layout.

### Defects (`/forklifts/defects`)

- **Closing:** defects close as repaired or not a defect, with a note. A repair can also be recorded as corrective maintenance on the asset.
- **Back in service:** a truck with an open critical defect can't be returned to service by any route, whether the forklift page, the asset record, or a QR scan. The database refuses it.

### Operators (`/forklifts/operators`)

- **Authorization records:**
  - the truck classes the person may operate;
  - the date of formal and practical training;
  - the evaluation date and the evaluator;
  - notes and restrictions;
  - expiry: the evaluation date plus the evaluation interval (36 months by default; settings allow 6–36).
- **Rules:**
  - Dates can't be in the future, and the evaluation can't be before the training.
  - An evaluation older than the interval is refused.
  - Nobody evaluates or authorizes themselves.
- **Training:** when the company names a required course, authorization needs a current completion of it. A lapsed completion also stops the person operating.
- **Standing:** authorized, re-evaluation due soon, evaluation expired, needs refresher training, suspended, revoked, or training not current.
- **Actions:**
  - suspend and reinstate;
  - revoke;
  - require refresher training, with the (l)(4)(ii) reasons and an optional incident;
  - record a new evaluation, which clears a refresher requirement and restarts the clock.
- **Operator page:** the operator's checks, linked incidents and history.
- **Wallet card:** a printable operator card.

### Incidents

Incidents can be linked to a truck, an operator or both, from the truck and operator pages. Requiring refresher training with an incident also links it to the operator.

### Elsewhere

- **Equipment page:** an asset that is a forklift shows a card linking to its forklift page.
- **Personnel page:** a person who is an operator shows a forklift authorization card with their standing, classes and expiry. 1.0 listed this as "Forklift qualification".
- **Dashboard:** What Needs Your Attention gets "Forklift operators due for re-evaluation" for people with `forklifts.authorize`.

### Notices and reminders

- **Status changes:** suspend, revoke and require refresher tell the operator's linked user, unless they did it themselves.
- **Reminders:** `GET /api/forklifts/cron` (same auth as the other crons) sends them in-app and by email, each once per operator, kind and expiry date:
  - authorization due for re-evaluation within the reminder window, to people with `forklifts.authorize` at the operator's location and to the operator;
  - authorization expired, to the same authorizers.

### Settings (`/forklifts/settings`)

- **Operators:**
  - the evaluation interval;
  - whether checks need an authorized operator;
  - whether training is required, and the course;
  - the reminder window.
- **Trucks:** whether a critical defect takes the truck out of service.
- **Checklist:** the company's own checklist items.

## Permissions

| Permission | Lets you |
|---|---|
| `forklifts.view` | See trucks, checks, defects and operators |
| `forklifts.check` | Do pre-shift checks and report defects |
| `forklifts.manage` | Add and edit trucks, close defects, take out of service and return, link incidents, checklist and settings |
| `forklifts.authorize` | Record training and evaluations, authorize, require refresher, suspend, reinstate and revoke |

All four can be scoped to locations: trucks by the asset's location, and operators by the person's location. Default grants by role:

| Role | Permissions |
|---|---|
| Employee | View and check (location) |
| Read-only | View (organization) |
| Supervisor | View and check (location) |
| Location administrator | All four (location) |
| Company administrator, owner, safety manager, company admin | All four |

## Schema

`20261124100000_s19_forklifts.sql`:
- **Tables:**
  - `forge_forklift_settings`;
  - `forge_forklifts`, the profile, one per asset;
  - `forge_forklift_check_items`; built-in items have no organization;
  - `forge_forklift_operators`, one per person;
  - `forge_forklift_checks` and `forge_forklift_defects`;
  - `forge_forklift_incident_links`, `forge_forklift_activity` and `forge_forklift_notice_log`.
- **Asset changes:**
  - Asset type gains "forklift".
  - Asset status history gains the sources `forklift_check` and `forklift_defect`.
- **Workflow functions** (service role only; they raise plain-language errors):
  - `forge_forklift_create`;
  - `forge_forklift_record_check`;
  - `forge_forklift_report_defect`, `forge_forklift_resolve_defect`;
  - `forge_forklift_take_out_of_service`, `forge_forklift_return_to_service`;
  - `forge_forklift_authorize`, `forge_forklift_set_operator_status`;
  - `forge_forklift_operator_problem`.
- **Guards:**
  - Checks and history are append-only.
  - Defects and operators change only inside the workflow functions.
  - Built-in checklist items are fixed.
  - A profile stays on its asset.
  - Every link stays inside one company.
  - An asset guard keeps a forklift with an open critical defect out of service.

## Tests

- **Unit:** `node --experimental-strip-types --test apps/web/tests/port-s19-forklift-rules.test.cjs` (12)
- **Database:**
  - `node apps/web/tests/port-s19-forklifts-db.cjs` (8 groups; needs Docker). It covers trucks, operators, checks and defects, settings, the checklist, guards, no direct access, and grants.
  - `node apps/web/tests/port-s19-forklifts-cron.cjs` (9): reminders sent once, to the right people only.
- **Playwright** (run one file at a time):
  - `port-s19-forklifts.spec.cjs` (7): trucks new and from equipment, edit, checks pass and fail, out of service and back, defects, company checklist items, view-only user.
  - `port-s19-operators.spec.cjs` (8): authorize with validation, standing, suspend / reinstate / revoke / refresher, re-evaluation, incident links, wallet card, personnel card, view-only user.
- **Clean-up:** tests create their own tagged personnel, then clean up as `supabase_admin` in replica mode, children first.

## Remaining

- Schedule `/api/forklifts/cron`.
- Pre-shift check from the truck's QR code by an employee identified by number. The check function already accepts `qr_scan` as a source.
- Overdue-check reminders: trucks used without a check today.
- The database decides "today" in UTC, while the pages use the company time zone. Near midnight they can differ by a day on expiry.
- Fuel and battery-charging logs, and charging-area checks.
- Load and attachment capacity calculations.
- Pedestrian / traffic plans for the area.
- 1.0 data migration: 1.0's records are generic, so at most titles and statuses.
