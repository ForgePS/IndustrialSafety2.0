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

## Completion pass (rest of 1.0 workers' comp)

| Feature | 2.0 result |
| --- | --- |
| Weekly status notice settings | `forge_wc_settings` stores the on/off switch, the day, the hour and up to 50 recipients (`weekly_email_recipient_ids`). Defaults match 1.0: off, Fridays, 7:00 AM, America/Chicago. `/workers-comp/settings` needs `workers_comp.configure`. Recipients are picked from active members who have `workers_comp.view`; anyone who has lost access is flagged for removal. The page previews the viewer's own notice, rendered by the shared email renderer in a sandboxed frame. |
| Notice delivery | Sent through the shared notification service from the Help Desk work (`forge_notification_events` / `forge_notification_deliveries`). Each recipient gets an in-app notice in Forge notifications plus an email, linked to `/workers-comp/weekly`. 1.0 emailed a full case table to any typed address. 2.0 sends only to Forge users, and only the cases inside that recipient's own workers' comp scope. The notice lists case numbers, stage, work status, day counts and missing updates. Employee names and injury details stay behind login. The content limit is 200 characters for the title and 2,000 for the body; longer lists end with "... and N more". |
| Notice timing | `/api/workers-comp/cron` should run hourly. It calls `queueDueWcWeeklyNotices()` (`src/lib/forgeWorkersCompNotify.ts`), which uses `weeklyEmailDue()` with each tenant's local time. Access is checked again at send time, so people who lost access since the save are skipped. Then `forge_wc_queue_weekly_status` writes the event and deliveries and marks the week sent in one locked step: two overlapping runs cannot send a week twice, and it refuses anyone who is not on the saved list or not an active member. The cron only queues. `/api/helpdesk/cron` drains the platform outbox (`dispatchPendingEmails`, Resend), so only one job ever sends email. |
| Notice content | `src/lib/forgeWorkersCompEmail.ts` (pure, unit tested): `buildWeeklyStatusNotice` builds the title and body within the service limits. `weeklyEmailDue` and `reportWeekOf` handle timing. |
| Printable case report | `/workers-comp/[id]/print`: injury, claim, work status with day counts, restrictions and weekly updates. Medical visits appear only with medical access and an explicit "Include Medical Visits". Printing is audited. |
| Queues | `/workers-comp/queues`: Employees (case counts, personnel link), Return to Work, Medical Follow-up (medical access only; flags no upcoming appointment and no visit in 14 days), and OSHA Recordable (log days against current days). |
| Reports | `/workers-comp/reports` plus `/api/workers-comp/reports/[key]` give 1.0's catalog as CSV: open cases, by status, lost time, restricted duty, work-status history, claims summary, medical visits (medical access only) and weekly status. Scoped to what the viewer can see. Every export is audited. |
| Corrections | Work-status periods and restrictions can be edited or removed (1.0 PATCH/DELETE) by the author or `workers_comp.configure`. Removals are kept in case history, and day counts and the OSHA log re-sync. |
| Documents | `workers_comp_case` is registered in the resource registry, so claim packets attach through the shared evidence service (`workers_comp.view` plus `records.evidence.*`). The shared upload route now refuses files on archived records, for every module. |
| Nightly OSHA refresh | `/api/workers-comp/cron` runs with `Authorization: Bearer $FORGE_CRON_SECRET`, the same pattern as the AI watch cron. It updates day counts on linked OSHA cases only when they changed, runs as the system, and never opens new OSHA cases. |

## Case forms (company paper forms, filled and signed digitally)

Two forms, matching the 1.0 build of the same feature:
- **Employee Injury Guidelines:** the employee signs to acknowledge receiving them. The paper form has no blanks, so the acknowledgment (signature, printed name, date) is drawn in the empty lower part of the page.
- **HIPAA Authorization:** name, date of birth, the provider authorized to disclose, the four initialed lines, the signature of the patient or a personal representative, the printed name and relationship, and the date.

**Templates are per company.** Forms carry a company's logo, staff names and phone numbers, so no form files are in the repository.
- A user with `workers_comp.configure` uploads the original PDF under Settings → Case Forms. Each upload is checked as an unprotected PDF of 1–4 pages, up to 5 MB, and stored unchanged in the private `forge-wc-forms` bucket.
- A form appears on cases only for companies that uploaded it.
- Replacing a template keeps forms already filled on the old one, so they still print from it.

**Printing**
- The blank form (`/api/workers-comp/forms/templates/[id]`) is the original file, byte for byte.
- The filled form (`/api/workers-comp/forms/[id]/pdf`) is that same file with the values and signature drawn on with `pdf-lib`, so it looks like the paper copy filled in by hand. Dates print as MM/DD/YYYY.
- Positions live in `src/lib/forgeWcFormsRules.ts` as page fractions, measured from the original forms. A template's `layout` column can override any position for a company whose form is laid out differently.
- A draft prints without a signature, so it can be signed on paper.

**Signing**
- A reusable canvas `SignaturePad` (`src/components/common/SignaturePad.tsx`) handles mouse, pen and touch.
- The PNG goes to private storage. `forge_sign_wc_case_form` signs the form in one locked, version-checked step and checks the signature belongs to that form.
- Signed forms cannot change. Corrections are a void with a reason (`forge_void_wc_case_form`) plus a new form. Drafts can be voided too.

**Email**
- Sends the signed, filled PDF as an attachment. Each recipient gets their own message.
- Recipients are chosen staff from personnel (addresses come from the personnel record, never the browser) and/or up to 10 typed outside addresses, 20 in total, with an optional note.
- Sent directly through the platform email adapter in `forgeNotifications.ts`, which now supports attachments. The notification outbox only addresses Forge users, so it isn't used here.
- Every attempt is recorded on the form history: recipients, result, and the attachment's name, size and SHA-256. Without `RESEND_API_KEY` the app says email isn't set up and records the failed attempt.

**Access**
- Guidelines: view with `workers_comp.view`; fill, sign, void and email with `workers_comp.edit`.
- HIPAA: view with `workers_comp.medical.view`; fill, sign, void and email with `workers_comp.medical.manage`. Date of birth is prefilled from the personnel record only for `workers_comp.medical.manage`.
- HIPAA forms are kept out of case evidence and case history, both of which any case viewer can see. To anyone else, a HIPAA form or its PDF looks like it doesn't exist (404).
- Archived cases take no new forms.

**Audit:** created, updated, signed, voided, printed, downloaded and emailed go to the append-only `forge_wc_case_form_events` and to the platform audit log (`forge_creator_audit_log`).

**Test-only email capture.** When `FORGE_EMAIL_CAPTURE_DIR` is set and `RESEND_API_KEY` is not, emails are written as JSON files (attachments base64) instead of being sent. Never set it in a deployment.

## Still not done

- **Scheduling the crons.** Nothing calls them yet. The deployment scheduler must:
  - call `/api/workers-comp/cron` hourly with `FORGE_CRON_SECRET`
  - call `/api/helpdesk/cron` often enough to drain email, with `HELPDESK_CRON_SECRET`

  Email also needs `RESEND_API_KEY` and `FORGE_NOTIFICATIONS_EMAIL_FROM`. Without them, deliveries are marked skipped and only the in-app notice arrives.
- **Outbox throughput.** `/api/helpdesk/cron` sends at most 100 emails per run, oldest first, shared across modules.
- **Per-user email preferences.** The notification service has no per-user opt-out yet. Recipients are controlled only by the workers' comp settings list.
- **Claim costs and reserves.** This was a placeholder in 1.0 too.
- **Seeding Form 301 from workers' comp fields.** The OSHA case still takes its Form 301 data from the incident and the personnel record.

## Tests

```bash
node --experimental-strip-types --test apps/web/tests/port-s2-workers-comp-rules.test.cjs
node apps/web/tests/port-s2-workers-comp-db.cjs
pnpm exec playwright test apps/web/tests/port-s2-workers-comp.spec.cjs --reporter=line --workers=1
```

- **Unit tests (12):** Thursday week math, update status, OSHA day counting, the 180-day cap, outcome derivation, next-action rules and author-only editing.
- **DB contract (42 checks):** duplicates, constraints, overlap exclusion, the Thursday rule, restriction options, the OSHA sync with cap and clearing, tenant guards, archived cases, role grants, and no member access.
- **Browser:** incident → case → work status (5 away / 15 restricted) → restrictions → medical visit → weekly update → OSHA recordable sync (the OSHA case shows days away, 5 and 15) → close. Also checks that a coordinator without medical access sees no medical data and cannot reach carriers.

Case form tests:
- `tests/port-s2-wc-forms.test.cjs` (5): field rules, printed values, layout overrides, email parsing, and the PDF overlay on a synthetic template.
- `tests/port-s2-wc-forms-db.cjs` (40 checks):
  - tenant guards, template replacement and size cap
  - signing (version, signature ownership), immutability, voiding
  - append-only history, archived cases
  - member denial, the private bucket, and deleting a company with signed forms
- `tests/port-s2-wc-forms.spec.cjs` (4, synthetic forms; set `FORGE_EMAIL_CAPTURE_DIR` for both the server and the test):
  - upload, and the byte-identical blank
  - HIPAA fill → sign → download → email two recipients with the attachment checked → void
  - the guidelines acknowledgment
  - a coordinator without medical access getting 404s

Weekly notice tests:
- `tests/port-s2-workers-comp-email.test.cjs` (5): timing, ordering, the 2,000-character cut, no employee details.
- `tests/port-s2-workers-comp-settings-db.cjs` (20 checks):
  - recipient limits
  - the queue function: membership and list checks, in-app plus email delivery, no repeat week, rollback on refusal
  - service role only
- `tests/port-s2-workers-comp-completion.spec.cjs`:
  - choosing recipients, and the preview (case numbers, no employee name)
  - the hourly job queueing once
  - the inbox
  - send-time access recheck
  - the outbox drain, when `HELPDESK_CRON_SECRET` is set for the test and the server
