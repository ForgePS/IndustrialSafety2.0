# Import Worker Architecture (S5)

Worker service polls `SQS_IMPORT_QUEUE_URL` via `ImportSqsConsumer`.

## Message routing

| `messageType` / `type`    | Processor                      |
| ------------------------- | ------------------------------ |
| `import.upload.detect.v1` | Format detection (S3)          |
| `IMPORT_EXECUTE`          | Execution commit pipeline (S5) |

## Execution steps

1. Validate message schema (reject malformed)
2. Revalidate job in DB under tenant RLS
3. Acquire execution lock (owner + expiry/heartbeat)
4. Resolve adapter from registry
5. Stream rows in configurable batches
6. Commit through adapter (one logical record transaction)
7. Persist journal + row outcomes + progress
8. Finalize terminal status + result summary
9. Release lock; delete SQS message (or visibility retry)

## Failure handling

| Class                        | Behavior                                                               |
| ---------------------------- | ---------------------------------------------------------------------- |
| RETRIABLE                    | Leave message / short visibility; bounded by SQS maxReceiveCount → DLQ |
| NON_RETRIABLE_ROW            | Persist error; continue job                                            |
| NON_RETRIABLE_JOB / SECURITY | Mark FAILED; delete message                                            |

Admin migration credentials are never used by the worker (app secret only).
