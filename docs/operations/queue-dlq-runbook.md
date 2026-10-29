# Queue and DLQ Runbook

**Sprint:** 1E  
**Scope:** Integration-events SQS queue, dead-letter queue, EventBridge routing  
**Related:** [ADR-024](../decisions/ADR-024-event-processing-idempotency.md), [worker-failure-runbook.md](./worker-failure-runbook.md)

## Architecture

```
API transaction → outbox_events → worker-service → EventBridge (source=forge.platform)
                                                      ↓
                                            integration-events SQS
                                                      ↓
                                            integration worker handlers
                                                      ↓ (after max receives)
                                                   DLQ
```

EventBridge rule targets the integration-events queue. Messages exceeding max receive count move to the DLQ.

## Symptoms

- CloudWatch alarm: queue backlog depth
- CloudWatch alarm: DLQ messages visible
- CloudWatch alarm: EventBridge failed invocations
- Handlers never run but outbox shows `PUBLISHED`

## Triage checklist

| Step | Action                                                   |
| ---- | -------------------------------------------------------- |
| 1    | Check primary queue `ApproximateNumberOfMessages`        |
| 2    | Check DLQ message count (any > 0 warrants investigation) |
| 3    | Sample one DLQ message body (redact before sharing)      |
| 4    | Correlate `correlationId` to API audit and outbox row    |
| 5    | Identify handler name and event `type`                   |
| 6    | Check worker ECS task health and recent deploy           |

## Common DLQ causes

| Cause                         | Fix                                             |
| ----------------------------- | ----------------------------------------------- |
| Unknown event type            | Register handler or filter rule                 |
| Missing or invalid `tenantId` | Fix publisher payload; reject at API            |
| Handler exception             | Fix code; redeploy worker                       |
| Database timeout in handler   | Scale Aurora or optimize query                  |
| Duplicate processing race     | Expected — dedup via `event_processing_records` |
| Poison message                | Fix and replay; do not blindly purge            |

## Idempotent replay procedure

1. Confirm handler is idempotent on event `id` ([ADR-024](../decisions/ADR-024-event-processing-idempotency.md)).
2. Fix root cause in handler or upstream publisher.
3. Deploy fixed worker.
4. Move message from DLQ to primary queue **one message at a time** during maintenance window.
5. Verify `event_processing_records` shows COMPLETED.
6. Monitor for return to DLQ.

Do not mass-replay without understanding failure mode.

## Purge policy

- **Never purge DLQ** in production without incident ticket and stakeholder sign-off.
- Development: purge acceptable only when messages are known synthetic test events.

## EventBridge failures

If events never reach SQS:

1. Verify rule pattern `source = forge.platform`.
2. Check rule target permissions (SQS send).
3. Inspect EventBridge failed invocations metric.
4. Confirm bus name matches worker environment.

## Alarms (Sprint 1E Wave 6)

- Queue backlog threshold exceeded
- DLQ messages > 0
- Event delivery failure rate

Link alarms to this runbook in the operations wiki.

## References

- [platform-events-v1.md](../api/platform-events-v1.md)
- [worker-failure-runbook.md](./worker-failure-runbook.md)
