# Platform API Contract v1

**Sprint:** 1E (frozen at Wave 9)  
**Base path:** `/api/v1`  
**App:** `apps/platform-api`  
**Machine-readable:** [platform-openapi-v1.yaml](./platform-openapi-v1.yaml)

Related contract documents:

| Document                                                         | Scope                             |
| ---------------------------------------------------------------- | --------------------------------- |
| [platform-events-v1.md](./platform-events-v1.md)                 | Domain event envelope and catalog |
| [platform-permissions-v1.md](./platform-permissions-v1.md)       | Permission codes and evaluation   |
| [platform-errors-v1.md](./platform-errors-v1.md)                 | Error envelope and HTTP mapping   |
| [platform-versioning-policy.md](./platform-versioning-policy.md) | v1 freeze and v2 policy           |

Health endpoints (outside `/api/v1`): `GET /health`, `GET /ready`.

## Authentication and identity

### Bearer token (production)

Send `Authorization: Bearer <Cognito access token>` on every authenticated request.

Identity resolution uses SECURITY DEFINER lookup functions owned by `forge_identity_lookup` ([ADR-029](../decisions/ADR-029-identity-resolution-without-rls-bypass.md)). The application role `forge_app` does not bypass RLS on direct table access; bootstrap reads go through:

- `forge_lookup_identity(provider, subject)`
- `forge_lookup_invitation(token_hash)`
- `forge_lookup_user_tenants(user_id)`

Session invalidation uses `users.session_version` and `users.sessions_revoked_at`. Tokens issued before either guard are refused.

### Local and development principal

In `local`, `development`, and `testing` environments only, omit Bearer auth and send:

```http
x-forge-dev-principal: {"userId":"<uuid>","tenantId":"<uuid>"}
```

See [platform-bootstrap.md](../development/platform-bootstrap.md).

### Cognito groups are not authorization

Amazon Cognito groups may exist for pool administration, but **authorization is permission-based** ([ADR-015](../decisions/ADR-015-permission-based-authorization.md)). Effective access comes from tenant roles, membership grants, and `ForgePrincipal.permissions`. Do not infer API access from Cognito group membership.

### Auth context endpoints

| Method | Path                         | Auth                    | Notes                                             |
| ------ | ---------------------------- | ----------------------- | ------------------------------------------------- |
| GET    | `/api/v1/auth/me`            | Bearer or dev principal | Current principal summary plus selectable tenants |
| POST   | `/api/v1/auth/select-tenant` | Bearer or dev principal | Body: `{ "tenantId": "<uuid>" }`                  |
| POST   | `/api/v1/auth/logout-all`    | Bearer or dev principal | Revokes all sessions; bumps `session_version`     |

### Invitations (ADR-020)

Base: `/api/v1/auth/invitations`

| Method | Path                    | Permission                   | Idempotent |
| ------ | ----------------------- | ---------------------------- | ---------- |
| POST   | `/`                     | `platform.invitation.manage` | yes        |
| GET    | `/`                     | `platform.invitation.read`   |            |
| GET    | `/:invitationId`        | `platform.invitation.read`   |            |
| POST   | `/accept`               | public                       |            |
| POST   | `/:invitationId/resend` | `platform.invitation.manage` |            |
| POST   | `/:invitationId/revoke` | `platform.invitation.manage` |            |

Query filters on list: `tenantId`, `status`, `email`. Token hash is never returned.

Legacy tenant-scoped invite: `POST /api/v1/tenants/:tenantId/users/invitations` (same idempotency resource type).

## Response envelope

Success:

```json
{
  "data": {},
  "meta": {
    "requestId": "…",
    "correlationId": "…",
    "page": 1,
    "pageSize": 25,
    "total": 100
  }
}
```

Error: see [platform-errors-v1.md](./platform-errors-v1.md).

Types: `@forge/contracts` (`ApiSuccess`, `ApiErrorBody`, `ApiMeta`).

## Cross-cutting conventions

### Correlation IDs

Every response includes `meta.requestId` and `meta.correlationId`. Clients may send `X-Request-Id`; the server echoes or generates IDs via `@forge/security`.

### Pagination

| Parameter  | Default | Max | Notes                  |
| ---------- | ------- | --- | ---------------------- |
| `page`     | 1       |     | 1-based                |
| `pageSize` | varies  | 200 | Audit list caps at 200 |

Many list endpoints currently return the full in-memory result set with `meta.page`, `meta.pageSize`, and `meta.total` reflecting the returned array. Cursor pagination may be added within v1 as an optional field without breaking existing clients.

### Filtering and sorting

Filtering is endpoint-specific query parameters (for example `status`, `email`, `userId`, `q` on persons). Sort order is server-defined unless documented on the endpoint; clients must not rely on implicit ordering for correctness.

### Idempotency (ADR-022)

Unsafe mutations marked `@Idempotent` accept an optional `Idempotency-Key` header (max 255 characters). When present:

- Same key + same body → replay stored response (`Idempotency-Replayed: true`)
- Same key + different body → `409 IDEMPOTENCY_CONFLICT`
- Same key while in flight → `409 IDEMPOTENCY_IN_PROGRESS`

Scope: tenant, user, HTTP method, route path, and key. Public routes skip idempotency persistence.

### Optimistic concurrency (ADR-023)

Concurrency-controlled resources expose integer `recordVersion` in JSON and weak ETag `W/"<recordVersion>"` on reads.

Updates and state transitions require `If-Match: W/"<recordVersion>"` or `If-Match: *`. Missing header → `428 PRECONDITION_REQUIRED`. Stale version → `412 PRECONDITION_FAILED`.

Initial coverage: tenants, organizations, persons, users, memberships, roles, entitlements, subscriptions, feature flags, configuration, branding.

### Tenant path enforcement

`:tenantId` in the path is enforced against the resolved principal and PostgreSQL RLS session GUC. Platform admins may operate across tenants where permitted.

## Domain resources

### Tenant

Base: `/api/v1/platform/tenants`

| Method | Path                  | Permission                |
| ------ | --------------------- | ------------------------- |
| POST   | `/`                   | `platform.tenant.create`  |
| GET    | `/`                   | `platform.tenant.read`    |
| GET    | `/:tenantId`          | `platform.tenant.read`    |
| PATCH  | `/:tenantId`          | `platform.tenant.update`  |
| POST   | `/:tenantId/activate` | `platform.tenant.update`  |
| POST   | `/:tenantId/suspend`  | `platform.tenant.suspend` |
| POST   | `/:tenantId/archive`  | `platform.tenant.update`  |

Create input: `createTenantInputSchema` in `@forge/contracts`.

### Organization

Base: `/api/v1/tenants/:tenantId/organizations`

CRUD plus `POST /:organizationId/archive`. Input: `createOrganizationInputSchema`.

### Person

Base: `/api/v1/tenants/:tenantId/persons`

Includes merge, archive, duplicate candidates, and sensitive identifier endpoints. Sensitive reads require `platform.sensitive_data.read`.

### User

Base: `/api/v1/tenants/:tenantId/users`

List, get, patch, disable, enable. Invitations also available under auth routes (see above).

### Membership (ADR-021)

Base: `/api/v1/tenants/:tenantId/memberships`

| Method  | Path                      | Notes                               |
| ------- | ------------------------- | ----------------------------------- |
| GET     | `/`                       | Filters: `status`, `userId`         |
| POST    | `/`                       | Idempotent create                   |
| GET     | `/:membershipId`          | ETag                                |
| PATCH   | `/:membershipId`          | If-Match required                   |
| POST    | `/:membershipId/activate` | If-Match                            |
| POST    | `/:membershipId/suspend`  | Body: `{ "reason": "…" }`, If-Match |
| POST    | `/:membershipId/revoke`   | Body: `{ "reason": "…" }`, If-Match |
| GET/PUT | `/:membershipId/roles`    | PUT requires If-Match               |
| GET/PUT | `/:membershipId/products` | PUT requires If-Match               |
| GET     | `/:membershipId/history`  | Lifecycle audit trail               |

Only `ACTIVE` membership grants tenant access (except platform admin bypass).

Statuses: `PENDING`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, `REVOKED`, `ARCHIVED`.

### Role and permission

| Method         | Path                                                        |
| -------------- | ----------------------------------------------------------- |
| GET            | `/api/v1/tenants/:tenantId/permissions`                     |
| POST/GET/PATCH | `/api/v1/tenants/:tenantId/roles`…                          |
| PUT            | `/api/v1/tenants/:tenantId/roles/:roleId/permissions`       |
| POST/DELETE    | `/api/v1/tenants/:tenantId/users/:userId/role-assignments`… |
| POST           | `/api/v1/authorization/check`                               |

Legacy `user_role_assignments` remain for unmigrated rows; new access should use membership role assignments.

### Product, module, entitlement

| Method | Path                                                        |
| ------ | ----------------------------------------------------------- |
| GET    | `/api/v1/platform/products`                                 |
| GET    | `/api/v1/platform/modules`                                  |
| GET    | `/api/v1/tenants/:tenantId/entitlements`                    |
| PUT    | `/api/v1/tenants/:tenantId/products/:productCode`           |
| PUT    | `/api/v1/tenants/:tenantId/modules/:moduleCode/entitlement` |
| POST   | `/api/v1/tenants/:tenantId/modules/:moduleCode/suspend`     |
| POST   | `/api/v1/tenants/:tenantId/modules/:moduleCode/activate`    |

### Subscription

Base: `/api/v1/tenants/:tenantId/subscriptions`

Statuses in `@forge/contracts`: `ACTIVE`, `PAYMENT_DUE`, `GRACE_PERIOD`, `READ_ONLY`, `SUSPENDED`, `TERMINATED`, `ARCHIVED`. Writable: `ACTIVE`, `PAYMENT_DUE`, `GRACE_PERIOD`.

### Feature flag

| Method | Path                                             |
| ------ | ------------------------------------------------ |
| GET    | `/api/v1/platform/features`                      |
| GET    | `/api/v1/tenants/:tenantId/features/effective`   |
| PUT    | `/api/v1/tenants/:tenantId/features/:featureKey` |
| DELETE | `/api/v1/tenants/:tenantId/features/:featureKey` |

Feature flags are operational toggles; product access is enforced through entitlements ([ADR-017](../decisions/ADR-017-feature-flags-vs-entitlements.md)).

### Configuration and branding

| Method  | Path                                                      |
| ------- | --------------------------------------------------------- |
| GET     | `/api/v1/tenants/:tenantId/configuration`                 |
| GET     | `/api/v1/tenants/:tenantId/configuration/:namespace`      |
| PUT     | `/api/v1/tenants/:tenantId/configuration/:namespace/:key` |
| GET/PUT | `/api/v1/tenants/:tenantId/branding`                      |

### Audit

Base: `/api/v1/tenants/:tenantId/audit-events`

Paginated list (`page`, `pageSize`), get by id, and `POST /export`.

## Customer onboarding (planned contract)

Schema and ADR are in place ([ADR-027](../decisions/ADR-027-customer-onboarding-sessions.md)). HTTP handlers and MK-S7 hardening (templates GET, default facility on activate, open-session activate bypass block) are live. The v1 contract targets:

| Method | Path                                                       | Permission                   |
| ------ | ---------------------------------------------------------- | ---------------------------- |
| GET    | `/api/v1/platform/onboarding/templates`                    | `platform.onboarding.manage` |
| POST   | `/api/v1/platform/onboarding/sessions`                     | `platform.onboarding.manage` |
| GET    | `/api/v1/platform/onboarding/sessions/:sessionId`          | `platform.onboarding.manage` |
| POST   | `/api/v1/platform/onboarding/sessions/:sessionId/steps`    | `platform.onboarding.manage` |
| POST   | `/api/v1/platform/onboarding/sessions/:sessionId/activate` | `platform.onboarding.manage` |

Eleven ordered steps from `@forge/contracts` `ONBOARDING_STEPS`. Starter templates: `INDUSTRIAL_STARTER`, `RMS_STARTER`, `ACADEMY_STARTER`. Activation is server-gated; the console cannot bypass checks.

CLI: `pnpm platform:onboard-tenant` (Wave 5).

## Events and audit side effects

Successful domain mutations enqueue outbox rows and audit records in the same database transaction ([ADR-016](../decisions/ADR-016-outbox-pattern.md)). Event catalog: [platform-events-v1.md](./platform-events-v1.md).

## Deployment context

### Edge TLS (ADR-025)

HTTPS (ACM, Route 53, ALB 443 listener, HTTP redirect) is implemented in CDK but **gated on** `domains.hostedZoneName`. Development may remain HTTP until DNS is delegated externally.

### Creator Console (ADR-026)

The Creator Console is a Next.js static export on CloudFront and a private S3 bucket with Origin Access Control. It calls this API from the browser; it holds no server-side secrets.

## AI Narrative Assistant (foundation)

Routes under `/api/v1/ai/*` (narratives CRUD actions, regenerate, accept, reject, partial-accept, history, quality-check, templates, usage, policies). Feature flags `ai.narrative.*` default false; stub provider only; human review required. Machine-readable: [ai-narrative-openapi.yaml](./ai-narrative-openapi.yaml). Architecture: [../ai/architecture.md](../ai/architecture.md). Phase 5 NOT AUTHORIZED; not enabled for Phase 4 synthetic tenant.

## Source of truth

| Concern                  | Package / path                                     |
| ------------------------ | -------------------------------------------------- |
| Request/response schemas | `packages/contracts`                               |
| Error codes              | `packages/errors`                                  |
| Domain events            | `packages/events`                                  |
| HTTP routes              | `apps/platform-api/src/modules/**/*.controller.ts` |
| Principal shape          | `packages/tenant-context`                          |
| AI narrative contracts   | `packages/ai-contracts`                            |

Prior sprint endpoint summary (superseded for detail): [platform-core-api.md](./platform-core-api.md).
