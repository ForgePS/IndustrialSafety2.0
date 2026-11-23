# Port slice 18: High-risk work permits

1.0's Confined Space, Hot Work, Working at Heights and Electrical Safety modules (`legacy/forge-platform`, `industrial-domain.service.ts` and the shared `high-risk-workspace.tsx`) were four identical tables of titled rows. Each had a free-text status and nothing else:
- no transition rules;
- no approver recorded;
- no expiry;
- no gas limits;
- no fire watch, rescue or training checks;
- any field user could approve, start or close a permit through the API.

This slice therefore follows the parity matrix rather than 1.0's code. All four types run on one shared Permit-to-Work engine, shaped around these rules:

| Permit type | Rules |
|---|---|
| Confined space | OSHA 1910.146 |
| Hot work | OSHA 1910.252(a) and NFPA 51B |
| Working at heights | OSHA 1910.28, 1910.140 and 1926.502 |
| Energized electrical work | NFPA 70E 130.2 |

Menu: **High-Risk Work** → Work Permits (`/permits`), Confined Space, Hot Work, Working at Heights, Electrical Safety.

## What it does

### Board (`/permits`)

The board shows:
- open permit counts for each type;
- who is inside a confined space right now;
- permits waiting for approval;
- active permits, with the time left (red under an hour);
- suspended permits, with the reason;
- permits past their end time that are still open.

### Permits

- **Numbering:** each type is numbered per company and year: `CSE-2026-0001`, `HW-…`, `WAH-…`, `EEW-…`.
- **Pages:** lists by type at `/permits/[type]`, filtered by status, location, text, and a past-end-time-only box.
- **Fields:**
  - location, plus the space for confined space;
  - title, work description and work area;
  - optional equipment and contractor company;
  - valid from and until, entered and shown in the company's time zone.
- **Details by type:**
  - Confined space: rescue service, communication, horizontal or vertical entry, and extra hazards.
  - Hot work: kind of work, whether a gas test is needed, designated area, and extinguisher.
  - Heights: working height and fall protection methods. A personal system needs an anchorage, and a rescue plan is always required.
  - Electrical:
    - voltage, with a hint below 50 V;
    - equipment;
    - why the work must be done energized (infeasible, or a greater hazard), with an explanation;
    - limited and restricted approach boundaries and the arc flash boundary;
    - incident energy or PPE category 1–4, and the PPE.
- **Drafts:** a draft saves even with details missing. The page shows what's missing, and sending the draft for approval checks everything.
- **People:** each type has its own roles, and the people can be company personnel or contractor workers.

  | Type | Required roles | Optional roles | Can't be combined |
  |---|---|---|---|
  | Confined space | Entry supervisor, attendant, entrants | Rescuers | The attendant can't also be an entrant |
  | Hot work | Operator, fire watch | | The fire watch can't also be the operator |
  | Heights | Workers, competent person | Rescuers | |
  | Electrical | Qualified persons | Safety watch | |

- **Checklist:** built-in items per type, such as the 35 ft rule for hot work, isolation for confined space, and anchorage rated for 5,000 lb for heights. Companies can add their own items.
  - Each item is answered yes, no, or not applicable. Not applicable is allowed only where the item permits it, and needs a note.
  - The checklist is fixed once the permit is issued.
- **Links:** to lockout procedures and controlled documents.
- **Print:** a print page to post at the job (`/permits/[type]/[id]/print`).
- **History:** every step goes into an append-only history, and changes are also audit-logged.

### Workflow

draft → waiting for approval → approved → active ⇄ suspended → closed. Anything before issue can be canceled with a reason.

- **Send for approval** checks:
  - the details;
  - the people;
  - the time window: it must still be in the future, and no longer than the type's maximum hours (12 by default);
  - for confined space, that the space is permit-required, not archived and at the same location.
- **Approve:** the requester can't approve their own permit unless settings allow it. Approval also checks training (below). **Send back** needs a reason and returns the permit to draft.
- **Issue** happens at the work. It needs:
  - the checklist complete;
  - training current;
  - the people in place;
  - for confined space, and for hot work that needs a test, a passing gas test that is recent enough (60 minutes by default).
- **Suspend:** anyone on the permit can stop the work, and must give a reason. **Resume** needs an approver, and for gas-tested permits, a new passing test taken after the suspension.
- **Gas tests:**
  - Each test records O₂, LEL, H₂S, CO, an optional other gas with its limit, the instrument, a bump test, the test point and a note.
  - Tests are checked against the company limits: O₂ 19.5–23.5%, LEL under 10% (hot work has its own setting), H₂S under 10 ppm, CO under 35 ppm.
  - Tests can't be changed once recorded. A failing test on an active permit suspends it at once, and the notice says to get everyone out of the space.
- **Confined space entry log:**
  - Only entrants named on the permit can sign in. Signing in needs an attendant on the permit and a current passing test, and isn't allowed after the end time.
  - Signing out is always allowed.
  - Nobody can be removed while inside. The last attendant can't be removed while people are inside.
- **Hot work:** "Work complete" starts the fire watch (60 minutes by default; settings allow 30 or more). The permit can't be closed until the fire watch is over.
- **Close:** refused while anyone is inside a confined space. Expired permits can still be closed, but can't be issued, resumed or entered.

### Training

In settings, a company can require a course for a role on a permit type, for example confined space entrant → "Confined Space Entry".
- Approve and issue are refused, naming the person and the course, unless the person has a current completion: passed or completed, approved, not archived and not expired.
- The permit page lists who is missing training.
- Contractor workers aren't checked against these requirements.

### Confined space register (`/permits/confined-space/spaces`)

- Each space records:
  - code and name, location and description;
  - whether it is permit-required, and its hazards;
  - entry points, isolation notes, rescue plan and last evaluation date.
- Each space lists its permits.
- A space with open permits can't be archived, moved, or reclassified as non-permit.

### Settings (`/permits/settings`)

- Settings cover:
  - self-approval;
  - whether training is required;
  - maximum hours per type;
  - gas limits;
  - how long a gas test stays valid;
  - fire watch minutes;
  - training requirements;
  - the company's checklist items.
- Anyone with `permits.manage` can view them; changing them needs it company-wide.

### Notices and reminders

In-app and email:

| Event | Who is told |
|---|---|
| Sent for approval | Approvers in scope |
| Approved, sent back (with the reason) or issued | The requester |
| Suspended | The requester and approvers, with urgent wording when a gas test failed |

Nobody is told about their own action.

`GET /api/permits/cron` (same auth as the other crons) sends reminders, each once per permit and time:
- ending within the hour;
- past the end time and still open;
- fire watch over, so the permit can be closed;
- confined space with people inside and the last gas test older than the valid time.

### Dashboard

What Needs Your Attention gets two items for approvers: "Permits waiting for your approval" and "Open permits past their end time".

## Permissions

| Permission | Lets you |
|---|---|
| `permits.view` | See permits, spaces, tests and entry logs |
| `permits.request` | Raise and edit drafts, name people, answer the checklist, send for approval, record gas tests, sign people in and out, stop work, and close permits you requested |
| `permits.approve` | Approve or send back, issue, resume and close |
| `permits.manage` | Keep the register, cancel, and change settings |

All four can be scoped to locations. Default grants by role:

| Role | Permissions |
|---|---|
| Employee | View (location) |
| Read-only | View (organization) |
| Supervisor | View and request (location) |
| Location administrator | All four (location) |
| Company administrator, owner, safety manager, company admin | All four |

## Schema

`20261123100000_s18_permits.sql`:
- **Tables:**
  - `forge_permit_settings`, `forge_permit_sequences`, `forge_confined_spaces`, `forge_permits`;
  - `forge_permit_check_definitions` (built-in items have no organization) and `forge_permit_checks`;
  - `forge_permit_people`, `forge_permit_training_requirements`;
  - `forge_permit_gas_tests`, `forge_permit_entries`, `forge_permit_links`;
  - `forge_permit_activity`, `forge_permit_notice_log`.
- **Workflow functions** (service role only; they raise plain-language errors):
  - `forge_permit_submit`, `withdraw`, `approve`, `reject`, `issue`, `suspend`, `resume`, `complete_work`, `close`, `cancel`;
  - `forge_permit_record_gas_test`, `forge_permit_sign_in`, `forge_permit_sign_out`;
  - `forge_permit_training_gaps`.
- **Guards:**
  - Status and workflow columns change only inside those functions.
  - A permit's content is editable only while it is a draft, and only drafts can be deleted.
  - Closed and canceled permits are frozen, as are their people, checklist and links.
  - Gas tests, entries and history are append-only.
  - Every link stays inside one company.

## Tests

- **Unit:** `node --experimental-strip-types --test apps/web/tests/port-s18-permit-rules.test.cjs` (11)
- **Database:**
  - `node apps/web/tests/port-s18-permits-db.cjs` (11 groups; needs Docker). It runs the full confined space flow, plus hot work fire watch, heights and electrical details, the time window, company checks, no direct access, and grants.
  - `node apps/web/tests/port-s18-permits-cron.cjs` (11)
- **Playwright** (run one file at a time):
  - `port-s18-permits.spec.cjs` (6): board, lists, drafts, register, settings, print, view-only user.
  - `port-s18-workflow.spec.cjs` (5): two-user confined space flow, gas test suspension, entry log, hot work fire watch.
- **Clean-up:** test data is cleaned up as `supabase_admin` in replica mode, children first, because closed permits can't be deleted.

## Remaining

- Schedule `/api/permits/cron`.
- Permission per permit type: today one approver can approve all four types.
- Contractor training: check workers against their contractor qualifications.
- Field / mobile flow, QR on the posted permit, and signatures. 1.0's field app had a drawn signature on acknowledge.
- Simultaneous operations: a warning when permits overlap in the same area.
- Cranes & rigging lift plans and machine safety, which 1.0 grouped with these: separate slices.
- 1.0 data migration: 1.0's generic records have no structure to map, so at most titles and statuses.
