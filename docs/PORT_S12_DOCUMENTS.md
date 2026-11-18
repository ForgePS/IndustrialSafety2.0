# Port slice 12: Document Control

Ports Forge 1.0's Document Control module (`legacy/forge-platform/apps/platform-api/src/modules/industrial/industrial-document-control.service.ts`, `document-control-workflow.ts`, `document-control-folders.ts`, `apps/industrial-web/src/components/documents-workspace.tsx`) into 2.0 at `/documents` (menu: System Tools → Document Control).

## What it does

- **Library** (`/documents`): folders with counts (built-in "EHS Policies", plus folders managers create, rename and delete; deleting keeps the documents), search, status / location / folder filters, review-due warnings. View-only users see only published documents distributed to them.
- **Documents** (`/documents/new`, `/documents/[id]`, `/documents/[id]/edit`): number (blank → `DOC-000001`), name, description, folder, location (blank = company-wide), owner, review interval, whether acknowledgment is required.
- **Versions**: upload a file (PDF, Word, Excel, PowerPoint, image or text, up to 25 MB, type checked from the file's bytes), submit for review, withdraw, approve (effective date and note) or send back (reason required). Approval publishes the version, supersedes the old one and sets the next review date. Draft versions can be deleted; submitted ones can't be changed. Files are private (`forge-documents` bucket) and opened through short-lived signed links; view-only users can open only the current version.
- **Who it is for**: everyone, or any mix of locations, departments and roles.
- **To read** (`/documents/acknowledgments`): the current version of each published document distributed to you that you haven't acknowledged, plus your history. A new approved version asks again.
- **Approvals** (`/documents/approvals`), **Reviews** (`/documents/reviews`: overdue and due within the warning window, with Confirm review that moves the date on without a new version), **Archived**, **Settings** (self-approval, default review interval, warning days).
- **Acknowledgment progress** on each document and a CSV of the audience with acknowledged yes / no and date.
- **Notices** (in-app and email): version submitted → approvers in scope; sent back → submitter with the reason; approved → submitter, and "New document to read" to the audience. Review reminders from `GET /api/documents/cron` (same auth as the fleet cron) to the owner and managers in scope, once per document, review date and kind.
- **Dashboard**: "Documents to read" in What Needs Your Attention.
- History of every step on the document, and audit rows for changes.

## Fixes over 1.0

- Acknowledgments go only to the people a document is distributed to. 1.0 asked everyone, and never used its distribution scopes.
- Only the current version needs acknowledging; superseded versions drop off.
- The submitter can't approve their own version unless settings allow it.
- One version in review at a time.
- Sending back needs a reason and tells the submitter.
- Approval sets the next review date from the review interval, and reviews can be confirmed without a new version. 1.0 never moved the date.
- File types are checked from the content, not trusted from the browser.
- Status changes only through database workflow functions. Submitted and approved versions, and acknowledgments, can't be edited (triggers).

## Permissions

`documents.view` (everyone), `documents.manage`, `documents.approve`, `documents.view_acknowledgments`, `documents.settings`. Manage, approve and view-acknowledgment grants can be scoped. Location scope covers documents at your locations plus the ones you own or created; company-wide documents need organization scope. Grants: employees and read-only users get view; supervisors and location administrators get view plus acknowledgments (location); company administrators and owners, safety managers and company admins get everything.

## Schema

`20261119100000_s12_documents.sql`:
- Tables: `forge_document_settings`, `forge_document_folders`, `forge_documents`, `forge_document_versions`, `forge_document_distributions`, `forge_document_acknowledgments`, `forge_document_activity`, `forge_document_notice_log`.
- Functions: `next_forge_document_number`; workflow functions `forge_document_submit_version` / `approve_version` / `reject_version` / `withdraw_version` / `mark_obsolete` / `confirm_review` / `archive`; and `forge_document_reaches_user`.

`20261119101000_s12_document_cleanup.sql` lets a whole document be deleted (cascade) while still refusing to delete a single submitted version.

## Tests

- Unit:
  - `node --experimental-strip-types --test apps/web/tests/port-s12-document-rules.test.cjs` (11)
  - `port-s12-library.test.cjs` (6)
  - `port-s12-documents-cron.test.cjs` (6)
- Database:
  - `node apps/web/tests/port-s12-documents-db.cjs` (workflow, guards, distribution, no direct access)
  - `node apps/web/tests/port-s12-documents-cron.cjs` (14 checks)
- Playwright (run one after the other, not at the same time; the workflow spec briefly gives the standard user approve rights):
  - `port-s12-library.spec.cjs` (3)
  - `port-s12-workflow.spec.cjs` (5)

## Remaining

- Schedule `/api/documents/cron`.
- No dashboard count for versions waiting for approval.
- Links from other records (incidents, LOTO, training) to controlled documents.
- Reminders for people who haven't acknowledged.
- Library access is worked out per document in application code; this is not paged for very large libraries.
- Reminder dedupe is per document, so a manager added after a reminder went out won't get that one.
- 1.0 data migration.
