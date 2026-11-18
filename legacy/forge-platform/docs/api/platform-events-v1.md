# Platform Domain Events v1

**Sprint:** 1E  
**Source:** `@forge/events` (`packages/events/src/index.ts`)  
**Related:** [domain-events.md](../architecture/domain-events.md), [ADR-016](../decisions/ADR-016-outbox-pattern.md), [ADR-024](../decisions/ADR-024-event-processing-idempotency.md)

## Delivery model

1. API handlers insert domain rows and `outbox_events` in one transaction.
2. `worker-service` polls the outbox and publishes to Amazon EventBridge (`source = forge.platform`).
3. EventBridge routes matching events to the integration-events SQS queue.
4. Worker consumers insert `event_processing_records` before handler execution (dedup per handler + event id).
5. Delivery is **at-least-once**; consumers must deduplicate on event `id`.

See [outbox-worker.md](../operations/outbox-worker.md) and [queue-dlq-runbook.md](../operations/queue-dlq-runbook.md).

## Envelope

`ForgeDomainEvent<TPayload>`:

| Field           | Type              | Purpose                                  |
| --------------- | ----------------- | ---------------------------------------- |
| `id`            | string (UUID)     | Stable idempotency key for consumers     |
| `type`          | string            | Versioned type (suffix `.vN`)            |
| `version`       | number            | Envelope version (default 1)             |
| `occurredAt`    | string (ISO-8601) | When the domain change occurred          |
| `tenantId`      | string \| null    | Tenant context; null for platform-global |
| `actorUserId`   | string \| null    | Acting user when known                   |
| `aggregateType` | string            | Source aggregate name                    |
| `aggregateId`   | string            | Source aggregate id                      |
| `correlationId` | string            | Trace linkage to API request             |
| `causationId`   | string \| null    | Parent event id when applicable          |
| `payload`       | object            | Domain-specific JSON                     |

Factory: `createDomainEvent()` in `@forge/events`.

Safety: `assertSafeEventPayload()` rejects payloads containing keys resembling `ssn`, `password`, `token`, or `secret`.

## Event type catalog

Types are versioned independently of the HTTP API ([ADR-028](../decisions/ADR-028-platform-api-versioning.md)).

### Tenant

| Constant           | Type string                    |
| ------------------ | ------------------------------ |
| `TENANT_CREATED`   | `platform.tenant.created.v1`   |
| `TENANT_ACTIVATED` | `platform.tenant.activated.v1` |
| `TENANT_SUSPENDED` | `platform.tenant.suspended.v1` |
| `TENANT_ARCHIVED`  | `platform.tenant.archived.v1`  |

### Organization

| Constant               | Type string                        |
| ---------------------- | ---------------------------------- |
| `ORGANIZATION_CREATED` | `platform.organization.created.v1` |
| `ORGANIZATION_UPDATED` | `platform.organization.updated.v1` |

### Person

| Constant          | Type string                   |
| ----------------- | ----------------------------- |
| `PERSON_CREATED`  | `platform.person.created.v1`  |
| `PERSON_UPDATED`  | `platform.person.updated.v1`  |
| `PERSON_MERGED`   | `platform.person.merged.v1`   |
| `PERSON_ARCHIVED` | `platform.person.archived.v1` |

### User (legacy invite flow)

| Constant         | Type string                  |
| ---------------- | ---------------------------- |
| `USER_INVITED`   | `platform.user.invited.v1`   |
| `USER_ACTIVATED` | `platform.user.activated.v1` |
| `USER_DISABLED`  | `platform.user.disabled.v1`  |

### User invitation (Sprint 1E, ADR-020)

| Constant                   | Type string                            |
| -------------------------- | -------------------------------------- |
| `USER_INVITATION_CREATED`  | `platform.user_invitation.created.v1`  |
| `USER_INVITATION_SENT`     | `platform.user_invitation.sent.v1`     |
| `USER_INVITATION_ACCEPTED` | `platform.user_invitation.accepted.v1` |
| `USER_INVITATION_REVOKED`  | `platform.user_invitation.revoked.v1`  |
| `USER_INVITATION_EXPIRED`  | `platform.user_invitation.expired.v1`  |
| `USER_INVITATION_FAILED`   | `platform.user_invitation.failed.v1`   |

### Membership (Sprint 1E, ADR-021)

| Constant                   | Type string                            |
| -------------------------- | -------------------------------------- |
| `MEMBERSHIP_CREATED`       | `platform.membership.created.v1`       |
| `MEMBERSHIP_ACTIVATED`     | `platform.membership.activated.v1`     |
| `MEMBERSHIP_SUSPENDED`     | `platform.membership.suspended.v1`     |
| `MEMBERSHIP_REVOKED`       | `platform.membership.revoked.v1`       |
| `MEMBERSHIP_ROLES_CHANGED` | `platform.membership.roles_changed.v1` |

### Entitlement, subscription, feature, configuration

| Constant                | Type string                         |
| ----------------------- | ----------------------------------- |
| `ENTITLEMENT_CHANGED`   | `platform.entitlement.changed.v1`   |
| `SUBSCRIPTION_CHANGED`  | `platform.subscription.changed.v1`  |
| `FEATURE_CHANGED`       | `platform.feature.changed.v1`       |
| `CONFIGURATION_CHANGED` | `platform.configuration.changed.v1` |

### Role

| Constant        | Type string                 |
| --------------- | --------------------------- |
| `ROLE_ASSIGNED` | `platform.role.assigned.v1` |
| `ROLE_REVOKED`  | `platform.role.revoked.v1`  |

### Onboarding (Sprint 1E, ADR-027)

| Constant               | Type string                        |
| ---------------------- | ---------------------------------- |
| `ONBOARDING_COMPLETED` | `platform.onboarding.completed.v1` |

## Pipeline proof set

Sprint 1E end-to-end proof asserts these types traverse API → outbox → EventBridge → SQS → worker:

- `platform.tenant.created.v1`
- `platform.user_invitation.created.v1`
- `platform.membership.activated.v1`
- `platform.subscription.changed.v1`
- `platform.feature.changed.v1`

Defined as `PIPELINE_PROOF_EVENT_TYPES` in `@forge/events`.

## Consumer requirements

1. **Idempotent handlers:** insert or upsert on `(handler_name, event_id)` before side effects ([ADR-024](../decisions/ADR-024-event-processing-idempotency.md)).
2. **Tenant context:** handlers that mutate tenant data run inside `withTenantTransaction`; reject tenantless or malformed events to DLQ.
3. **No sensitive payloads:** store references (ids, codes), not secrets or ciphertext.
4. **Correlation:** propagate `correlationId` into downstream logs and emitted events (`causationId` = parent `id`).
5. **Open enums:** new event types may be added within v1 as additive catalog entries; unknown types should be logged and skipped or dead-lettered per handler policy.

## EventBridge routing

Rule pattern (development):

- `source`: `forge.platform`
- Target: integration-events SQS queue
- DLQ after max receive count exceeded

Bus name defaults to `forge-platform` (`EVENT_BUS_NAME` / `EVENTBRIDGE_BUS_NAME`).

## Versioning

Event type strings carry an explicit `.vN` suffix. Breaking payload changes require a new type string (for example `.v2`), not an HTTP `/api/v2` bump. See [platform-versioning-policy.md](./platform-versioning-policy.md).
