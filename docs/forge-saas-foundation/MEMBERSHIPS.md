# Memberships & Tenant Context (MK-S3)

## Authoritative model

**Canonical table:** `user_tenant_memberships` (ADR-021)  
Compatibility projection `user_tenant_access` remains dual-written — do not invent a third model.

| Field         | Column                        |
| ------------- | ----------------------------- |
| membershipId  | `id`                          |
| userId        | `user_id`                     |
| tenantId      | `tenant_id`                   |
| status        | `status`                      |
| createdAt     | `created_at`                  |
| updatedAt     | `updated_at`                  |
| joinedAt      | `activated_at` (when ACTIVE)  |
| deactivatedAt | `suspended_at` / `revoked_at` |

## Status mapping (SaaS vocabulary → Forge)

| SaaS     | Forge (stored) | Tenant selectable                |
| -------- | -------------- | -------------------------------- |
| pending  | `PENDING`      | No                               |
| active   | `ACTIVE`       | Yes (if tenant session-eligible) |
| inactive | `SUSPENDED`    | No                               |
| removed  | `REVOKED`      | No                               |

Also present: `EXPIRED`, `ARCHIVED` (ADR-021 terminals).

Helpers: `@forge/contracts` `resolveMembershipStatusAlias`, `isMembershipStatusActive`.

## Tenant switching

1. Client calls `POST /api/v1/auth/select-tenant` with `{ tenantId }`.
2. Server requires ACTIVE membership (or platform admin) + tenant session eligibility (MK-S2).
3. Response is a full AuthMe summary for the new tenant.
4. `@forge/web-kit` `switchActiveTenant` replaces client `me` and rolls back persisted tenant id on failure.

Client-provided `x-tenant-id` is never trusted without the same membership gate in `resolvePrincipal`.
