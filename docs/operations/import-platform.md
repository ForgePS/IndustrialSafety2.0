# Import Platform — Operations

**Status:** S5 deployed (development) — execution via SQS + worker  
**Date:** 2026-07-29

## Resources

| Resource       | Name pattern                                |
| -------------- | ------------------------------------------- |
| SQS            | `forge-{env}-sqs-imports` + DLQ             |
| S3             | imports bucket (`S3_IMPORT_BUCKET`)         |
| Step Functions | DEFINITION_COMPLETE_DEPLOYMENT_PENDING      |
| Worker         | ECS worker (upload detect + IMPORT_EXECUTE) |
| DB migrations  | `0022`–`0026` on development Aurora         |

## S5 operations notes

- Execute: `POST /api/v1/imports/jobs/{id}/execute` (`import.execute`) → QUEUED + SQS
- Worker commits through adapter registry (reference adapter in S5)
- Cancel / status / results / batches / errors / rollback-request control plane live
- Rollback compensation deferred — preparation only
- Runbooks: `import-retry-dlq-runbook.md`, `import-cancellation-runbook.md`
- Migrate with admin secret only: `node scripts/run-ecs-migrate.mjs`
- Deploy evidence: `docs/deployment/import-platform-s5-deployment.md`

## Runbooks

### DLQ deepening

1. Inspect DLQ messages for `tenantId` / `jobId` / `correlationId` / `messageType`.
2. Fix poison cause (bad payload, bug).
3. Authorized redrive only — never auto-redrive.

### Stuck PROCESSING job

1. Check worker logs `/forge/{env}/worker` for lock owner / heartbeat.
2. Confirm RLS GUC / tenant context in logs (no secrets).
3. If lock stale, next delivery may reclaim; or cancel and re-queue after review.

### Rollback

1. Confirm job COMPLETED / COMPLETED_WITH_ERRORS.
2. Call rollback-request API with Idempotency-Key.
3. S5 stores journal + classification only — no compensation execution.

### Malware INFECTED

Deferred to S6.

## Runbooks

### DLQ deepening

1. Inspect DLQ messages for `tenantId` / `jobId` / `stage`.
2. Fix poison cause (bad payload, bug).
3. Re-drive or mark job FAILED with audit.

### Stuck PROCESSING job

1. Check Step Functions execution (when live) and worker logs `/forge/{env}/worker`.
2. Confirm RLS GUC / tenant context in logs (no secrets).
3. Resume from last batch checkpoint or fail closed.

### Rollback

1. Confirm job status COMPLETED and rollback-safe.
2. Call rollback API with Idempotency-Key.
3. Verify `import_rollback_events` and domain undo.

### Malware INFECTED

1. Job terminal FAIL.
2. Quarantine/delete object per retention policy.
3. Notify uploader via UI error state.

## Monitoring

- Queue depth / age
- DLQ depth
- Future EMF: job started/failed, rows committed, rollback failures

Dashboard: extend platform monitoring in implementation sprint.
