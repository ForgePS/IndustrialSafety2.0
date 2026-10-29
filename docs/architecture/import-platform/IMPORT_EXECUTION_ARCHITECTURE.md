# Import Execution Architecture (S5)

## Relationship

| Layer                           | Role                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| API                             | Control plane (`execute`, `cancel`, `status`, `results`, batches, errors, rollback-request) |
| SQS (`forge-{env}-sqs-imports`) | Execution trigger (`IMPORT_EXECUTE` v1)                                                     |
| Step Functions                  | Orchestration definition (ASL + CDK) — **DEFINITION_COMPLETE_DEPLOYMENT_PENDING**           |
| ECS worker                      | Import processing (polls SQS; upload detect + execute)                                      |
| Adapters                        | Product record operations via registry (reference adapter only in S5)                       |
| PostgreSQL                      | Durable job/row/batch/audit/rollback journal                                                |
| S3                              | Source files and large artifacts                                                            |

## State transitions (execution)

`APPROVED → QUEUED → PROCESSING → COMPLETED | COMPLETED_WITH_ERRORS | FAILED`

Cancellation: `QUEUED → CANCELLED`; `PROCESSING` sets `cancellationRequested` and stops at safe checkpoint.

Rollback prep: `COMPLETED|COMPLETED_WITH_ERRORS → ROLLBACK_PENDING` or `ROLLBACK_REFUSED`.

## Idempotency

- Execution idempotency key on job
- Batch idempotency key
- Journal idempotency per tenant/job/row/adapter
- Reference adapter in-memory upsert key

Guarantees: **at-least-once** queue delivery; **effectively-once** commits via journal + row status.
