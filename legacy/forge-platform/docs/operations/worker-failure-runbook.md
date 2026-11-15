# Worker Failure Runbook

**Sprint:** 1E  
**Scope:** Outbox publisher and SQS integration worker  
**Related:** [outbox-worker.md](./outbox-worker.md), [ADR-016](../decisions/ADR-016-outbox-pattern.md), [ADR-024](../decisions/ADR-024-event-processing-idempotency.md)

## Services

| Service                   | Role                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| `worker-service` (outbox) | Polls `outbox_events`, publishes to EventBridge                         |
| Integration worker (ECS)  | Consumes SQS, runs typed handlers with `event_processing_records` dedup |

Development steady state: worker desired count **0** for cost control. Enable temporarily for pipeline proof.

## Symptoms

- Growing `outbox_events` rows in `PENDING` or `FAILED`
- EventBridge failed invocations alarm
- SQS queue depth alarm
- Domain changes succeed in API but downstream side effects missing
- ECS worker tasks crash looping

## Outbox publisher triage

| Step | Action                                                               |
| ---- | -------------------------------------------------------------------- |
| 1    | Count pending outbox rows (tenant-scoped query via admin session)    |
| 2    | Check worker ECS service desired/running count                       |
| 3    | Inspect worker logs for EventBridge `AccessDenied` or network errors |
| 4    | Verify `EVENT_BUS_NAME` / `EVENTBRIDGE_BUS_NAME` and `AWS_REGION`    |
| 5    | Confirm `DATABASE_URL` reachable from worker task                    |

### Outbox behavior

1. Claim up to 25 `PENDING` rows (`FOR UPDATE SKIP LOCKED`).
2. Publish to EventBridge bus (default `forge-platform`).
3. Mark `PUBLISHED` and append `event_delivery_log`.
4. On failure: retry with backoff; after **10** attempts → `FAILED`.

Poll interval: **2 seconds** when `APP_ENV` is set.

### Recovery

**Development:**

```bash
# Scale worker temporarily (when scripts are available)
pnpm worker:enable:development

# Or run locally against shared DB
pnpm --filter @forge/worker-service dev
```

After proof, return to cost posture:

```bash
pnpm worker:disable:development
```

**Failed rows:** inspect payload and error in outbox metadata; fix root cause; manual re-queue only with platform team approval (avoid duplicate side effects — consumers must be idempotent on event `id`).

## Integration worker triage

| Step | Action                                                      |
| ---- | ----------------------------------------------------------- |
| 1    | Check SQS approximate message count and DLQ depth           |
| 2    | Inspect worker logs for handler exceptions                  |
| 3    | Verify handler registered for event `type`                  |
| 4    | Check `event_processing_records` for stuck IN_PROGRESS rows |
| 5    | Confirm event includes valid `tenantId` for tenant handlers |

Handlers must run inside `withTenantTransaction`. Malformed or tenantless events go to DLQ ([ADR-024](../decisions/ADR-024-event-processing-idempotency.md)).

## Pipeline proof events

After enabling worker, these types should traverse end to end:

- `platform.tenant.created.v1`
- `platform.user_invitation.created.v1`
- `platform.membership.activated.v1`
- `platform.subscription.changed.v1`
- `platform.feature.changed.v1`

## Prevention

- API must never call EventBridge directly; outbox only.
- Keep worker at 0 in development except during explicit tests.
- Monitor ECS crash loop, queue backlog, and EventBridge failure alarms.

## References

- [queue-dlq-runbook.md](./queue-dlq-runbook.md)
- [platform-events-v1.md](../api/platform-events-v1.md)
- [development-cost-control.md](./development-cost-control.md)
