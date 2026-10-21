# Port slice 2: workers' compensation (Industrial 1.0 → 2.0)

Ports workers' comp case management:
- cases and stages
- carriers
- work-status periods
- restriction checklists
- medical visits, behind their own permissions
- Thursday weekly updates
- follow-up reminders
- the sync from workers' comp to the OSHA log

Built on slices 0 and 1 (`PORT_S0_PERSONNEL_FOUNDATION.md`, `PORT_S1_OSHA_RECORDKEEPING.md`).

**1.0 reference:**
- `packages/database/src/schema/industrial.ts` (`industrial_workers_comp_*`)
- `apps/platform-api/src/modules/industrial/workers-comp-helpers.ts`
- `wc-restrictions-accommodations.ts`
- the workers' comp section of `industrial-domain.service.ts`, including `syncOshaFromWorkersCompCase`
- `apps/industrial-web/src/lib/workers-comp-module.ts`

## Data model

| Table | Purpose |
| --- | --- |
| `forge_wc_cases` | One claim per employee and injury date. Numbered `WC-YYYY-NNNN`. Holds status (active / closed / archived), stage (intake → investigation → medical review → treatment → return to work → claim admin → closed) and severity. Claim fields are explicit columns: carrier or self pay, claim number, adjuster, body parts. Also holds the manual follow-up and the OSHA linkage (recordable, privacy, type, outcome override, linked OSHA case). 1.0 kept the claim and OSHA linkage in JSON. |
| `forge_wc_carriers` | Insurance carriers. One active carrier per name. |
| `forge_wc_work_status_periods` | Full duty / restricted / off work over date ranges. A GiST exclusion constraint prevents overlapping periods. |
| `forge_wc_restrictions` | 1.0's restriction checklist as constrained columns: stand/walk, sit, lifting level, transitional hours, push/pull limit. Upper- and lower-extremity limits are `text[]` limited to the known options. |
| `forge_wc_medical_encounters` | Medical visits: provider, diagnosis, treatment, medication, next appointment. |
| `forge_wc_weekly_updates` | One note per case per Thursday. The database enforces the Thursday rule. |
| `forge_wc_case_activity` | Case history. It never contains medical details. |

Every table is service-role only. Server actions check `workers_comp.view/create/edit/export`, plus the new `workers_comp.medical.view`, `workers_comp.medical.manage` and `workers_comp.configure`, together with Location/Division scope.

## Changes from 1.0

- **Days are calculated, not typed.** Days away and restricted days come from work-status periods using OSHA calendar-day rules: the injury day is not counted, and open periods run through today. In 1.0 they were entered by hand.
- **The OSHA sync is one database function.** `forge_apply_wc_to_osha_case` applies recordability, privacy, outcome, type and capped days, links the cases, and writes OSHA case history in one transaction. The outcome is derived as in 1.0 (fatality → death, days away → H, restricted → I, else J) unless overridden. Clearing the flag marks the OSHA case not recordable and names the workers' comp case in the reason.
- **Syncing to OSHA needs `osha.edit`.** It changes the OSHA log, so workers' comp access alone is not enough, which 1.0 allowed.
- **Medical access is opt-in.** Only company administrators and owners get it by default. The read-only role template no longer grants it.
- **Recording a new open work status ends the previous open one** the day before. Closing a case ends any open period today.
- **Author-only editing is enforced on the server**, for medical visits, work-status periods and weekly notes. The author can edit; anyone else needs `workers_comp.configure`.
- **Next actions use 1.0's rules and due dates:** claim number at 3 days, classification at 5, lost-time review at 7, medical review at 10, return-to-work at 14.

## UI

| Page | What it does |
| --- | --- |
| `/workers-comp` | Dashboard tiles, next actions with overdue first, and the case list. |
| `/workers-comp/create` | Opens a case. With `?incident=`, it pre-fills from the incident's injured person or reporter, its date and its Location. |
| `/workers-comp/[id]` | Case, claim, follow-up and OSHA linkage; work status; restrictions; medical visits (with medical permission only); weekly updates; history. |
| `/workers-comp/weekly` | Every open case's update for a week, entered inline, plus a CSV export (`/api/workers-comp/weekly`). |
| `/workers-comp/carriers` | Carrier list. Requires `workers_comp.configure`. |
| Incident page | Workers' comp panel listing linked cases, with "Open workers' comp case". |

## Not in this slice

- **Friday weekly-status email.** 1.0 sent it from its hourly reporting-schedule sweep. 2.0 has no scheduler or email delivery yet, so the report is a CSV download for now.
- **Recurring day-count updates for open periods.** The OSHA log updates on every change and from "Update OSHA Log", but not daily.
- **Claim costs and payments.** 1.0 did not track them either.
- **Printable workers' comp reports**, i.e. 1.0's `workers-comp-print.ts`.
- **Seeding Form 301 from workers' comp fields.** The OSHA case still takes its Form 301 data from the incident and the personnel record, as in slice 1.

## Tests

```bash
node --experimental-strip-types --test apps/web/tests/port-s2-workers-comp-rules.test.cjs
node apps/web/tests/port-s2-workers-comp-db.cjs
pnpm exec playwright test apps/web/tests/port-s2-workers-comp.spec.cjs --reporter=line --workers=1
```

- **Unit tests (12):** Thursday week math, update status, OSHA day counting, the 180-day cap, outcome derivation, next-action rules and author-only editing.
- **DB contract (42 checks):** duplicates, constraints, overlap exclusion, the Thursday rule, restriction options, the OSHA sync with cap and clearing, tenant guards, archived cases, role grants, and no member access.
- **Browser:** incident → case → work status (5 away / 15 restricted) → restrictions → medical visit → weekly update → OSHA recordable sync (the OSHA case shows days away, 5 and 15) → close. Also checks that a coordinator without medical access sees no medical data and cannot reach carriers.
