# Import Platform S8 — Rollback

**Document:** `docs/deployment/import-platform-s8-rollback.md`  
**Companion:** `docs/deployment/import-platform-s8-deployment.md`

## Principles

1. Prefer roll forward for doc-only mistakes.
2. Prefer prior ECS task definition for bad API/worker images.
3. Prefer prior static sync for UI regressions.
4. **Never** disable FORCE RLS or weaken Outcome B to “fix” production imports.
5. **Never** activate SFN as a rollback shortcut.
6. Do not rotate app DB secrets unless the failed change rotated them.

## Scenario A — Backend image regression

1. Identify last known good API/worker task definition revisions (e.g. development `:39` / `:24` from S6 if S8 images are bad).
2. Update ECS services to previous TD; wait for stable running count.
3. Verify queue drain / no DLQ spike.
4. Re-run Outcome B smoke appropriate to `APP_ENV`.
5. Record rollback ticket with digests and correlation ids.

## Scenario B — Frontend-only regression

1. Re-sync previous Creator Console / Tenant Admin artifacts to S3.
2. CloudFront invalidation.
3. Confirm `/imports/` loads; API still prior revision.

## Scenario C — Guard / config mistake (`APP_ENV`)

1. If production-like env was mislabeled as `development`, **fix the label** — do not remove guards from code.
2. If development blocked unexpectedly, verify provider key and `APP_ENV`.
3. No administrator bypass path exists by design.

## Scenario D — Migration

S8 hardening expects **no** new migration. If an unauthorized migration was applied:

1. Stop. Engage DB on-call.
2. Do not casual down-migrate production data.
3. Follow `docs/operations/database-migration-runbook.md`.

## Scenario E — Data corruption

Use `docs/operations/import-backup-restore.md` (Aurora PITR + S3 versioning). Cross-region restore is **not** an approved rollback path until tested.

## Verification after rollback

| Check          | Pass criteria                            |
| -------------- | ---------------------------------------- |
| ECS            | Desired = running; prior digests         |
| Alarms         | DLQ/backlog not worse than baseline      |
| Scanner policy | Matches ADR Outcome B for env            |
| UI             | `/imports/` reachable if frontend rolled |
| Secrets        | Unexpected LastChangedDate investigated  |

## Communication

Notify Import Platform eng + on-call; update deployment doc status; leave open limitations register unchanged unless acceptance decision changes.
