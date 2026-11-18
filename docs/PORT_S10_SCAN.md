# Port slice 10: Scan (Industrial 1.0 → 2.0)

1.0's working Scan feature is its unified QR system. Someone scans a sticker on equipment or at a location and gets an action menu:
- inspect it (daily, weekly or monthly checklist);
- report an issue;
- tag it out of service, or return it to service;
- see its history;
- open its LOTO procedure or a linked form.

Field workers can use it without a Forge login by entering their employee number. 2.0 already had managed QR codes (QR Links), but every code jumped straight to one asset page. This slice ports the menu onto QR Links.

1.0's scan assignment, schedule and missed-scan tables only held migrated data and had no code, so they are not ported. Scheduled checks belong to inspection schedules and Tasks.

1.0 reference (under `legacy/forge-platform/apps`):
- **API:** `platform-api/src/modules/industrial/`: `scan-actions.ts`, `qr-action-config.ts`, `qr-scan-asset.ts`, `industrial-public-qr.service.ts`, `employee-number.ts`.
- **Web:** `industrial-web/src/components/`: `scan-public-workspace.tsx`, `scan-inspection-runner.tsx`, `qr-camera-scanner.tsx`, `qr-links-workspace.tsx`.

## Data

Migrations `20261117140000_s10_scan.sql` and `20261117143000_s10_issue_uploads.sql`:

| Table / change | Holds |
| --- | --- |
| `forge_qr_codes` | A QR can now point to an **asset, location or form**. A trigger checks that the target belongs to the same company; it replaces the asset-only foreign key, and assets with a QR still can't be hard-deleted. New default action `scan_menu`, which location and form QRs must use. New `access_mode` and `action_config` columns. |
| `forge_qr_scans` | The scan log, now with the action taken, result (ok / denied / failed), person (`personnel_id`), linked record and metadata. Scan-menu events are written by `forge_record_qr_event`, and only `open` counts towards the QR's scan count. |
| `forge_qr_scan_sessions` | Employee-number sessions on one QR. Only the sha256 of the cookie value is stored. Sessions last 8 hours. |
| `forge_qr_scan_rate_limits` | Failed employee-number attempts, per device and per number. |
| `forge_asset_status_history` | **New:** every asset status change, with from / to, reason, notes, source (scan, issue report, scan inspection, record edit), QR, and who. Out of service / return to service go through `forge_set_asset_service_status`, which changes the status and writes history in one transaction. A trigger records any other status change as "record edit". |
| `forge_qr_issue_reports` | Issues reported from a scan, with photos and the Corrective Action they created. |
| `forge_qr_issue_uploads` | Issue photos uploaded before the report is sent. Used for the upload limit, and so a report can only claim its own photos. |
| `forge_inspections` | New `qr_code_id`, `asset_id` and `inspection_frequency` for inspections started from a scan. |

All new tables are server only (service role). Every scan page and action loads the QR from its token again and checks the action for the current viewer.

## Permissions

New in the QR Links feature:
- `qr_management.service_status`: mark equipment out of service or return it to service from a scan. Supervisors and location admins get it at location scope; safety managers and company admins / owners at organization scope.
- `qr_management.view_issues`: see scan issue reports and receive their notices. Granted to the same roles.

The menu also uses existing permissions for signed-in users:

| Action | Signed in | Employee number |
| --- | --- | --- |
| Report an issue | any member | yes |
| Daily / weekly / monthly inspection | `inspections.create` | yes |
| Mark out of service | `qr_management.service_status` or `assets_equipment.edit` | yes |
| Return to service | `qr_management.service_status` or `assets_equipment.edit` | only if the QR allows it |
| Equipment history | `assets_equipment.view` or `qr_management.view_scans` | yes |
| LOTO procedure | everyone (read only, approved procedures only) | yes |
| Fill out a linked form | `forms.submit` | no (sign in) |
| Open equipment record | `assets_equipment.view` | no |

Anonymous visitors can report an issue only on QRs set to "Anyone can report an issue". The menu still shows what's locked and why ("Enter your employee number to use this." / "Sign in to use this.").

## QR setup (QR Management)

- **Points to:** an asset, a location, or a published form. A new QR opens the scan menu by default. Asset QRs can still go straight to the asset record, maintenance, meter reading or LOTO as before.
- **Access:**
  - **Signed-in users only.**
  - **Employee number or sign-in.**
  - **Anyone can report an issue; employee number for the rest.**
- **Actions:**
  - toggles for report issue, out of service, return to service, history and LOTO;
  - "let employees return equipment to service" (off by default; 1.0 always allowed it);
  - "failed inspection item takes the equipment out of service" (on by default);
  - an inspection checklist for each of daily, weekly and monthly;
  - linked forms to fill out.
- **The QR page** shows the scan setup, a "Preview scan menu" link, a 30-day summary (scans, inspections started and completed, issues, out of service, return to service) and the scan log with action, result, person and linked record.
- **The QR Management header** links to the scanner (`/scan`) and to **Scan issues** (`/qr/issues`).
- **The asset page** shows a **Service status history** card and the asset's QR codes.

The sticker URL is unchanged (`/q/<token>`), so printed stickers keep working. Changing a QR to the scan menu needs no reprint.

## Scan menu (`/scan/<token>`)

- **Header:** a mobile page with no app chrome, showing the company, what was scanned, the QR number and the equipment status. The header turns red with "OUT OF SERVICE — DO NOT USE" when the equipment is tagged out.
- **Employee number:**
  - On employee-number QRs, the person types their number. It matches any of 1.0's spellings (`123`, `EMP-123`, `emp 0123`).
  - Failures always give the same message, and 8 failures in 15 minutes (per device or per number) block for 15 minutes.
  - The session is an httpOnly cookie for that QR only, and "Not you? Sign out" ends it.
  - A page that needs identification sends the person here and returns them afterwards.
- **Signed in:** members of the QR's company use their own permissions. People signed in to another company are treated as anonymous.
- **Out of service:** needs a reason. **Return to service:** notes are optional. Both write status history, an asset activity row and a scan-log entry.
- **History** (`/scan/<token>/history`): the newest 60 of these, merged:
  - status changes;
  - inspections of the asset;
  - scan issue reports with their CAPA;
  - scans.

  Only signed-in members get links into Forge.
- **LOTO:** opens the existing public LOTO page, which now also accepts scan-menu QRs with LOTO turned on.

## Report an issue (`/scan/<token>/report`)

- **Fields:** title, description (required), priority, category, "immediate hazard", "take this equipment out of service" (for people allowed to; an immediate hazard implies it), up to 3 photos (JPEG / PNG / WebP, 5 MB each, checked by content), and an optional name for anonymous reporters.
- **Corrective Action:** every report creates one.
  - Due in 1 / 7 / 14 / 30 days by priority, and an immediate hazard raises the priority to at least high.
  - Assigned to the asset's custodian if there is one, at the asset's location, and linked to the asset.
- **Notifications** (1.0 only said "Supervisors have been notified"): in-app and email to members with `qr_management.view_issues` or `corrective_actions.assign` covering that location, plus the custodian. Immediate hazards and critical issues are titled "URGENT".
- **Confirmation:** shows the CA number and whether the equipment is now out of service.
- **Limits:** 30 photo uploads per QR per 10 minutes.

## Inspections from a scan (`/scan/<token>/inspect/<daily|weekly|monthly>`)

- **Template:** comes only from the QR's setup for that frequency.
- **Starting:** the page shows the checklist and a **Start** button. Opening the page or a link creates nothing.
- **Signed-in members:** the inspection is created the normal way (location from the asset, scope checked) and opens on the normal inspection page, switched to the QR's company. That page shows "Started from QR …".
- **Employees** answer on the phone:
  - Pass / Fail / N/A, Yes / No / N/A, number and text.
  - Each answer saves as they go, required items are enforced, and an answer that raises a finding needs a note.
  - Today's unfinished inspection for the same person, QR and frequency is resumed.
- **Completing:**
  - It is submitted.
  - Each failed item becomes a finding with its own Corrective Action.
  - When the QR says so, the equipment is taken out of service with the inspection as the reason.
  - The result screen lists the findings, the CA numbers and the equipment status.

## Scanner (`/scan`)

The in-app camera scanner uses the browser's built-in QR detector, with no new library. Where the browser has none (iPhone Safari), it says so and offers manual entry. Manual entry accepts the full sticker URL, a `/q/…` or `/scan/…` path, or the bare token.

## Changes from 1.0

- **Rate limiting:** employee-number identification is rate limited, and the session is a server-side cookie. 1.0 had no limit and re-sent the number with every request from browser storage.
- **Return to service:** employees can return equipment to service only when the QR allows it. 1.0 let anyone with a valid number do it.
- **Out of service on a failed item:** a QR setting, on by default. 1.0 did it for any "No" answer, with no way to turn it off.
- **Ownership checks:** completing a scan inspection checks that it belongs to this QR, this person and is still open. 1.0 checked only the company.
- **Notifications:** issue-report notifications are sent. 1.0's were stubbed.
- **Analytics:** counts the action names that are actually logged. 1.0 counted names it never wrote, so its inspection and issue counts were always zero.
- **Status history:** asset status changes have a real history table. 1.0 kept them only in QR audit events.
- **Starting an inspection:** needs a button press, so link prefetching or a reload can't create records.

## Not ported / gaps

- **Target types:** vehicles / DVIR, supplies, SDS, JSA, documents, training and emergency SMS sign-up. Those modules either haven't been ported yet or have no scan target in 2.0. LOTO and forms are covered.
- **Training on identify:** 1.0 showed the employee's training status after they entered their number; 2.0 doesn't.
- **Printing:** sticker printing (Brady / printer bridge) and token replacement (1.0's "replace" with `replacement_qr_id`). Token rotation and the existing QR image are unchanged.
- **Stored photos:** issue photos uploaded but never attached to a report stay in storage; there is no cleanup job yet. The upload limit is per QR, not per device.
- **Form QRs:** visible to anyone with QR view permission in the company, whatever their location scope.
- **Preview:** "Preview scan menu" counts as a scan.

## Code

- **Rules and context:**
  - `apps/web/src/lib/forgeScanRules.ts`: pure config parsing, action menu, viewer checks and token extraction.
  - `apps/web/src/lib/forgeScanContext.ts`: QR and target loading, viewer, employee sessions and rate limit, scan log, service status.
- **Pages:**
  - `apps/web/src/app/scan/`: the scanner, menu, history, report and inspect pages, with their actions.
  - `apps/web/src/components/scan/`: shell, menu, camera scanner, issue form and list, inspection runner and result.
- **Feature libraries:**
  - `apps/web/src/lib/forgeScanHistory.ts`, `forgeScanIssues.ts`, `forgeScanNotify.ts`
  - `forgeScanInspections.ts`, `forgeScanInspectionRules.ts`
- **QR admin:**
  - `apps/web/src/app/(back)/qr/`: form, actions, detail, list, and `issues/`.
  - `apps/web/src/components/qr/`: `QrScanSettingsFields.tsx`, `AssetScanPanels.tsx`.
  - `apps/web/src/lib/forgeQr.ts`, `forgeQrDestination.ts`.
- **Sticker route:** `apps/web/src/app/q/[token]/route.ts` sends scan-menu, location and form QRs to `/scan/<token>`.
- **Corrective Actions:** `forgeCapaCreate.ts`, `forgeInspectionCapa.ts` and `forgeCapaWorkflowSync.ts` accept a null actor, so a CAPA can be created by an employee or anonymous reporter.

## Tests

| File | What |
| --- | --- |
| `tests/port-s10-scanner-rules.test.cjs` | Config parsing (including 1.0 names and junk), menu per target and status, viewer permission matrix, locking, token extraction. |
| `tests/port-s10-qr-admin.test.cjs` | Scan summary counts, event descriptions, allowed default actions, config references. |
| `tests/port-s10-scan-issues.test.cjs` | Issue validation, priority to due date and severity, photo checks. |
| `tests/port-s10-scan-inspections.test.cjs` | Which answers raise findings, required notes. |
| `tests/port-s10-qr-admin.spec.cjs` | Creating and editing asset, location and form QRs with scan setup; QR page summary and log; asset status history card. |
| `tests/port-s10-scan-menu.spec.cjs` | Sticker redirect; wrong and right employee number; out of service by an employee; return to service blocked for employees and allowed for an admin; history; sign-in-only QRs; rate limit. |
| `tests/port-s10-scan-issues.spec.cjs` | Anonymous report with photo creates a CA and logs it; employee-number QRs ask for identification; employee report takes equipment out of service; admin issues list. |
| `tests/port-s10-scan-inspections.spec.cjs` | Identify then Start; required items; resume; all-pass run; failed item creates a finding, a CA and takes the equipment out of service; missing template; signed-in member continues on the inspection page. |
