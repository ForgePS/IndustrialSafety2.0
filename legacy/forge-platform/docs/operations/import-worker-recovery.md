# Import Worker Recovery Runbook (S8)

**Document:** `docs/operations/import-worker-recovery.md`

## Symptoms

- ECS worker task stopped / crash loop
- Jobs remain PROCESSING or QUEUED
- Queue visibility timeout expiry causing redelivery
- Stale execution locks

## Severity

Crash loop or zero running tasks: SEV-2. Single task restart with recovery: SEV-3.

## Required permissions

ECS describe/update, CloudWatch logs, SQS read, DB support read.

## Safety warnings

- Do not delete queue messages to “unstick” jobs.
- Do not clear locks without verifying lease expiry semantics.
- Do not replay DLQ until root cause is understood.

## Failure checkpoints and expected behavior

| Checkpoint                   | Expected recovery                                                   |
| ---------------------------- | ------------------------------------------------------------------- |
| Before job lock              | Message redelivered; another worker acquires lock                   |
| After job lock               | Lock expires; redelivery resumes at safe boundary                   |
| During batch                 | Incomplete batch detected; successful rows not duplicated (journal) |
| After DB commit / before ack | Redelivery skips committed journal entries                          |
| During artifact generation   | Terminal status reconciled; artifact request idempotent             |
| Visibility expiry            | Message becomes visible; idempotent processing                      |

## Diagnostic steps

1. Check `forge-*-alarm-worker-running-tasks` and ECS events.
2. Tail worker logs for correlationId / jobId (no raw rows).
3. Inspect job `status`, `version`, lock columns, batch counters.
4. Inspect queue depth / in-flight / DLQ.

## Remediation

1. Restore worker desired count / fix crash cause.
2. Allow visibility timeout + lock expiry to reclaim work.
3. If poison message → DLQ runbook.
4. If stale lock past threshold → stuck-job runbook (non-destructive).

## Verification

- Worker RunningTaskCount ≥ 1
- Queue age decreasing
- Job progress monotonic; no duplicate commits
- Audit timeline coherent

## Escalation

Platform on-call → DB on-call if lock/deadlock saturation.

## Related alarms

- `worker-running-tasks`, `imports-backlog`, `imports-queue-age`, `importsdlq`
