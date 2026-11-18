# Port slice 8: Corrective Actions (Industrial 1.0 → 2.0)

2.0 already had a first-class CAPA (open → in progress → pending verification → verified → closed, with a linked Task and workflow history). This slice ports the 1.0 behaviour around it: CAPAs opened from inspections and incident root-cause analysis, the public closeout link, notifications and reports.

1.0 reference (under `legacy/forge-platform/apps`):
- Inspection → CAPA and closeout tokens: `industrial-api/.../industrial-domain.service.ts` (~6419-6665), `industrial-public-closeout.controller.ts`, web `closeout-workspace.tsx`, migration `0051_industrial_closeout_token_lookup.sql`
- RCA: `industrial-web/src/lib/incidents-module.ts` (~395-408, ~1915-1982), `incidents-rca-panel.tsx`, API `rca-print.ts`
- Reports: `reporting-adapters.ts` (~763-797), `industrial-performance-report.service.ts` (~630-672)

## Creating a CAPA from another record

`apps/web/src/lib/forgeCapaCreate.ts` holds the CAPA insert (number, linked Task, activity, audit, workflow instance) used by the normal Create action and by system sources.

`createCapaForSource` opens a CAPA for a source record:
- It does not check the actor's CAPA permissions. The caller checks access to the source, as 1.0 did when an inspector completed an inspection.
- It is idempotent per `(source_type, source_id)`: a live (not canceled, not archived) CAPA for the same source is returned instead of a second one.
- It writes the `generated_capa` record link directly.
- An owner who is no longer active personnel leaves the CAPA unassigned rather than failing.

## Inspection finding → CAPA

- **Submit an inspection** (2.0's equivalent of 1.0's completion) and every finding that is not closed or canceled gets a CAPA. The message says how many were opened. Resubmitting after a return reuses them.
- **Create CAPA** on a single finding needs `inspections.view` with the inspection in scope.
- Mapping:
  - Title "Inspection finding: <title>".
  - Description: the finding, then its inline corrective-action note, then the inspection number.
  - Severity: low / moderate / high / critical, with aliases; anything else is moderate.
  - Due date: the finding's due date, otherwise 90 days (1.0's closeout window).
  - Owner: the personnel record of the finding's assignee, otherwise the inspector.
  - Location and division come from the inspection.
- Once a finding has a CAPA, it shows the CAPA number, status and due date with a link. The old inline corrective-action editor is hidden and its text is shown read-only.
- **Not ported:** 1.0 also opened a CAPA for a failed checklist item that had no finding. In 2.0 only findings open CAPAs. Finding status is not synced from the CAPA.

## Public closeout link

- **Closeout Link** card on the CAPA page, for users with `corrective_actions.edit` in scope.
  - A link can be issued once the CAPA has an owner, due date, action plan (and root cause if required), the same as Submit for Verification.
  - The URL is shown once, with Copy. Issuing a new link revokes any unused one. Revoke is available.
  - The card shows the last submission.
- Token: `randomBytes(24)` base64url; only its sha256 hash is stored, in `forge_corrective_action_closeout_tokens`. Valid 90 days, single use.
  - RLS is on and only the service role can read or write the table.
- **Public page** `/closeout/<token>`, no login. It shows only:
  - the company name, CAPA number, title and description;
  - the location, due date and link expiry.
- Used, revoked, expired, unknown and no-longer-open links each show their own message and no CAPA details.
- **Submit** (`POST /api/closeout/<token>`):
  - Same origin only.
  - Notes are required (up to 5000 characters); the name is optional (up to 200).
  - Up to 5 JPG/PNG/WebP photos, 10 MB each, checked by file signature.
- **On submit:**
  - The token is claimed first.
  - The CAPA moves to **pending verification** with no completing user, and the linked Task is completed.
  - Photos go to the CAPA's Evidence. The person who issued the link is recorded as the uploader; the description names the submitter.
  - If anything fails, the claim is released and uploaded photos are removed.
- A signed-in verifier still verifies and closes.

## Incident root-cause analysis

- A **Root-Cause Analysis** section on the incident page, stored in `forge_incident_rca` (one row per incident).
- Fields as in 1.0:
  - problem statement, immediate actions and event date;
  - conducted by / at and participants;
  - contributing factors;
  - five whys (question and answer);
  - root cause;
  - corrective actions with owner, due date and status.
- Seeded like 1.0:
  - The problem statement and event date come from the incident.
  - Why #1 is asked from the incident title, and each later why from the previous answer. The generic "Why did that happen?" is re-asked once the previous answer is filled in.
- **Saving** needs `incidents.edit` with the incident in scope. The analysis is editable until the incident is closed.
- **Create CAPA** on an RCA action opens one CAPA per action (`source_type 'incident_rca_action'`, linked to the incident) and shows its number on the action. An action with a CAPA cannot be removed or blanked.
- **Create CAPA** next to Create Risk opens one CAPA for the incident itself. It needs `corrective_actions.create`.
- **Print RCA** (`/incidents/<id>/rca/print`): 1.0's sections and signature lines, plus a CAPA column. It needs `incidents.view` in scope.
- **Not ported:** 1.0's incident picker inside the panel (the analysis lives on the incident) and the branding logo (the company name is printed).

## Notifications

New in 2.0; 1.0 had none for CAPAs. Each notice is a `forge_notification_events` row with an in-app delivery and an email delivery. The email is sent by the existing outbox drain. Every notice links to `/corrective-actions/<id>`.

| Notice | Sent to | When |
| --- | --- | --- |
| Assigned | the owner (not when you assign yourself) | on create, and when the owner changes |
| Needs verification | every active member with `corrective_actions.verify` who can see the CAPA, except the submitter | Submit for Verification |
| Due soon | the owner | due in 0–3 days, open or in progress |
| Overdue | the owner | past due, open or in progress |

- Due soon and overdue come from `/api/corrective-actions/cron` (`Authorization: Bearer $FORGE_CRON_SECRET`, hourly).
- Each notice is sent once per due date, assignment save or submission, using a dedupe key stored on the event.
- Dates are calendar dates in America/Chicago, as for training.

## Reports

**Corrective Actions → Reports** (`corrective_actions.view`, same scope as the list). Periods: 30 days, 90 days, year to date, 12 months, or a custom range.

Each figure is defined as follows:

| Figure | Rule |
| --- | --- |
| Opened | created in the period (canceled ones included) |
| Closed | status closed, dated by `closed_at` |
| On-time % | closed on or before the due day ÷ closed with a due date, as in 1.0; "—" when none |
| Open now / overdue now | as of today, any status except closed and canceled; overdue is open with a due day before today |
| Avg days to close | created day to closed day, for CAPAs closed in the period |

- Archived CAPAs are left out. `verified` still counts as open, because 2.0 has a separate close step.
- Breakdowns are by owner, location, severity and source.
- **Export CSV** gives one row per CAPA behind the figures.
  - Columns: number, title, status, severity, source, owner, location, opened, due, closed, on time, days to close.
  - Cells that start with `= + - @` are prefixed with `'`.

## Migrations

- `apps/web/supabase/migrations/20261117110000_s8_capa_closeout_tokens.sql`
- `apps/web/supabase/migrations/20261117120000_s8_incident_rca.sql`

## Code

- **Shared:** `src/lib/forgeCapaCreate.ts`.
- **Inspection to CAPA:** `src/lib/forgeInspectionCapaRules.ts`, `src/lib/forgeInspectionCapa.ts`, and changes to `inspections/actions.ts` (`submitInspection`, `createCapaFromFinding`), `InspectionFindings.tsx` and `inspections/[id]/page.tsx`.
- **Closeout link:**
  - `src/lib/forgeCapaCloseout.ts`
  - `corrective-actions/closeoutActions.ts`, `CloseoutLinkPanel.tsx`, `CloseoutLinkControls.tsx`
  - `app/closeout/[token]/`
  - `app/api/closeout/[token]/route.ts`
- **RCA:**
  - `src/lib/forgeIncidentRcaRules.ts`
  - `incidents/rcaActions.ts`, `IncidentRcaSection.tsx`, `IncidentRcaPanel.tsx`
  - `incidents/[id]/rca/print/`
  - `IncidentCrossModuleActions.tsx` (Create CAPA)
- **Notifications:** `src/lib/forgeCapaNotifyRules.ts`, `src/lib/forgeCapaNotify.ts`, `app/api/corrective-actions/cron/route.ts`. They are called from `corrective-actions/actions.ts` (create, update, submit).
- **Reports:** `src/lib/forgeCapaReportRules.ts`, `src/lib/forgeCapaReport.ts`, `corrective-actions/reports/` (page and `export/route.ts`).

## Tests

```bash
node --experimental-strip-types --test apps/web/tests/port-s8-*.test.cjs
node apps/web/tests/port-s8-capa-closeout-db.cjs
node apps/web/tests/port-s8-capa-notify-db.cjs
pnpm exec playwright test apps/web/tests/port-s8-*.spec.cjs --reporter=line --workers=1
```

- **Unit (27):** inspection mapping (4), RCA rules (8), notification rules (6), report rules (9).
- **DB (2 scripts):**
  - Closeout: token table constraints and lockdown, and a lifecycle transition with no user.
  - Notifications: the reminder sweep queues due-soon and overdue notices once, and nothing for far-off or closed CAPAs.
- **Browser (11 tests):**
  - Inspection (2): Create CAPA on a finding; Submit opens and reuses CAPAs.
  - RCA (4): save and reload; CAPA per action; print; Create CAPA from the incident.
  - Closeout (3): anonymous submit to pending verification; revoked, expired and unknown links; endpoint validation.
  - Reports (2): figures and breakdowns for a seeded period; CSV export and no CSV when signed out.
