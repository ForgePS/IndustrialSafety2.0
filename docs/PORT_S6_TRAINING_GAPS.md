# Port slice 6: Training gaps (Industrial 1.0 → 2.0)

Slice 3 brought over 1.0's training LMS: courses, versions, quizzes, My Training, the kiosk, groups and the compliance matrix. This slice fills the gaps slice 3 left open:

- **Records and evidence:** certificate and card attachments on training records, a records search, training history on the personnel profile, and team activity.
- **Automation and notices:** assignment notices, due-soon / overdue / expiring reminders, and automatic retraining.
- **Authoring and quality:** bulk question import, the quiz QC report, the missed (overdue) report, and a source-materials library with folders and topics.

1.0 reference (under `legacy/forge-platform`):
- `apps/platform-api/src/modules/industrial/`:
  - `training-question-import.ts`, `training-import-text.ts`
  - `industrial-training-record-attachments.*`
  - `notify-training-assigned.ts`
  - `training-material-topics.ts`
  - `training-personnel-report.ts`
  - `training-qc-course-titles.ts`
- `apps/industrial-web/src/components/`:
  - `training-question-import-panel.tsx`, `training-qc-panel.tsx`, `training-missed-report.tsx`
  - `training-records-search-panel.tsx`, `training-recent-activity-by-course.tsx`
  - `personnel-training-history.tsx`, `training-materials-panel.tsx`

## Data model

Migration: `apps/web/supabase/migrations/20261115200000_forge_training_gaps.sql`.

| Change | Purpose |
| --- | --- |
| `forge_training_settings` new columns | `notify_on_assign` (default on), `due_reminder_days` (0–30, default 3, 0 = off), `overdue_notices` (default on), `expiring_notice_days` (0–120, default 30, 0 = off), `auto_retrain` (default off), `retrain_due_days` (1–180, default 30), `last_auto_retrain_on`. |
| `forge_training_completion_files` | Attachments on a training record. PDF, JPEG, PNG, WebP or HEIC, up to 12 MB each, at most 10 live per record. A file cannot move to another record or be restored after removal. Removed files stay as rows (and in storage) for the audit trail. Stored in the private `forge-training` bucket under `<org>/completions/<completion>/`. |
| `forge_training_material_folders` | Folders per course. Names are unique within a course, and a folder cannot move to another course. Deleting a folder leaves its materials unfiled. |
| `forge_training_materials.folder_id`, `.topic` | A material's folder (must be in the same course) and topic. Topics are 1.0's list: general, new hire, safety, LOTO, PPE, emergency, fleet, equipment, compliance, refresher. |
| `forge_training_notice_log` | One row per notice sent: kind (`assigned`, `due_soon`, `overdue`, `expiring`), the assignment or completion it is about, and the recipient. The unique key means a notice is never sent twice. |

Database functions (service role only):

| Function | Rule |
| --- | --- |
| `forge_training_queue_notices(org, items)` | Up to 1000 notices per call. Skips anyone who is not an active member, and skips notices already in the log. Each one sent becomes a `training` notification event with an in-app delivery and a pending email. Returns `{queued, duplicate, skipped}`. |
| `forge_training_mark_auto_retrain(org, today)` | Claims the day's retraining run. Returns false if retraining is off or already ran today, so overlapping runs never both assign. |

Access: RLS is on and `anon` / `authenticated` are revoked on the three new tables. New permission: `training.reports` (safety manager, company admin, company owner).

## Notices and retraining

| Piece | Behavior |
| --- | --- |
| Assignment notice | Single assignments (`/training`) and group assignments both notify the learner when `notify_on_assign` is on. Failures are logged and never block the assignment. |
| Reminders | `runTrainingCron()` (`src/lib/forgeTrainingNotify.ts`) covers every tenant with open assignments, notice settings, or certifications expiring within 120 days. It sends a due-soon notice inside the reminder window and an overdue notice once past due; overdue wins over due soon. It sends an expiring notice only for each person's newest valid completion of a course. Terminated, inactive and archived people are skipped. |
| Automatic retraining | When `auto_retrain` is on, the first run each day assigns every active group's expired and expiring requirements, due in `retrain_due_days`. It uses the same `assignGroupRequirements` as the manual button, runs as the system, and sends assignment notices. |
| Route | `GET`/`POST /api/training/cron` with `Authorization: Bearer $FORGE_CRON_SECRET` (timing-safe compare). It only queues. `/api/helpdesk/cron` drains the email outbox, as with workers' comp. |

## Question import

On a draft version's Content page, paste questions or upload a `.txt`, `.csv` or `.pdf` (15 MB). **Preview** shows every parsed question and every problem. **Import N Questions** saves all of them or none, and only to a draft. At most 200 questions per import.

- **Text:** questions numbered `1.`, `1)` or `Q1.`, choices `A)`, `A.` or `(A)`, and an `Answer:` / `Correct answer -` / `Answer key:` line, plus an optional `Explanation:`. Page and reference lines are ignored.
- **CSV:** a question / stem / prompt column, choices as `choice1..6`, `choiceA..F`, `option*`, bare `A..F`, or one `choices` column split on `|` or `;`, then an answer column and an optional explanation. Comma, semicolon and tab delimiters are detected, and quoted multi-line cells work.

## Changes from 1.0

- **Fixed:** 1.0 read a numeric answer key as 0-based, so `Answer: 1` meant the second choice. 2.0 counts from 1.
- **Fixed:** a question with no answer line was silently given choice A in 1.0. 2.0 reports it as an error and imports nothing until it is fixed.
- **Fixed:** 1.0's missed report listed only assignments that were never started, which did not match its own overdue count. 2.0 lists every open assignment past due.
- Records search covers person name, employee number, course and certificate number. 1.0 searched titles only.
- Quiz QC reads up to 20,000 attempts in the period (1.0 used a small sample), with first-try pass rate, average attempts to pass, score spread, monthly trend and the questions answered correctly less than 70% of the time.
- Attachments go on 2.0 training records (including completions from the course player). 1.0 attached them only to legacy records. Bytes are checked by magic number, not just the declared type.
- Notice and retraining settings are per organization instead of fixed.
- CSV exports neutralize spreadsheet formulas.

## UI

| Page | What it does |
| --- | --- |
| `/training/reports` | Records search: person, course, how taken, result, date range. Shows status, expiry, certificate and attachments, with CSV. |
| `/training/reports/overdue` | Overdue training grouped by department, then person, with days late. Search and department filter, CSV. |
| `/training/reports/activity` | Team activity per course for a month or year: assigned, in progress, completed. Location and group filters, CSV. |
| `/training/reports/qc` | Quiz QC per course or all, for 30 / 90 / 180 / 365 days or all time, with CSV. |
| `/training/notices` | Notice and retraining settings (`training.manage_groups`), with the number of notices sent in the last 7 days and the last retraining run. |
| `/training/library` | Every course's materials by topic, with search and folder (`training.manage_content`). |
| `/training/courses/[id]/content` | Adds the Import Questions panel (drafts) and the library panel: add, rename and remove folders, and set each material's folder and topic. |
| `/personnel/[id]` | New Training card: open assignments (overdue flagged) and every record with status, expiry, how taken, certificate and attachments. Visible with `training.view` or `training.record_completion` in scope. Attaching needs `training.record_completion`. |

All report pages and CSVs need `training.reports` and respect its scope. The Training overview links to Reports, Library, and Notices & Retraining.

Routes:
- `POST /api/training/completions/[id]/files`: checks origin, access, size, type and magic bytes, then audits.
- `GET /api/training/completion-files/[id]`: redirects to a 5-minute signed URL after the access check. Removed files are not served.
- `GET /api/training/reports/[kind]`: `records`, `overdue`, `activity`, `qc`; audited.
- `/api/training/cron`: see above.

Shared code:
- `src/lib/forgeTrainingReportRules.ts`: pure rules (import parsers, QC, overdue, activity, notice timing, CSV).
- `src/lib/forgeTrainingReports.ts`: loaders with scope.
- `src/lib/forgeTrainingReportParams.ts`: query-string parsing.
- `src/lib/forgeTrainingNotify.ts`: notices, reminders, retraining.
- `src/lib/forgeTrainingFiles.ts`: attachment access.
- `src/components/training/`: `TrainingReportShell`, `CompletionFiles`, `PersonnelTrainingCard`.

## Still not done

- **Scheduling the cron.** Nothing calls `/api/training/cron` yet. The deployment scheduler must call it hourly with `FORGE_CRON_SECRET`, alongside `/api/workers-comp/cron` and `/api/helpdesk/cron`. Until then, assignment notices still go out, but reminders and automatic retraining do not.
- **Excel import.** Question import takes text, CSV and PDF. Save `.xlsx` as CSV first; 2.0 has no spreadsheet library.
- **Video normalization.** Still MP4 only (needs ffmpeg), as in slice 3.
- **Study mode.** 1.0's adaptive study panel, bookmarks and per-user study stats are not ported.
- **Per-assignment QR codes and self-enrollment access links.** These wait for the scan platform slice. The kiosk QR from slice 3 still works.
- **Certificate templates.** Still one layout with organization title, signer and footer.

## Tests

```bash
node --experimental-strip-types --test apps/web/tests/port-s6-training-rules.test.cjs
node apps/web/tests/port-s6-training-db.cjs
pnpm exec playwright test apps/web/tests/port-s6-training.spec.cjs --reporter=line --workers=1
```

- **Unit tests (10):**
  - date helpers and CSV (quoting, formula neutralizing)
  - attachment types
  - answer keys (letters, 1-based numbers, out of range)
  - text import (numbering styles, explanations, ignored page lines, missing answer)
  - CSV import (choice columns, split choices, multi-line cells, bad rows)
  - quiz QC summary, buckets, months and hard questions
  - overdue order and open statuses
  - activity per course
  - reminder and expiring timing and switches
- **DB contract (36 checks):**
  - attachment guards (types, 12 MB, no move, 10 live, removal frees a slot, no restore)
  - folder guards (unique per course, blank, no move), topic list, same-course folders, folder delete unfiles
  - notice queue (member vs non-member, in-app plus email, training event, dedupe, kind, input limits)
  - settings guards and defaults, and the once-a-day retraining claim
  - members cannot read the new tables or call the functions
  - the permission and its role grants
- **Browser (6 tests):**
  - import: preview errors block, then preview and add two questions (1-based answer key saved)
  - library: add a folder, set folder and topic, filter and search `/training/library`
  - personnel card: record status, overdue assignment, attach a PDF, signed redirect, refuse fake bytes
  - reports: records search with attachment, CSV, overdue, activity, QC hard question
  - a member without `training.reports` is turned away from the pages and CSV
  - notice settings save, the cron refuses a bad secret, and sends the overdue notice exactly once
