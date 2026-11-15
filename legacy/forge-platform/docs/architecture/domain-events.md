# Domain Events and Outbox

**Sprint:** 1D  
**Related ADR:** [ADR-016](../decisions/ADR-016-outbox-pattern.md)

## Pattern

Transactional outbox ([ADR-016](../decisions/ADR-016-outbox-pattern.md)):

1. Domain mutation and `outbox_events` insert share one DB transaction.
2. Request handlers **never** call EventBridge directly.
3. `worker-service` claims pending rows and publishes to EventBridge.
4. Delivery is at-least-once; consumers must be idempotent (key on event `id`).

## Event envelope

Defined in `@forge/events` as `ForgeDomainEvent`:

| Field                           | Purpose                                                   |
| ------------------------------- | --------------------------------------------------------- |
| `id`                            | Stable event id                                           |
| `type`                          | Versioned type string (e.g. `platform.person.created.v1`) |
| `version`                       | Envelope version (default 1)                              |
| `occurredAt`                    | ISO timestamp                                             |
| `tenantId` / `actorUserId`      | Context (tenant may be null for platform-global)          |
| `aggregateType` / `aggregateId` | Source aggregate                                          |
| `correlationId` / `causationId` | Trace linkage                                             |
| `payload`                       | JSON; must not include sensitive fields                   |

`assertSafeEventPayload` rejects payloads that look like they contain `ssn`, `password`, `token`, or `secret` keys.

## Typed catalog (Sprint 1D)

`DOMAIN_EVENT_TYPES` in `packages/events/src/index.ts`:

- Tenant: created, activated, suspended, archived
- Organization: created, updated
- Person: created, updated, merged, archived
- User: invited, activated, disabled
- Role: assigned, revoked
- Entitlement / subscription / feature / configuration: changed

## Worker behavior

Documented in [outbox-worker.md](../operations/outbox-worker.md):

- Claim up to 25 `PENDING` rows (`FOR UPDATE SKIP LOCKED`)
- Publish → `PUBLISHED` + `event_delivery_log`
- Retry with backoff; after 10 attempts → `FAILED`
- Poll interval ~2s when `APP_ENV` is set

## Local development

```bash
pnpm --filter @forge/platform-api dev
pnpm --filter @forge/worker-service dev
```

Development ECS desired count may be zero; run the worker locally against the same database for integration tests. Event bus name defaults to `forge-platform` (`EVENT_BUS_NAME` / `EVENTBRIDGE_BUS_NAME`).

## Consumer guidance

- Treat EventBridge as at-least-once.
- Deduplicate on `id`.
- Do not put ciphertext or plaintext sensitive attributes in payloads; emit references only.
