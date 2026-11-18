# Port slice 1: OSHA recordkeeping (Industrial 1.0 → 2.0)

This slice ports OSHA injury and illness recordkeeping (29 CFR 1904): cases, the Form 300 log, the Form 300A summary with certification, the Form 301 incident report seeded from the incident and personnel record, and TRIR/DART rates.

It builds on slice 0 (`docs/PORT_S0_PERSONNEL_FOUNDATION.md`). Form 301 employee details come from `forge_personnel_sensitive`.

1.0 reference:
- `apps/platform-api/src/modules/industrial/osha-helpers.ts`
- `apps/platform-api/src/modules/industrial/performance-report-helpers.ts`
- the OSHA section of `industrial-domain.service.ts`
- `apps/industrial-web/src/components/osha/*`

## Data model

| Table | Purpose |
| --- | --- |
| `forge_osha_cases` | One case per injured or ill employee per incident. Holds the Form 300 row (columns B–M) and every Form 301 field as explicit columns. 1.0 stored these in `source_payload` JSON. The establishment is the Location. `calendar_year` is generated from the injury date. |
| `forge_osha_establishment_years` | Form 300A inputs per Location and year: establishment info, NAICS, annual average employees, hours worked, certifier. Certification freezes the totals into `certified_*` columns. |
| `forge_osha_case_activity` | Case history. Service role only. |
| `forge_osha_case_sequences` | Case numbers `YYYY-NNN`, counted per establishment and year. |

Rules enforced in the database (constraints and triggers):

- Recordable cases need exactly one outcome (G–J) and one type (M1–M6).
- Days away plus restricted days are capped at 180 (1904.7(b)(3)(vii)).
- Privacy cases must be recordable.
- Date of death is allowed only on death cases.
- Injury dates cannot be in the future.
- A case cannot move to another establishment or log year. Void it and open a new one instead.
- Voided cases need a reason and cannot be edited.
- A certified 300A cannot be edited until it is reopened. Reopening clears the snapshot.
- Every reference must belong to the same organization.

`forge_osha_300a_totals()` is the single source for totals, rates and certification. `forge_certify_osha_establishment_year()` computes and freezes totals in one transaction and checks `row_version`.

No OSHA table, function or sequence is reachable by members through RLS. Access goes through server actions that check `osha.view`, `osha.edit`, `osha.certify` and `osha.export` plus Location/Division scope. Those permissions already existed in the Creator registry.

## Changes from 1.0

- **Privacy cases are masked on the log.** The Form 300 page and CSV export show "Privacy Case" instead of the name (1904.29(b)(6)). 1.0 did not mask them.
- **Privacy is a flag, not a status.** In 1.0 it was a separate recordability status. In 2.0 it is a flag on a recordable case, so "recordable" always means "on the log".
- **Not-recordable decisions need a written reason**, kept for audit.
- **Injury date and time use a configurable time zone.** They come from the establishment's zone (`FORGE_DEFAULT_TIME_ZONE`, default `America/Chicago`), not UTC, so a 10:30 PM injury is logged on the right day.
- **"Fill Blanks from Incident" never overwrites entered values.** 1.0's `mergeOshaSeedPreferExisting` worked the same way.
- **Edits use optimistic concurrency** (`row_version`) on cases and summaries.
- **A certified 300A is flagged as stale** when the log changes after certification.
- **Audit entries record which fields changed, not their values.** OSHA values contain medical details.

## UI

- `/osha` shows totals, TRIR and DART for a year and establishment, injury incidents with no OSHA decision yet, and the year's cases.
- `/osha/cases/[id]` is the case editor: classification, Form 300 fields, Form 301 sections, close, reopen, void, and fill blanks.
- `/osha/cases/[id]/form-301` is the Form 301 report view.
- `/osha/log` is the Form 300 log, with page totals and a CSV download (`/api/osha/log`, requires `osha.export`).
- `/osha/summary` is the Form 300A for one establishment: totals, rates, inputs and certification.
- The incident page has an OSHA panel. It opens a case for the injured employee (defaulting to the incident's injured person or reporter) and lists linked cases.

## Not in this slice

- Workers' compensation, including 1.0's sync from workers' comp outcomes into OSHA cases. That is slice 2.
- PDF output of the official OSHA forms. The pages are print-friendly, but 1.0's PDF generators were not ported.
- Electronic submission (OSHA ITA CSV/API format).
- An `incident_people` editor on the incident form. The injured employee is chosen when the case is opened.
- Per-Location time zones. One time zone is used for all establishments.

## Tests

```bash
node --experimental-strip-types --test apps/web/tests/port-s1-osha-rules.test.cjs
node apps/web/tests/port-s1-osha-db.cjs
pnpm exec playwright test apps/web/tests/port-s1-osha.spec.cjs --reporter=line --workers=1
```

- **Unit tests (13):** classification rules, the 180-day cap, TRIR/DART math, privacy masking, time-zone dates and fill-blanks.
- **DB contract (38 checks):** case numbering, constraints, totals, certification, tenant guards, and no member access.
- **Browser:** incident to case with Form 301 seeding, server-side validation, privacy masking in the log and CSV, 300A rates and certification, the stale-certification warning, and employee denial.
