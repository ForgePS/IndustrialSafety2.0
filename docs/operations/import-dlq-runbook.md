# Import DLQ Runbook (S8)

**Document:** `docs/operations/import-dlq-runbook.md`  
**Related alarms:** `forge-*-alarm-importsdlq`, `forge-*-alarm-imports-backlog`, `forge-*-alarm-imports-queue-age`  
**Tooling:** `scripts/import-dlq-ops.mjs`

## Symptoms

- DLQ ApproximateNumberOfMessagesVisible ≥ 1
- Alarm `importsdlq` ALARM
- Jobs stuck QUEUED/FAILED after max receive count

## Severity

| Depth / age                       | Severity                  |
| --------------------------------- | ------------------------- |
| 1–10 messages, age &lt; 1h        | SEV-3                     |
| Sustained growth or age &gt; 1h   | SEV-2                     |
| Security / malware poison pattern | SEV-1 (escalate security) |

## Required permissions

- Read SQS attributes on imports DLQ
- Optional: send to imports queue + delete from DLQ (replay)
- Read import job metadata in DB (tenant-scoped support role)

## Safety warnings

- Never print or paste raw message bodies into tickets (may contain identifiers).
- Never redrive across environments.
- Never auto-redrive on a schedule.
- Quarantined / SCAN_FAILED / security failures are not blindly replayed.
- Replay is idempotent only if worker journal + state machine allow; verify job state first.

## Diagnostic steps

1. Confirm alarm and queue depth:
   `aws sqs get-queue-attributes --queue-url <dlq> --attribute-names All`
2. Inspect sanitized metadata only:
   `node scripts/import-dlq-ops.mjs --env <env> --mode inspect`
3. Correlate `tenantId` / `jobId` / `correlationId` from message attributes (not body).
4. Load job status in DB; confirm malware verdict and stage.
5. Classify: **retriable** (transient DB/timeout) vs **terminal** (schema poison, security).

## Remediation

### Retriable

1. Fix root cause (worker capacity, DB connections, bad config).
2. Dry-run:
   `node scripts/import-dlq-ops.mjs --env <env> --mode dry-run-replay --message-id <id>`
3. Replay one message:
   `node scripts/import-dlq-ops.mjs --env <env> --mode replay --message-id <id> --confirm-replay --operator <you>`
4. Confirm job progresses; counters reconcile.

### Terminal / security

1. Do not replay.
2. Preserve evidence (message id, attributes, correlation id).
3. Escalate per `import-threat-model` / security ops.
4. Optionally move to a quarantine holding queue (manual).

## Verification

- DLQ depth returns to 0 (or expected residual terminal holds)
- Job reaches accurate terminal or processing state
- No duplicate commits (idempotency journal)
- Operator + correlationId recorded in change ticket

## Escalation

Platform on-call → Import Platform eng → Security (if malware/isolation)

## Audit requirements

Record: operator, env, messageId, correlationId, outcome, justification.

## Related alarms

- `importsdlq`, `imports-backlog`, `imports-queue-age`, `worker-running-tasks`
