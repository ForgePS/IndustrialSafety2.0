# Platform API Errors v1

**Sprint:** 1E  
**Source:** `@forge/errors` (`packages/errors/src/index.ts`)

All error responses use the same JSON envelope:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Human-readable summary",
    "details": [],
    "requestId": "…",
    "correlationId": "…"
  }
}
```

Types: `@forge/contracts` `ApiErrorBody`.

## Error codes and HTTP status

| Code                      | HTTP | When                                                                                            |
| ------------------------- | ---: | ----------------------------------------------------------------------------------------------- |
| `BAD_REQUEST`             |  400 | Malformed input, invalid headers (for example malformed `If-Match`), idempotency key too long   |
| `VALIDATION_FAILED`       |  400 | Schema validation failure (Zod)                                                                 |
| `UNAUTHORIZED`            |  401 | Missing or invalid token, unlinked identity, revoked session                                    |
| `FORBIDDEN`               |  403 | Missing permission, disabled user, inactive membership, cross-tenant access                     |
| `TENANT_SUSPENDED`        |  403 | Tenant suspended; writes blocked                                                                |
| `TENANT_INACTIVE`         |  403 | Tenant not active (for example during select-tenant)                                            |
| `SUBSCRIPTION_INACTIVE`   |  403 | Subscription state blocks the operation                                                         |
| `ENTITLEMENT_REQUIRED`    |  403 | Required product or module not entitled                                                         |
| `NOT_FOUND`               |  404 | Resource absent in tenant scope                                                                 |
| `CONFLICT`                |  409 | Business rule conflict (duplicate, illegal state transition)                                    |
| `IDEMPOTENCY_CONFLICT`    |  409 | Same `Idempotency-Key` reused with a different body                                             |
| `IDEMPOTENCY_IN_PROGRESS` |  409 | Identical idempotent request still processing                                                   |
| `PRECONDITION_FAILED`     |  412 | Stale `If-Match` / `record_version` ([ADR-023](../decisions/ADR-023-optimistic-concurrency.md)) |
| `PRECONDITION_REQUIRED`   |  428 | `If-Match` required but absent on unsafe update                                                 |
| `RATE_LIMITED`            |  429 | Throttling (reserved for future edge limits)                                                    |
| `INTERNAL_ERROR`          |  500 | Unexpected server failure                                                                       |

Default status mapping is implemented in `defaultStatus()` in `@forge/errors`. Handlers may override `statusCode` on `ForgeError` construction; clients should treat the response status as authoritative.

## Common scenarios

### Authentication

| Situation                                 | Code           |
| ----------------------------------------- | -------------- |
| No Bearer token in production             | `UNAUTHORIZED` |
| Expired or invalid Cognito token          | `UNAUTHORIZED` |
| Cognito subject not linked to Forge user  | `UNAUTHORIZED` |
| Token issued before `sessions_revoked_at` | `UNAUTHORIZED` |
| Disabled user                             | `FORBIDDEN`    |
| No active membership for tenant           | `FORBIDDEN`    |

Identity bootstrap uses SECURITY DEFINER functions ([ADR-029](../decisions/ADR-029-identity-resolution-without-rls-bypass.md)); failures surface as `UNAUTHORIZED` or `FORBIDDEN`, never as partial data from another tenant.

### Authorization

Permission checks use `@RequirePermission('platform.…')`. Missing permission → `FORBIDDEN`. Explicit DENY role effects win over allows ([ADR-015](../decisions/ADR-015-permission-based-authorization.md)).

Cognito groups are **not** evaluated for API authorization.

### Idempotency (ADR-022)

| Situation                    | Code                      | Header                       |
| ---------------------------- | ------------------------- | ---------------------------- |
| Required key missing         | `BAD_REQUEST`             |                              |
| Key too long (>255)          | `BAD_REQUEST`             |                              |
| Body hash mismatch on replay | `IDEMPOTENCY_CONFLICT`    |                              |
| Concurrent duplicate         | `IDEMPOTENCY_IN_PROGRESS` |                              |
| Successful replay            | (success status)          | `Idempotency-Replayed: true` |

### Optimistic concurrency (ADR-023)

| Situation                                        | Code                    | Details                                                          |
| ------------------------------------------------ | ----------------------- | ---------------------------------------------------------------- |
| `If-Match` missing on PATCH/PUT/state transition | `PRECONDITION_REQUIRED` |                                                                  |
| Malformed ETag                                   | `BAD_REQUEST`           |                                                                  |
| Version mismatch                                 | `PRECONDITION_FAILED`   | `resourceType`, `resourceId`, `expectedVersion`, `actualVersion` |

Conflict messages intentionally omit field values.

### Tenant operational state (ADR-019)

Subscription and tenant lifecycle may map to `TENANT_SUSPENDED`, `TENANT_INACTIVE`, or `SUBSCRIPTION_INACTIVE` instead of generic `FORBIDDEN` so clients can branch on recovery UX.

## Client guidance

1. Log `requestId` and `correlationId` on every error; include them in support tickets.
2. On `412`, re-fetch the resource (read ETag) and retry the mutation.
3. On `409 IDEMPOTENCY_IN_PROGRESS`, backoff and retry with the same key and body.
4. Do not parse `message` for branching logic; use `code` and structured `details`.
5. Treat `5xx` as retryable with exponential backoff unless the operation is not idempotent and no idempotency key was sent.

## Implementation

API layer: `ForgeError` thrown from services and guards; global exception filter maps to `fail()` in `apps/platform-api/src/common/api-response.ts`.
