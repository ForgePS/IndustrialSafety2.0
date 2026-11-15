# Outbox worker

The worker service polls `outbox_events` and publishes pending domain events to Amazon EventBridge.

## Behavior

1. Claim up to 25 `PENDING` rows with `FOR UPDATE SKIP LOCKED`.
2. Publish each event to the EventBridge bus.
3. Mark rows `PUBLISHED` and append `event_delivery_log`.
4. On failure, retry with backoff; after 10 attempts mark `FAILED`.

Poll interval: **2 seconds** when `APP_ENV` is set.

## Configuration

| Variable                                   | Required | Description                         |
| ------------------------------------------ | -------- | ----------------------------------- |
| `DATABASE_URL`                             | yes      | PostgreSQL connection string        |
| `AWS_REGION`                               | yes      | AWS region for EventBridge          |
| `EVENT_BUS_NAME` or `EVENTBRIDGE_BUS_NAME` | no       | Bus name (default `forge-platform`) |

## Local run

```bash
pnpm --filter @forge/worker-service dev
```

Development ECS desired count is often zero. Scale to one during integration tests, or run the worker locally against the shared development database.

## Notes

- API handlers must only write outbox rows in the same DB transaction as the business change.
- Consumers should treat EventBridge delivery as at-least-once and key on event `id`.
