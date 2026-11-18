# TRAINING-S10 — Employee Training Portal Closeout

## CHECKPOINT

`FORGE-INDUSTRIAL-TRAINING-PORTAL`

## STATUS

**PASS WITH CONDITIONS**

Core LMS data model, APIs, public company portal UI, admin access/QC panels, portal sessions, canonical completions, attempt numbering, and QC analytics are implemented and typecheck clean. Full directive UAT (John Smith #10452 end-to-end) is blocked on dev database migration baseline (`INDUSTRIAL-DDL-S1` / `industrial_sites` pre-existing failure); migration **0063** has not been applied to any environment in this session.

## BRANCH

`industrial/training-employee-portal`

## BASE SHA

`ee7abb2a1665614f5e3e655d704271650be459f5`

## FINAL SHA

`ee7abb2a1665614f5e3e655d704271650be459f5` (implementation complete in working tree; not yet committed)

## ARCHITECTURE

Reused existing Forge Industrial Safety Model A stack:

- `IndustrialTrainingController` / `industrial-training.service.ts` — courses, questions, quizzes
- `industrial-training-assignments.service.ts` — assignments, assignees, QR tokens
- `IndustrialPublicTrainingController` / `industrial-public-training.service.ts` — public portal
- `industrial-domain.service.ts` — personnel analytics (open assignments)
- `training-workspace.tsx` / `training-agency-panel.tsx` — admin shell
- `training-public-workspace.tsx` — assignment QR learner flow
- New `IndustrialTrainingLmsService` — access links, versions, progress, completions, QC, bulk assign
- New `training-access-portal.tsx` — company portal learner UI

## DATABASE

**Reused:** `industrial_training_sources`, `industrial_training_questions`, `industrial_training_assignments`, `industrial_training_assignment_assignees`, `industrial_training_attempts`, `industrial_training_records`, `industrial_personnel`, `industrial_training_groups`, `industrial_training_portal_sessions` (0062)

**Added (0063):**

- `industrial_training_access_links`
- `industrial_training_course_versions`
- `industrial_training_course_sections`
- `industrial_training_progress`
- `industrial_training_completions`
- `industrial_training_acknowledgements`
- `industrial_training_portal_rate_limits`

**Altered:** assignments (`course_version_id`), attempts (`course_version_id`, `attempt_number`), portal_sessions (`access_link_id`, nullable `assignment_id`), group_members (`personnel_id`, nullable `user_id`)

**Migrations:** `0062_industrial_training_portal_sessions_s1.sql`, `0063_industrial_training_lms_portal_s1.sql`

**Indexes/constraints:** Partial unique on passed completions (`assignee_id` + `version_id` WHERE `result = 'PASSED'`); access-link token hash lookup; progress per assignee; rate-limit bucket index; SECURITY DEFINER `forge_industrial_training_tenant_for_access_link`

## PUBLIC PORTAL

**Routes:**

- Company portal: `/training/access/{token}` (Next.js static page)
- Assignment QR: `/training/{token}` (existing)
- API: `GET/POST /api/v1/public/training/access/:token/*` (context, verify, resume, assignments, course, progress)
- API: `GET/POST /api/v1/public/training/:token/*` (assignment QR + shared quiz flow with session)

**Security:** SHA-256 hashed tokens; tenant resolved server-side via SECURITY DEFINER helpers; employee-number identify rate limiting (`industrial_training_portal_rate_limits`); no PII in QR payload

**Session:** Opaque `sessionToken` in `sessionStorage`; server-side `industrial_training_portal_sessions` with TTL refresh, revoke on logout, binding to access/assignment token hash; company-portal sessions support nullable `assignment_id`

## TRAINING

**Course/version:** Version 1 auto-backfilled for existing sources; sections stored per version; published version selection for course player

**Assignment:** Existing assignee model; bulk assign by department/site via LMS service; `course_version_id` on assignments

**Progress:** `industrial_training_progress` per assignee; section completion + `quiz_available` gate before quiz start

## ASSESSMENT

**Question types:** Existing published MCQ engine (STANDARD / ADAPTIVE)

**Grading:** Server-side in `industrial-training.service.ts` (`answerQuestionPublic`, `getResultsPublic`)

**Retesting:** New attempts create new rows with monotonic `attempt_number`; assignee status remains until PASSED

**Attempt retention:** All attempts persisted in `industrial_training_attempts`; failures not overwritten

## PERSONNEL

Personnel analytics panel shows open/in-progress training counts. Authenticated history API: `GET /api/v1/industrial/training/personnel/:personnelId/history`. Dedicated personnel training tab UI deferred (API ready).

## TRAINING MODULE

Admin workspace adds **QR / Access** and **QC** nav sections. Assignments, roster, team progress, and study app unchanged. Canonical completions written on pass via `IndustrialTrainingLmsService.recordCompletion` + existing `industrial_training_records`.

## ANALYTICS

QC dashboard (`GET /api/v1/industrial/training/qc`): pass rate, first-attempt pass rate, average score, completion counts from stored completions/attempts

## QC

Question-level stats from attempt `answers` jsonb: presented count, correct/incorrect, correct rate per question stem

## SECURITY

- Tenant isolation via RLS + `withTenantTransaction` + hashed token tenant resolution
- Public identify rate limiting on failed employee lookup
- Session token hash storage (not plaintext at rest)
- `resolvePublicTokenHash` auto-detects access-link vs assignment tokens for quiz/session validation
- Contract tests assert route and schema presence

## TESTS

| Suite                             | Passed | Failed | Skipped |
| --------------------------------- | ------ | ------ | ------- |
| `industrial-api-contract.test.ts` | 9      | 0      | 0       |
| `training-public.test.ts`         | 3      | 0      | 0       |

Integration/UAT tests skipped: dev DB migration baseline failure prevents applying 0063 locally

## UAT

**Planned scenario:** John Smith #10452, Maintenance, Annual LOTO, 80% pass, fail attempt 1 / pass attempt 2

**Executed this session:** UAT seed script added (`scripts/seed-industrial-training-uat.mjs`). End-to-end run pending 0063 migration on dev.

## FEATURE FLAGS

No new feature flags. Gated by existing `industrial` module entitlement and `industrial.training.manage` / learner permissions.

## DEPLOYMENT

**This session:** Production was **not** touched.

**Prior context (outside this session's no-production directive):** Migration 0062 was reportedly applied to production in an earlier continuation; that is outside S10 closeout scope. Migration **0063** has **not** been deployed anywhere.

## KNOWN CONDITIONS

1. Migration 0063 must be applied to dev/staging before live UAT
2. Dev DB baseline migration failure (`INDUSTRIAL-DDL-S1`) must be resolved independently
3. Course versioning / section editor admin UI not built (API + schema ready)
4. Personnel training history panel wired on personnel profile (`personnel-training-history.tsx`)
5. Certificates PDF, PIN 2FA, recurring scheduler — deferred per S0 recon
6. CloudFront/static rewrite for `/training/access/*` may need infra update on deploy
7. Changes uncommitted on branch (preserve unrelated working tree)

## NEXT ACTION

1. Resolve dev DB baseline migration blocker
2. Apply migration 0063 to dev
3. Run `scripts/seed-industrial-training-demo.mjs` then `scripts/seed-industrial-training-uat.mjs` and execute John Smith UAT workflow
4. Commit LMS-only files on `industrial/training-employee-portal`
5. Deploy to staging (not production) via approved workflow
