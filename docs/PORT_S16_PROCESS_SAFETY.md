# Port slice 16: Process Safety

1.0 had no real process safety module. Under `legacy/forge-platform`, "process safety" was one more generic record type (category `moc`) with a title and a free-text status, and no workflow. So this slice is built from the parity matrix row ("PSM/MOC-centered workflows, action tracking, document links, reviews, approvals and auditability"), shaped around OSHA 1910.119 management of change (l), pre-startup safety review (i) and process hazard analysis (e).

The 2.0 menu: Compliance Programs → **Process Safety** (`/process-safety`), with tabs for **Management of change** and **Hazard analyses**.

## What it does

- **Management of change** (`/process-safety`, `/process-safety/changes/new`, `/changes/[id]`, `/changes/[id]/edit`):
  - Numbered `MOC-2026-0001` per company and year.
  - Fields: title, type (process, equipment, chemical, procedure, controls, facility, organizational, other), location, optional equipment, what is changing, why, technical basis, risk level, what it affects (process safety information, procedures, training, mechanical integrity, hazard review, emergency response, permits), and an owner.
  - **Temporary changes** need a reverse-by date (not in the past). The list and the change show it, and flag it once it's overdue and the change isn't closed.
  - A **pre-startup safety review** is always needed, except that an organizational change may skip it.
  - The list filters by status, and shows "Waiting for your approval" to approvers.
- **Workflow:** draft → in review → approved → implemented → closed. Rejected goes back to the owner; draft, in review, approved and rejected changes can be canceled with a reason.
  - Only a draft or rejected change can be edited or have its approvers changed.
  - **Approvers:** 1–10 people, each with an optional role (for example "Operations"). They must hold `process_safety.approve` at the change's location, and can't be the change's owner or the person who raised it.
  - **Submit** notifies the approvers (in-app and email). Each approver approves, or rejects with a reason. Any rejection sends the change back, and the owner and raiser are told why. When everyone has approved, it's approved and they're told. Resubmitting clears the earlier decisions.
  - **Implement** is refused until the pre-startup safety review is signed off and every before-startup action is done. **Close** is refused until every action is done. The page lists what's in the way.
  - A closed or canceled change is frozen.
- **Actions** on a change are Corrective Actions: each has an owner (personnel), a due date and a phase (before or after startup). The change shows each action's Corrective Action number and status, linked to it. An action counts as done once its Corrective Action is pending verification, verified or closed; a canceled one still blocks. Once implemented, only after-startup actions can be added. An action can be removed with a reason; it stays in the list as removed and its Corrective Action is left alone.
- **Documents:** link controlled documents from the document library (P&IDs, procedures, process safety information). Linked once each; unlinking is recorded.
- **Pre-startup safety review:** six checks (built to design; procedures; hazard review done; training; process safety information; mechanical integrity), each answered yes, no or not applicable. Any "no" refuses the sign-off ("Not ready for startup…"); "not applicable" needs a note. It needs `process_safety.pssr` at the location, can only be done once the change is approved and its before-startup actions are done, and is recorded with who and when.
- **History:** every step, decision, action, document and edit is in an append-only history on the change, and in the audit log.
- **Process hazard analyses** (`/process-safety/pha`, `/pha/new`, `/pha/[id]`, `/pha/[id]/edit`):
  - Numbered `PHA-2026-0001`.
  - Fields: title, process or unit, location, method (HAZOP, what-if, checklist, what-if/checklist, FMEA, fault tree, LOPA, other), status (planned, in progress, completed), team leader, team, start and completion dates, summary, and an optional related change.
  - A completed study needs its completion date (not in the future, not before the start). **Revalidate by** defaults to five years after completion and can be earlier, never later.
  - The register sorts by revalidation date and flags overdue and due within 180 days.
  - **Recommendations** are Corrective Actions, like change actions but without a phase.
  - Studies can be archived and restored.

## Scope

- Location-scoped people see and change records at their own locations only. A named approver can always open the change they've been asked to review.
- Every action re-checks permission and location on the server, whatever the page showed.

## Permissions

- `process_safety.view`: see changes and hazard analyses. Scopeable.
- `process_safety.manage`: raise and edit changes, pick approvers, add actions and documents, submit, implement, close or cancel; record hazard analyses and recommendations. Scopeable.
- `process_safety.approve`: be named as an approver and decide. Sensitive; needs confirmation.
- `process_safety.pssr`: sign off pre-startup safety reviews. Sensitive; needs confirmation.
- **Grants:**
  - Read-only: view, company-wide.
  - Supervisors: view, at location scope.
  - Location administrators: everything, at location scope.
  - Safety managers, company admins, company administrators and owners: everything, company-wide.
  - Employees: none.

## Schema

`20261120100000_s16_process_safety.sql`:
- **Feature and menu:** the `process_safety` feature, with plan entitlements (internal-demo, enterprise), and the menu entry `nav.process_safety` under Compliance Programs.
- **Numbering:** `forge_psm_sequences` and `next_forge_psm_number(org, 'moc'|'pha')` (service role only).
- **Tables:**
  - `forge_moc_changes`: checked type, risk, impacts and number format; a temporary change has its date; each step's timestamp is set exactly when the change has reached that step; implemented or closed needs the PSSR when one is required; canceled needs its reason.
  - `forge_moc_approvals`: one per approver; decided ones have a time; a rejection has a comment.
  - `forge_moc_documents`: one link per document.
  - `forge_pha_studies`: completed ⇔ completion date; revalidation set only when completed, after completion, within five years.
  - `forge_psm_actions`: exactly one parent; a phase for change actions, none for recommendations; one Corrective Action each; removal needs a reason.
  - `forge_psm_activity`: the history.
  - All have RLS on, no anon or authenticated access, and service role only.
- **Trigger `forge_psm_guard`:**
  - Locations, equipment, documents, Corrective Actions, approvals, actions and history stay in one company. Owners and approvers are active members.
  - Numbers, companies and parents never change, and an action's Corrective Action is fixed once set.
  - A closed or canceled change is frozen (except for links cleared when equipment or a user is deleted).
  - Approvers are only added before submission, decisions only made in review, and decisions only reset when the change goes back for review.
  - History rows can't be edited.

## Tests

- **Unit:** `node --experimental-strip-types --test apps/web/tests/port-s16-process-safety-rules.test.cjs` (8). Covers dates, the change form, approvers and outcomes, decisions, the PSSR, actions, blockers and steps, temporary changes, the PHA form and revalidation, and notices.
- **Database:** `node apps/web/tests/port-s16-process-safety-db.cjs`. Covers numbering, change and PHA checks, one company, member approvers, decisions only in review, frozen closed changes, append-only history, action parents and phases, no direct access, and permissions and grants.
- **Playwright:** `port-s16-process-safety.spec.cjs` (5). Covers:
  - an employee kept out;
  - raising a change with an approver, a before-startup action (a Corrective Action) and a document, and submitting it;
  - a rejection that needs a reason, resubmission and approval by the approver (given view and approve for the run);
  - implementing refused until the PSSR and the action are done, a PSSR "no" refused, then sign-off, implement and close;
  - a completed HAZOP linked to the change, with five-year revalidation and a recommendation.
- **Not in CI:** like slices 8–15, these aren't in the CI workflow yet.

## Remaining

- Reminders: a cron emailing owners about overdue temporary changes and studies due for revalidation.
- PHA worksheets (nodes, deviations, causes, consequences, safeguards, risk ranking) instead of a summary and recommendations.
- The other PSM elements: process safety information register, mechanical integrity, compliance audits, employee participation, hot work, incident investigation links.
- Linking a change to incidents and JSAs, and starting a change from an incident or a CAPA.
- Change templates per type, and required approver roles per type or risk.
- 1.0 data migration: 1.0's generic `moc` records.
