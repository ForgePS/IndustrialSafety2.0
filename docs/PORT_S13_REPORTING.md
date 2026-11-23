# Port slice 13: Reporting

Ports Forge 1.0's Reporting module (`legacy/forge-platform/apps/platform-api/src/modules/reporting/`: `reporting-catalog.ts`, `reporting-registry.ts`, `reporting-adapters.ts`, `reporting.service.ts`, `reporting-exporters.ts`, `reporting-cron.ts`) into 2.0 at `/reporting` (menu: System Tools → Reporting).

## What it does

- **Report library** (`/reporting`): reports grouped by module, with search. A person sees only the reports for modules they can already open.
- **Reports** (`/reporting/[key]`): 12 built-in reports, each loaded through its module's own scoped loader:
  - Incidents: incident log, near misses
  - OSHA 300 log: recordable cases for a year; privacy cases show "Privacy case"; group by outcome or injury type for the 300A totals
  - Workers' comp cases
  - Inspection log
  - Corrective action register: open, overdue, closed, canceled
  - Personnel roster
  - LOTO procedure inventory: includes "Review due"
  - Lockout history
  - Asset register
  - DOT driver qualification
  - Tasks: includes "Overdue"
- **Filters**: date range presets (all, last 30 / 90 days, last 12 months, this / last month, this / last year, custom), year for the OSHA log, location, status and the columns to show.
- **Group by**: counts per group, plus totals for numeric columns.
- **Downloads** (`/reporting/[key]/export?format=csv|pdf`):
  - CSV: UTF-8 with a BOM, CRLF line endings; formulas are neutralized.
  - PDF: landscape letter with the header on every page and page numbers, up to 5,000 rows with a note when cut short.
  - Grouped reports download the group counts.
- **Saved reports** (`/reporting/saved`, `/reporting/saved/[id]`): saves a report's filters, grouping and columns under a name. It can be private or shared with the company. Relative dates like "Last 30 days" move with each run. Only the owner can change or delete a saved report.
- **Schedules**: a saved report can be sent daily, weekly or monthly at an hour in a chosen time zone, to people in the company. Each recipient gets an in-app notice and an email linking to the saved report.
  - Delivery runs from `GET|POST /api/reporting/cron`, which uses the same `FORGE_CRON_SECRET` bearer auth as the other cron routes.
  - Each schedule is claimed before it is sent, so two cron calls can't send it twice.
  - Notices are de-duplicated per schedule, run time and recipient.
- **History** (`/reporting/history`): your last 100 runs, downloads and scheduled deliveries, including denied and failed ones.

## Fixes over 1.0

- **Permissions:**
  - Each report uses its module's view permission and scoped loader, so a report never shows more than the module would.
  - 1.0 checked a single reporting permission and read the tables directly.
  - Sensitive columns are removed unless the person has the permission:
    - workers' comp body parts and claim notes need `reporting.view_sensitive`;
    - personnel email and phone need `personnel.view_sensitive`.
- **Shared and scheduled reports run with the viewer's own permissions.** In 1.0 a shared report showed the owner's data.
  - A scheduled report is run once per recipient.
  - Recipients who can't run it are skipped, and a denied run is logged.
  - Other recipients of a private report are skipped.
- **Recipients must be active members of the company**, enforced by a database trigger. 1.0 accepted any email address.
- **Filters are applied to the whole record list before anything is limited.** 1.0 limited first, so totals and groups could come out short.
- **Schedule times are right across daylight saving changes.** 1.0 stored a UTC hour, so a 7 AM report drifted to 6 or 8 AM. The report's date range uses the date where the schedule runs.
- **Downloads are made on demand** and nothing is stored. 1.0 kept generated files.
- **Every run is logged**, including denied and failed ones, and run history can't be edited (trigger).

## Permissions

- **Permissions:**
  - `reporting.view`: open the library and run reports for modules you can see.
  - `reporting.export`: CSV and PDF.
  - `reporting.share`: share a saved report with the company.
  - `reporting.schedule`: schedule delivery.
  - `reporting.view_sensitive`: sensitive, unlocks sensitive report columns.
- **Grants:**
  - Supervisors and location administrators: view, export and schedule.
  - Safety managers, company admins, company administrators and company owners: everything.
  - Employees and read-only users: none.

## Schema

`20261119120000_s13_reporting.sql`:
- **Feature:** updates the `reporting` feature, adds plan entitlements (internal-demo, enterprise) and makes `nav.reporting` live.
- **Tables:**
  - `forge_saved_reports`
  - `forge_report_schedules`: one per saved report
  - `forge_report_schedule_recipients`
  - `forge_report_runs`
  - All have RLS on, no anon or authenticated access, and service role only.
- **Triggers:**
  - `forge_report_same_organization`: keeps schedules and recipients in the saved report's company, and requires recipients to be active members.
  - `forge_report_runs_immutable`: run history can't be changed. The one exception: deleting a saved report or schedule drops the link from its past runs (`on delete set null`), and the runs are kept.

Seed fix: `seeds/35_assets_loto_training_ai.sql` no longer clears a training completion's certificate number. The `forge_training_completions_guard` trigger from `20261116120000` refuses that change, which broke `supabase db reset`.

## Tests

- **Unit:** `node --experimental-strip-types --test apps/web/tests/port-s13-report-rules.test.cjs` (8). Covers periods, parameter cleaning, filters and sensitive columns, grouping and totals, CSV, and schedule time zones and validation.
- **Database:** `node apps/web/tests/port-s13-reporting-db.cjs`. Covers checks, one schedule per report, same company, members only, immutable runs, no direct access, permissions and grants, and cascades.
- **Cron:** with the dev server running on :3001, `node apps/web/tests/port-s13-reporting-cron.cjs`. Covers the wrong secret, sent and skipped recipients, the denied run log, notices and emails, disabled schedules, private reports, archived reports, and no repeat on a second call.
- **Playwright:** `port-s13-reporting.spec.cjs` (3). Covers the library and search, running and grouping, CSV and PDF, saving and sharing, scheduling, history, an employee being sent away, and delete.
- **Not in CI:** like slices 8–12, these aren't in the CI workflow yet.

`integration/manifest.json` was regenerated. It also picks up slices 8–12, which hadn't updated it.

## Remaining

- Schedule `/api/reporting/cron` (hourly).
- No XLSX export; there is no spreadsheet library in 2.0. CSV opens in Excel.
- Saved-report favorites from 1.0 were dropped.
- 1.0 reports not ported yet:
  - sanitation (MSS, cleaning, dust, pests, spills, findings)
  - supplies
  - training completion and expiring
  - JSA status
  - observations
  - fleet assets and DVIR summary
  - inspection open findings
  - LOTO energy-type coverage
  - monthly safety stats
  - the workers' comp medical encounter, work status history and weekly status reports

  Several other 1.0 reports are covered by filters and group-by: open and overdue CAPA, incidents by location, the LOTO by-status and by-location views, OSHA 300A, and the workers' comp by-status and open-case views.
- The email is a link to the report, not an attachment.
- Reports load the module's scoped records in application code. This is not paged for very large companies; on screen, results show the first 500 rows.
- 1.0 saved reports and schedules data migration.
