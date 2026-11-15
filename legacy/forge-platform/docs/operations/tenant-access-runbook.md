# Tenant Access Runbook

**Sprint:** 1E  
**Scope:** Membership lifecycle, tenant selection, RLS context, subscription blocks  
**Related:** [ADR-021](../decisions/ADR-021-tenant-membership-model.md), [multi-tenancy.md](../architecture/multi-tenancy.md)

## Symptoms

- User cannot select tenant (`403 TENANT_INACTIVE` or membership errors)
- API returns data from wrong tenant (critical — treat as security incident)
- Writes blocked with `TENANT_SUSPENDED` or `SUBSCRIPTION_INACTIVE`
- User sees tenant in list but `selectable: false` on `/api/v1/auth/me`

## Access model

| Layer          | Rule                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| Membership     | Only `ACTIVE` grants access ([ADR-021](../decisions/ADR-021-tenant-membership-model.md)) |
| Tenant status  | Tenant must be `ACTIVE` for normal users                                                 |
| Subscription   | Writable states: `ACTIVE`, `PAYMENT_DUE`, `GRACE_PERIOD`                                 |
| Entitlements   | Membership product/module access intersected with tenant entitlements                    |
| RLS            | `SET LOCAL app.current_tenant_id` on every tenant transaction                            |
| Platform admin | May bypass some operational blocks; still uses tenant context for data                   |

## Triage checklist

| Step | Action                                                         |
| ---- | -------------------------------------------------------------- |
| 1    | `GET /api/v1/auth/me` — inspect `tenants[]` and `selectable`   |
| 2    | `GET /api/v1/tenants/:tenantId/memberships?userId=<uuid>`      |
| 3    | Check membership status and history (`.../history`)            |
| 4    | Check tenant status (`GET /api/v1/platform/tenants/:tenantId`) |
| 5    | Check current subscription (`GET .../subscriptions/current`)   |
| 6    | Verify `:tenantId` in URL matches selected tenant              |

## Procedures

### Grant access to existing user

1. Create membership: `POST /api/v1/tenants/:tenantId/memberships` with `Idempotency-Key`.
2. Assign roles: `PUT .../memberships/:id/roles`.
3. Scope products if needed: `PUT .../memberships/:id/products`.
4. Activate: `POST .../memberships/:id/activate` with current `If-Match` ETag.

### Suspend access (offboarding)

1. `POST .../memberships/:id/suspend` with reason body and `If-Match`.
2. Confirm user receives `403` on next request; session may be invalidated.
3. Audit entry and `platform.membership.suspended.v1` event should exist.

### Restore access

1. Resolve underlying issue (payment, policy).
2. `POST .../memberships/:id/activate` with fresh ETag.
3. User re-authenticates or calls `select-tenant`.

### Multi-tenant user cannot switch

1. Confirm target membership is `ACTIVE` and tenant is `ACTIVE`.
2. `POST /api/v1/auth/select-tenant` with `{ "tenantId": "..." }`.
3. Subsequent requests must use the new tenant in path or dev principal.

## Suspected isolation breach

**Stop and escalate immediately.**

1. Capture `requestId`, tenant ids, user id, endpoint, timestamp.
2. Do not modify data until RLS integration tests are re-run (`pnpm test:rls`).
3. Review recent migrations for RLS policy or `forge_identity_lookup` ownership changes.
4. Confirm no grant of BYPASSRLS to `forge_app`.

## Subscription read-only mode

When subscription is `READ_ONLY`, `SUSPENDED`, or `TERMINATED`:

- Reads may still work per [ADR-019](../decisions/ADR-019-tenant-subscription-shutdown.md)
- Writes return `SUBSCRIPTION_INACTIVE` or `FORBIDDEN`
- Use `allowWhenSuspended` endpoints only for billing/admin recovery

## References

- [authentication-failure-runbook.md](./authentication-failure-runbook.md)
- [tenant isolation](../security/tenant-isolation.md)
- [platform-permissions-v1.md](../api/platform-permissions-v1.md)
