# Import Platform — Execution Architecture (S8)

**Document:** `docs/architecture/import-execution.md`  
**Path:** API → SQS → ECS worker  
**SFN:** Option B — inactive (`DEFINITION_COMPLETE_DEPLOYMENT_PENDING` / not deployed)

## Execute request

1. Client with `import.execute` calls execute endpoint (OpenAPI ImportExecution).
2. API revalidates job state, malware gate, approval, and tenant RLS.
3. API enqueues `IMPORT_EXECUTE` (`schemaVersion: "1"`) to imports SQS.
4. Job transitions toward `QUEUED` / worker-driven `PROCESSING`.

Message fields (no URLs, no row payloads): `jobId`, `tenantId`, `requestedBy`, `correlationId`, `idempotencyKey`, `attempt`, `requestedAt`.

Contract: `packages/imports/src/execution/messages.ts`  
Detail: `docs/architecture/import-platform/IMPORT_QUEUE_MESSAGE_CONTRACT.md`

## Worker pipeline

`ImportSqsConsumer` routes:

| Message                   | Processor                           |
| ------------------------- | ----------------------------------- |
| `import.upload.detect.v1` | Format detection                    |
| `IMPORT_MALWARE_SCAN`     | Malware scan (`schemaVersion: "1"`) |
| `IMPORT_EXECUTE`          | Execution commit                    |

### Execute steps

1. Validate message schema (reject malformed → non-retriable / DLQ path).
2. Load job under tenant RLS (app role; never migration credentials).
3. Acquire execution lock (owner + expiry/heartbeat).
4. Resolve adapter from registry (**reference adapter only** in S8).
5. Stream rows in batches (`S8_BATCH_RECOMMENDATION`: default **50**, max **500**).
6. Commit one logical record per adapter call; journal outcomes.
7. Update progress counters; honor `cancellationRequested` at safe boundaries.
8. Finalize terminal status + artifacts; release lock; delete SQS message.

## Batch sizing

| Constant          | Value  |
| ----------------- | ------ |
| Default           | 50     |
| Min               | 1      |
| Max               | 500    |
| Recommended range | 50–250 |

Rationale: balance Aurora transaction duration, lock hold time, and retry granularity. Cap prevents oversized transactions under concurrent tenants.

## Failure classes

| Class                        | Behavior                                                   |
| ---------------------------- | ---------------------------------------------------------- |
| RETRIABLE                    | Visibility / redelivery; after `maxReceiveCount` (3) → DLQ |
| NON_RETRIABLE_ROW            | Persist `import_row_errors`; continue                      |
| NON_RETRIABLE_JOB / SECURITY | Mark FAILED / quarantine path; do not blind-replay         |

Idempotency: execution journal prevents duplicate commits on redelivery.

## Cancellation

| State      | Behavior                                                                              |
| ---------- | ------------------------------------------------------------------------------------- |
| QUEUED     | Cancel → `CANCELLED` promptly                                                         |
| PROCESSING | `cancellationRequested`; worker stops between records; partial finalize → `CANCELLED` |

See `docs/operations/import-cancellation-runbook.md`.

## Rollback

Rollback APIs classify safety (`SAFE` / `CONDITIONAL` / `UNSAFE` / `EXPIRED`) only. **Full compensating transactions are not executed** (LIM-IMP-004).

## Step Functions (inactive)

- Package ASL includes `SecurityVerdictGate` (definition only).
- CDK construct historically `activate: false`; live account has **no** import state machine.
- Security gates enforced in API execute + worker paths.
- Do not operate as if SFN were live. ADR: `docs/decisions/import-step-functions-production-decision.md`.

## Stuck detection

`isStuckImportJob` + `STUCK_JOB_THRESHOLDS_MS` (SCANNING 15m … PROCESSING 2h … ROLLBACK_PENDING 24h). Ops: `docs/operations/import-stuck-job-runbook.md`.

## Related

- Worker detail: `docs/architecture/import-platform/IMPORT_WORKER_ARCHITECTURE.md`
- Adapter contract: `docs/architecture/import-platform/IMPORT_ADAPTER_EXECUTION_CONTRACT.md`
- Ops index: `docs/operations/import-runbook.md`
