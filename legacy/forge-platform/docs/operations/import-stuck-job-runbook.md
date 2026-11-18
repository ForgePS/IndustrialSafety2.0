# Import Stuck Job Runbook (S8)

**Document:** `docs/operations/import-stuck-job-runbook.md`  
**Detection helper:** `isStuckImportJob` / `STUCK_JOB_THRESHOLDS_MS` in `@forge/imports`

## Monitored states and thresholds

| Status            | Threshold  |
| ----------------- | ---------- |
| SCANNING          | 15 minutes |
| VALIDATING        | 30 minutes |
| READY_FOR_PREVIEW | 30 minutes |
| QUEUED            | 30 minutes |
| PROCESSING        | 2 hours    |
| ROLLBACK_PENDING  | 24 hours   |

Note: `PREVIEW_GENERATING` and `CANCELLATION_REQUESTED` are not discrete shared job statuses; preview waits use `READY_FOR_PREVIEW`, and cancel transitions to `CANCELLED` at a safe boundary while leaving `PROCESSING` until then.

## Symptoms

- Job `updated_at` older than state threshold while status remains non-terminal
- Queue age high with no worker progress
- Operator reports “stuck on scanning/processing”

## Severity

Single job: SEV-3. Fleet-wide spike: SEV-2.

## Required permissions

Support read on import jobs (tenant-scoped); ops for queue/worker.

## Safety warnings

- **No automatic destructive correction.**
- Do not force COMPLETED.
- Do not delete journal/batches.
- Preserve tenant isolation on every query.
- Avoid duplicate alarms: group by status + correlation window.

## Diagnostic steps

1. Confirm status + `updated_at` vs threshold.
2. Collect correlationId, tenantId, jobId (safe metadata only).
3. Check scan events / malware verdict for SCANNING.
4. Check queue depth, worker tasks, DLQ.
5. Check execution lock / batch counters for PROCESSING.
6. Emit/record operational event with correlationId (ticket).

## Remediation (safe)

1. If worker down → worker recovery runbook.
2. If poison message → DLQ runbook.
3. If scan provider blocked (production guard) → inform tenant; no bypass.
4. If stale lock past lease → wait for expiry or authorized lock-release procedure.
5. If cancel requested mid-flight → allow safe cancel boundary; do not hard-kill committed batches.

## Verification

- Job progresses or reaches accurate terminal state
- Metrics/alarms clear
- Audit timeline coherent

## Escalation

Import Platform eng → Security if quarantine/malware related.
