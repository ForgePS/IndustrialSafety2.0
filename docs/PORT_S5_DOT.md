# Port slice 5: DOT Compliance (Industrial 1.0 → 2.0)

2.0 had a `nav.dot` menu entry and the `dot.*` permissions, but no module behind them. This slice brings over 1.0's DOT Compliance module:

- driver qualification files (DQFs), with 1.0's 24-line worksheet, credential expirations and uploaded copies
- the company-driver (insurance MVR) roster, with consent and MVR tracking and the annual random MVR sample
- other DOT records: roadside inspections, accidents, drug and alcohol events, company paperwork
- the dashboard and "needs attention" list
- the DQF compliance report, on screen and as CSV
- per-organization settings in place of 1.0's Producers-only rules

It builds on slice 0 (personnel). Personnel is the source of truth for who is a DOT driver and who is a company driver.

1.0 reference (under `legacy/forge-platform`):
- `apps/industrial-web/src/app/(app)/dot/**` and `components/dot-*`
- `apps/platform-api/src/modules/industrial/dot*.ts`, `company-driver-mvr-requirements.ts`, `mvr-sample.ts`
- the DOT section of `schema/industrial.ts`

## Data model

Migration: `apps/web/supabase/migrations/20261115190000_forge_dot_compliance.sql`.

| Table | Purpose |
| --- | --- |
| `forge_dot_settings` | Per organization: hidden DQF document types (I-9 and the AR/MS CDL affidavits by default), "every DOT driver is a company driver", insurer name and email, and the MVR sample percent (1–100, default 10). |
| `forge_dot_driver_files` | One DQF per driver. `file_number` (`DQF-000001`), license class (CDL / non-CDL), number, state and expiry, restrictions, medical certificate expiry, National Registry number and verified flag, diabetic eye exam expiry, last MVR and next MVR due, notes. Archived files keep a reason: `manual`, `dot_driver_off` or `personnel_inactive`. At most one open file per person. |
| `forge_dot_dqf_documents` | One row per worksheet document: date placed, on-file answer (yes / no / N/A) and the extra text fields some documents carry (road test examiner, registry number, review notes). |
| `forge_dot_company_drivers` | The insurance roster. Linked to personnel or, with organization scope, a name only. Status: `on_insurance`, `pending_mvr`, `suspended`, `removed`. Consent, initial / last / next MVR, insurance on and off dates, and the sample year it was drawn for. |
| `forge_dot_mvr_events` | Roster history: consent received, MVR received, sample selected and completed, status changes. |
| `forge_dot_records` | Other DOT records. `record_number` (`DOT-000001`), category, title, date, driver, location, description, outcome, open / closed. |
| `forge_dot_files` | Uploaded copies for any of the three parents. PDF, JPEG, PNG, WebP or HEIC, up to 12 MB, 10 per slot. Removed copies stay as rows (and files) for the audit trail. Files live in the private `forge-dot` bucket. |

Triggers keep personnel and DOT in step:

| Trigger | Rule |
| --- | --- |
| Opening a DQF | Sets `is_dot_driver`. With the company-driver rule on, also sets `is_company_driver`. |
| `is_dot_driver` turned off | Archives the open DQF as `dot_driver_off`. |
| Terminated, inactive or archived | Clears `is_dot_driver` and archives the DQF as `personnel_inactive`. An inactive person cannot have an open DQF. |
| `is_dot_driver` turned back on | Restores the most recent DQF archived by either reason above. A hand-archived file stays archived. |
| Archiving a DQF by hand | Clears `is_dot_driver`. |
| `is_company_driver` on (on insert or update) | Adds a `pending_mvr` roster row, or brings a removed one back. Off marks it `removed` and dates the coverage end. |

Database functions (service role only):

| Function | Rule |
| --- | --- |
| `next_forge_dot_number` | `DQF-` and `DOT-` sequences per organization. |
| `forge_dot_start_mvr_sample` | Draws the year's sample: the settings percent of on-insurance and pending drivers, rounded up, at least one. The pick is stable for the year (ordered by `md5(year:id)`). A second draw needs an explicit redraw, and a sample with any MVR recorded cannot be redrawn. |
| `forge_dot_complete_mvr_sample` | Records the sampled MVR (not in the future, once) and sets the next MVR due a year out. |

Access: RLS is on and `anon` / `authenticated` are revoked on all 8 DOT tables. The app reads through the service role after `dot.*` permission and scope checks. New permission: `dot.settings` (safety manager, company admin, company owner). The `nav.dot` menu entry is now live behind `dot.view`.

Uploads go through `POST /api/dot/files`, which checks the origin, `dot.edit`, scope, slot, archived state, size, type and magic bytes. An MVR consent upload dates the consent. An MVR report upload dates the initial and last MVR, sets the next one due a year out, and carries the same dates to the driver's open DQF. Downloads (`GET /api/dot/files/[id]`) redirect to a 5-minute signed URL after a `dot.view` and scope check.

## Changes from 1.0

- 1.0 kept DQF data in a JSON payload and found DQF rows by heuristics. 2.0 has real columns for credentials and one row per document.
- **Fixed:** uploading an MVR report in 1.0 set the MVR *expiry* to today, so a fresh MVR showed as expiring. 2.0 sets the next MVR due a year out.
- **Fixed:** 1.0 counted a missing license twice, once as "missing license" and again under "missing documents". 2.0 reports it once.
- The Producers-only rules (hidden I-9 and affidavits, DOT drivers are company drivers) are now organization settings.
- Signing off the annual DQF review needs `dot.approve`. Document dates cannot be in the future.
- The worksheet shows the FMCSA citation for each document (391.21, 391.23, 391.25, 391.31, 391.43, 391.51, 382.701).
- The MVR sample uses `md5` instead of 1.0's FNV hash. Same idea (stable per year), different picks.
- The CSV export neutralizes spreadsheet formulas.
- Uploads are checked by magic bytes, not just the declared type.

## UI

| Page | What it does |
| --- | --- |
| `/dot` | Dashboard: compliance %, expired, expiring, missing documents, company drivers, and a "Needs attention" list across DQFs and the roster. |
| `/dot/drivers` | Driver files with search and an archived view, status pills and next due date. |
| `/dot/drivers/new` | Opens a DQF for someone in personnel. |
| `/dot/drivers/[id]` | Credentials with uploads, the needs-attention list, and the worksheet grouped as Hiring, Medical, Drug & alcohol and Ongoing. Archive and restore. |
| `/dot/company-drivers` | The roster with filters (status, missing consent, not in personnel, this year's sample), add a driver, and draw or redraw the annual sample. |
| `/dot/company-drivers/[id]` | Edit the roster row, upload consent / MVR / license, record a sampled MVR, link to personnel, and MVR history. |
| `/dot/records`, `/new`, `/[id]` | Other DOT records by category and status, with attachments and close / reopen. |
| `/dot/reports` | The DQF compliance report and its CSV (`dot.export`). |
| `/dot/settings` | Hidden documents, the company-driver rule, insurer, sample percent (`dot.settings`). |

Shared code:
- `src/lib/forgeDotRules.ts`: pure rules (document catalog, dates, worksheet, issues, roster, sample size, report and CSV, magic bytes).
- `src/lib/forgeDot.ts`: loaders with scope.
- `src/lib/forgeDotServer.ts`: server helpers for actions and routes.
- `src/components/dot/`: header and tabs, status pill, upload slot.

## Still not done

- **Fleet: vehicles and DVIRs.** 1.0's vehicle list and driver vehicle inspection reports belong to the Fleet module and wait for that port.
- **Digital forms.** 1.0 could link a DQF document to a filled-in digital form. 2.0 takes uploads and dates only.
- **Reports catalog.** The DOT entries in 1.0's reports catalog are not in 2.0's report builder yet. The compliance report has its own page.
- **Forge AI context.** Forge AI does not read DOT data yet.
- **Scheduled reminders.** Expirations are flagged on screen but nothing is emailed yet; same scheduler gap as slices 3 and 4. (1.0 never emailed the insurer either; it only stored the insurer's name and email.)
- **Batch 1 additions:** roster search/sort/license follow-ups, filtering dashboard cards, related records, record due dates. See `docs/PORT_B1_PARITY_FIXES.md`.

## Tests

```bash
node --experimental-strip-types --test apps/web/tests/port-s5-dot-rules.test.cjs
node apps/web/tests/port-s5-dot-db.cjs
pnpm exec playwright test apps/web/tests/port-s5-dot.spec.cjs --reporter=line --workers=1
```

- **Unit tests (17):**
  - the document catalog
  - dates and the 30-day window
  - applicability (seasonal MEC, non-CDL, diabetic exam)
  - license and MVR rules
  - document on-file shortcuts and hidden documents
  - the single license issue and issue order
  - roster issues
  - sample size
  - report severity, columns and CSV
  - magic bytes
- **DB contract (67 checks):**
  - numbering
  - every personnel sync path, the active-person and no-move guards
  - document and upload guards (slots, types, 12 MB, one parent, no move, no restore, 10 per slot)
  - the roster flag, insurance dates, creating someone as a company driver, and the company-driver rule
  - settings guards
  - the sample draw, redraw, stability and completion
  - records closing
  - signed-in members cannot read DOT tables or call the functions
  - the private bucket, the permission and the live menu entry
- **Browser (3 tests):**
  - open a DQF, save credentials, upload a license copy, refuse a renamed file, place a document, open the signed link, and see the driver on the dashboard, list, report and CSV
  - add a company driver, upload consent and an MVR (dates and next due set), put them on insurance, and create, attach to and close a DOT record
  - a member without `dot.export` cannot download the CSV
