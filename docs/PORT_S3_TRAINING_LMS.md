# Port slice 3: training LMS (Industrial 1.0 → 2.0)

This slice turns 2.0's training records (courses, assignments, completions) into a learning system. It adds:

- versioned course content: sections, materials and a question bank
- quizzes with graded attempts
- training groups with required courses
- an employee-number kiosk for workers without a login
- paper quiz recording
- a compliance matrix
- certificates

It builds on slice 0 (`docs/PORT_S0_PERSONNEL_FOUNDATION.md`). The kiosk signs people in with slice 0's employee-number matching (`forge_find_personnel_by_employee_number`).

1.0 reference:
- `industrial-training.service.ts`
- `industrial-training-lms.service.ts`
- `industrial-training-assignments.service.ts`
- `industrial-public-training.service.ts`
- the training section of `schema/industrial.ts`
- `apps/industrial-web/src/components/training-*`

## Data model

Migration: `apps/web/supabase/migrations/20261023140000_forge_training_lms.sql`.

| Table | Purpose |
| --- | --- |
| `forge_training_course_versions` | Content versions per course (`draft` / `published` / `retired`). Holds the pass mark (default 70%, as in 1.0), the questions per attempt, max attempts, and the optional acknowledgement. A course has at most one published version. |
| `forge_training_sections` | Ordered reading sections in a version. Each can be required or optional, link one material, and carry an estimated time. |
| `forge_training_materials` | Files in the private `forge-training` bucket: PDF, PNG, JPEG, WebP, MP4 or text, up to 50 MB. Learners open them through short-lived signed URLs. |
| `forge_training_questions` | The question bank: 2–6 choices, the correct index and an explanation. |
| `forge_training_progress` | Sections a learner has finished, per assignment. |
| `forge_training_attempts` | Quiz attempts: the questions drawn, answers, score and pass/fail. One open attempt per assignment. |
| `forge_training_completions` (extended) | Gains `version_id`, `attempt_id` and `source` (`manual` / `online` / `kiosk` / `paper`). |
| `forge_training_certificate_sequences`, `forge_training_settings` | Certificate numbers `CERT-YYYY-NNNNN`, plus the certificate title, signer and footer. |
| `forge_training_groups`, `_group_members`, `_group_requirements` | Groups of personnel, and the courses each group must keep current. |
| `forge_training_portal_links`, `_portal_sessions`, `_portal_rate_limits` | Kiosk links (token stored as a SHA-256 hash, optional Location restriction and expiry), one-hour sessions, and sign-in rate limits. |

Rules enforced in the database:

- A published version is frozen. Its settings, sections and questions cannot change. To change content, clone it into a new draft.
- Publishing retires the previous published version (`forge_publish_training_version`). Content must be complete before it can publish: at least one section, and enough questions for the quiz size.
- Grading happens only in `forge_submit_training_attempt`. The browser never receives the correct answers.
- A pass records an approved completion (`forge_record_training_pass`) with:
  - the course's expiry
  - the version and attempt
  - a certificate number
  - closure of the assignment
- Max attempts are enforced. A failed attempt leaves the assignment open while attempts remain.
- Paper results (`forge_record_paper_training_result`) apply the same pass mark and record a `paper` completion.
- Kiosk sign-in failures are counted per device (IP) and per employee number. Eight failures in 15 minutes blocks for 15 minutes, as in 1.0.
- Every table is tenant-guarded (`forge_assert_same_org`), has RLS enabled and is service-role only. The functions are granted to `service_role` only.
- New permissions:
  - `training.manage_content`
  - `training.manage_groups`
  - `training.manage_portal`

  They are added to the permission registry and role templates.

## Changes from 1.0

- 1.0 edited live course content. 2.0 freezes published versions, so every completion points at the exact content and quiz that was taken.
- 1.0 graded in the API service. 2.0 grades inside one database function, which locks the attempt so a double submit cannot score twice.
- Kiosk tokens and session tokens are stored only as hashes. The token is shown once, when the link is created.
- The kiosk session cookie is `httpOnly`, `sameSite=strict`, and scoped to that kiosk's path.
- Kiosk failures give one generic message, so the kiosk never reveals whether an employee number exists. Terminated employees and people outside the link's Location cannot sign in.
- 1.0's video normalization (server transcoding) is not ported. 2.0 accepts MP4 only.

## UI

| Page | What it does |
| --- | --- |
| `/training/courses/[id]/content` | Content manager. Start or clone a draft, version settings, upload and archive materials, sections, questions, then publish or discard. Links to the paper quiz and answer key once published. |
| `/training/courses/[id]/paper` | Printable paper quiz, or its answer key (`?variant=key`). |
| `/training/paper` | Record paper results by pasting `employee number, percent, date` rows from a spreadsheet. Bad rows are reported by line. |
| `/training/groups` | Groups, members and required courses. "Assign Required Training" creates assignments for members who are missing, expired or expiring, and skips people who already have open training. |
| `/training/matrix` and `/api/training/matrix` | Compliance matrix of personnel against courses, with CSV export. Statuses: current, expiring (30 days), expired, assigned, overdue, missing, not required. Filters by group or all courses, scoped to what the viewer can see. |
| `/training/portal` | Kiosk links. Create one with a Location and expiry, copy the URL or QR code (shown once), revoke it. |
| `/training/settings` | Certificate title, signer and footer. |
| `/my-training/[assignmentId]` | The logged-in learner's course player: sections, materials, quiz, results and certificate. |
| `/training-portal/[token]` | The kiosk. Employee-number sign-in, the learner's open training, the same course player, certificates, sign out. |
| `/training/certificates/[completionId]`, `/training-portal/[token]/certificate/[completionId]` | Printable certificate. |

`CoursePlayer` (`src/components/training/CoursePlayer.tsx`) is shared by My Training and the kiosk. Each page passes server actions already bound to its own credentials. `PrintButton` moved to `src/components/common/` so training and workers' comp can share it.

## Still not done

- **Automatic retraining on expiry.** Groups can assign expired and expiring training on demand ("Assign Required Training"). Nothing runs this on a schedule yet, because 2.0 has no scheduler. A nightly cron should call `assignGroupRequirements` for each group, the same way `/api/workers-comp/cron` runs.
- **Reminder and overdue emails.** Not built. The shared notification service is now available; follow the workers' comp weekly notice pattern (`src/lib/forgeWorkersCompNotify.ts` plus an atomic queue function).
- **Certificate templates.** 1.0 had several layouts. 2.0 has one layout with organization-level title, signer and footer.
- **Video normalization.** MP4 only, as noted above.
- **Kiosk QR target type.** The kiosk has its own QR on `/training/portal`. Linking it into the managed-QR system comes with the scan platform slice.

## Tests

```bash
node --experimental-strip-types --test apps/web/tests/port-s3-training-rules.test.cjs
node apps/web/tests/port-s3-training-lms-db.cjs
pnpm exec playwright test apps/web/tests/port-s3-training-lms.spec.cjs --reporter=line --workers=1
```

- **Unit tests (6):** matrix status (current, expiring, expired, assigned, overdue, missing, not required), newest valid completion wins, content completeness, and paper-result parsing.
- **DB contract (49 checks):**
  - frozen versions, publish and clone, one published version per course
  - grading, max attempts and the one-open-attempt rule
  - pass leading to completion and certificate, paper results
  - portal rate limiting, tenant guards, role grants
  - signed-in members cannot read the question bank, attempts, kiosk links, sessions or versions, or call the grading function
- **Browser (5 tests):**
  - A trainer builds a version (material upload, section, questions), publishes it and assigns it.
  - An employee completes the course online and gets a certificate.
  - Kiosk:
    - an unknown number is refused
    - another spelling of the employee number signs in
    - a failed quiz, then a passed quiz
    - the kiosk certificate
  - A paper result is recorded and shows on the compliance matrix.
  - An employee cannot reach the trainer pages.

Local note: on a Supabase stack whose Postgres image is newer than its storage-api image, uploads fail with database error `42P10`. In that case, pin a matching storage-api (for example `echo -n v1.82.1 > apps/web/supabase/.temp/storage-version`) and restart the stack.
