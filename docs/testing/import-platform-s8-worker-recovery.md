# Import Platform S8 — Worker Recovery Validation

**Document:** `docs/testing/import-platform-s8-worker-recovery.md`  
**Date:** 2026-07-30  
**Status:** **VERIFIED** (controlled development crash/replacement, stale-lock reclaim, and post-recovery workflow)

## Deployed worker

| Item            | Value                                                 |
| --------------- | ----------------------------------------------------- |
| Image tag       | `import-s8-patch-20260730113557`                      |
| Task definition | `:26`                                                 |
| CPU / memory    | 256 / 512                                             |
| Path            | API → SQS → ECS worker (`RETAIN_SQS_ECS_WORKER_PATH`) |

## Expected recovery design

Documented in `docs/operations/import-worker-recovery.md`:

- Visibility timeout redelivery
- Lock expiry
- Journal idempotency for committed batches
- No delete-message “unstick”

## Controlled drill results

| Scenario                                               | Status                                                                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stop running worker task; resume processing            | **VERIFIED** — ECS replaced task `b8220...af25` with `d2da1...0b18`                                                                                |
| Crash loop / desired count restore                     | **VERIFIED** — service returned to desired/running/pending `1/1/0` on `:26`                                                                        |
| Stale lock reclaim                                     | **VERIFIED** — synthetic expired lock was reacquired by worker `ip-10-20-2-131.ec2.internal`, the job completed, and the terminal lock was cleared |
| Visibility expiry redelivery without duplicate commits | **NOT_VERIFIED**                                                                                                                                   |

The post-recovery authenticated synthetic workflow completed with 2 successful rows, 0 failed rows,
default adapter selection, and no format-detection replay.

## Stale-lock recovery drill (DEF-S8-013)

A development-only one-off task inserted a synthetic `PROCESSING` job with a lock expired by
10 minutes, then published an `IMPORT_EXECUTE` redelivery. The service worker:

- replaced lock owner `def-s8-013-stale-owner` with its own worker identity;
- advanced `execution_lock_acquired_at`;
- completed the zero-row synthetic job;
- cleared `execution_lock_owner` and `execution_lock_expires_at`; and
- left no drill records after controlled cleanup.

The implementation uses a five-minute default lease (`nextLockExpiry`) and permits another owner
to proceed when `isLockExpired(execution_lock_expires_at)` is true.

Evidence:

- `docs/testing/evidence/import-platform/s8-worker-crash-recovery.json`
- `docs/testing/evidence/import-platform/s8-authenticated-workflow-no-replay.json`
- `docs/testing/evidence/import-platform/s8-stale-lock-recovery.json`

## Related

- Gap GAP-040 / DEF-S8-010
- DEF-S8-013 stale-lock recovery
- Aurora writer: aurora-postgresql serverless (capacity claims **NOT_VERIFIED**)
