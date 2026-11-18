# Batch 1: parity fixes for the ported modules (Industrial 1.0 → 2.0)

After slices 0–6, an audit compared each ported module against 1.0 feature by feature. It found the core workflows ported but a lot missing around them, including some dead ends (an archived person or workers' comp case could never be reached again, and a wrong training record could not be fixed). Batch 1 fixes the dead ends and the everyday list and workflow gaps in all six modules. Printing and output (Batch 2) and the larger features (Batch 3) are listed at the end.

## Migrations

| Migration | What it does |
| --- | --- |
| `20261116110000_forge_wc_parity.sql` | `forge_wc_cases_relink_guard`: a case's incident or employee cannot change while it points at a live (not voided) OSHA case, unless the OSHA link is cleared in the same write. Location can always change. |
| `20261116120000_forge_training_manage.sql` | Assignments: `canceled` status with `canceled_at/_by/cancel_reason`, final once set, and never for a completed assignment. `forge_cancel_training_assignment` also abandons an open quiz attempt. Records: `archived_at/_by/archive_reason` (reason required, final), score 0–100, expiry not before completion, and a guard that keeps the certificate number, person, course and source fixed (plus score and date on graded records). Redefines `forge_loto_person_authorized` to ignore archived records. |
| `20261116150000_forge_dot_parity.sql` | `forge_dot_records.due_on` (not before the record date) and indexes for related-records and open-with-due-date lookups. |

Personnel, OSHA and LOTO needed no database change.

## Personnel

- **Restore to roster** (`personnel.archive`, same scope as archive). Audited as `personnel.restored`. It does not change employment status (archiving never did) and does not turn DOT driver back on: tick DOT Driver again to reopen the old driver file.
- **Archived Personnel** view: `/personnel?view=archived`, with an Active Roster / Archived toggle.
- **Directory:** Location filter (including "No location"), sort by last or first name, search across name, employee number, department, position and job title, and DOT Driver / Company Driver badges. Filters live in the URL.
- **Profile:** links to the person's DOT driver file and company driver row (`dot.view` in scope), and the driver badges in the header.

## Workers' compensation

- **Archived cases** are reachable: `/workers-comp?status=archived`. Archived cases open read-only.
- **Case list:** search (case number, employee, claim number, carrier), status and stage filters.
- **Relink after creation** (`workers_comp.edit`): change the employee, incident or location. Each must be in the company, the incident in the editor's `incidents.view` scope, and the case must stay inside the editor's scope. The employee name and division follow the new links, and the audit row has before and after. A newly linked incident gets the WC review flag. This also fixes cases created without an incident, which could never sync to OSHA.
- **Send Weekly Status Now** (`workers_comp.configure`) on the settings page. It uses the same queue as the hourly job, so it never sends a week twice ("queued N, already sent M"). The weekly notice must be switched on and saved first. A manual send counts as that week's send.

## Training

- **Assignments:** edit due date and notes, or cancel with a reason (`training.assign`). Canceled assignments drop out of overdue, reminders, the matrix, My Training and group auto-assign.
- **Assignment list:** status, course, group and name / employee number filters, an Action column, and dashboard tiles (Open, Overdue, Completed, Canceled) that filter the list.
- **Training records:** edit score, instructor, date, expiry and notes, or archive with a reason (`training.record_completion` in scope), from the personnel Training card and the records report. Edits never change approval status. Archived records drop out of the matrix, history, reports, expiring notices, certificates, the JSA training check and LOTO lock-holder authorization.
- **Courses:** archive and reactivate (`training.create_course`), with an Active / Archived filter. Archived courses cannot be assigned, take paper results, or be added or auto-assigned as group requirements.

## OSHA recordkeeping

- **Open OSHA case** straight from the injury list on `/osha`, with the injured person (or reporter) preselected. Shown only where the viewer's `osha.edit` scope reaches the incident.
- **Fix before printing:** 1.0's print checks, now in `src/lib/forgeOshaRules.ts`. For recordable, non-voided cases it flags blank name, job title, date, where, or description; missing outcome or type; day counts that don't fit the outcome, negative, or over 180; death date mismatches; and duplicate case numbers. Shown on `/osha` and `/osha/log` with links; Download CSV asks "Export anyway" while issues exist. 2.0 also checks job title and "where", which 1.0 did not.
- **One establishment per CSV** (29 CFR 1904.30): the export is disabled for "All establishments" and the route returns 400.

## Lockout / Tagout

- **Summary counts** on `/loto`: Procedures, Drafts, In review, Active, Open lockouts, from the same scoped list. Cards filter the list.
- **List:** location and division filters (taken from the linked asset; 2.0's division stands in for 1.0's department), sortable columns, and 10 / 25 / 50 / 100 per page.
- **Duplicate step** (`loto.edit`, drafts only). Copies the step's text right after it. Steps have no photos in 2.0, so there is nothing else to copy.
- **Retire from the list** (`loto.retire`), with the existing open-lockout check and an optional reason.
- **Lockout search** on `/loto/lockouts`, open and history: lock holder, equipment, procedure and text. History rows now list every lock holder.

## DOT compliance

- **Company-driver roster:** search (name, employee number, license number), sortable columns, and a "License follow-ups" filter (expired, expiring in 30 days, or no license copy).
- **Dashboard:** follow-up cards that open the filtered driver list (or roster for roster items), and tiles for open DOT records and each category.
- **Driver file:** a Related DOT records card.
- **Due dates** on DOT records with "Due" / "Overdue Nd" for open records on the list and detail page.
- **Correction to `PORT_S5_DOT.md`:** 1.0 never emailed the insurer; it only stored the name and email.

## Fixes found while re-running the browser tests

- **DOT: creating a record always failed with "Pick a category."** This came from slice 5. `/dot/records/new` spread `EMPTY_DOT_RECORD`, imported from the `'use client'` form, into its starting values. A server page that imports a value from a client module gets a client reference, not the object, so the category and due date arrived empty. The defaults now live in `dot/records/dotRecordDefaults.ts`. A scan found no other server file importing a value from a client module.
- **Workers' comp spec:** the relink and Send Now tests acted before the page hydrated, so a first click or select could be lost. They now wait for the page to settle.
- **LOTO spec:** the history Search button is matched exactly (the header search toggle also matched).

## Tests

```bash
node --experimental-strip-types --test apps/web/tests/port-b1-osha-rules.test.cjs apps/web/tests/port-b1-loto-rules.test.cjs apps/web/tests/port-b1-dot-rules.test.cjs apps/web/tests/port-b1-training-rules.test.cjs
node apps/web/tests/port-b1-wc-db.cjs
node apps/web/tests/port-b1-training-db.cjs
node apps/web/tests/port-b1-dot-db.cjs
pnpm exec playwright test apps/web/tests/port-b1-*.spec.cjs --reporter=line --workers=1
```

- Unit: 35 new tests (OSHA print checks, LOTO list helpers, DOT due and attention rules, training manage rules).
- DB: workers' comp relink guard and weekly send (14), training cancel and record archive guards (37), DOT due dates (10).
- Browser: one spec per module.

## Still to do

**Batch 2: printing and output**
- OSHA Form 300 and 301 on the official PDFs, and a Form 300A posting layout.
- Printable training transcripts (My Training, personnel, kiosk).
- LOTO batch QR sticker labels.
- Workers' comp printable claim with the incident narrative and HTML download, and employee details (date of birth, address, sex).

**Batch 3: larger features**
- Training: assign to many people at once, PowerPoint / Office slide viewer, instructor-led delivery, kiosk transcript, quiz timer.
- Personnel: cross-module profile (incidents, workers' comp, forms, safety score), disciplinary actions, reusable signature, First Aid / CPR and PPE allowance tracking.
- OSHA and workers' comp editors on the incident page, claims by carrier.
- LOTO: reports, photo crop and copy, device and method dropdowns, tags and attachments. Decide whether procedures that skip review can go straight to Active as in 1.0.
- DOT: digital form links on the worksheet; the Fleet / DVIR module.
