# MK-S3 Plan — Membership / Tenant Context

## Objective

Make user ↔ tenant membership the authoritative gate for tenant switching and session tenant context. Client-selected tenants must always be verified server-side against an ACTIVE membership.

## Current State

- ADR-021 `user_tenant_memberships` is authoritative; statuses: PENDING, ACTIVE, SUSPENDED, EXPIRED, REVOKED, ARCHIVED.
- `MembershipsService` already supports activate/suspend/revoke transitions.
- `AuthContextService.selectTenant` verifies ACTIVE membership + tenant session eligibility (MK-S2).
- SaaS vocabulary pending/active/inactive/removed maps onto PENDING/ACTIVE/SUSPENDED/REVOKED (no schema rename — user choice).

## Reuse

- `user_tenant_memberships` + membership history projection
- `MembershipsService` lifecycle methods
- `POST /api/v1/auth/select-tenant`
- `@forge/web-kit` active tenant storage

## Changes Required

1. Document + encode SaaS↔Forge membership status mapping in `@forge/contracts`.
2. Export helpers: `isMembershipStatusActive`, `resolveMembershipStatusAlias`.
3. Harden `selectTenant` tests for non-member / suspended / revoked.
4. Ensure tenant switch replaces client `me` (no stale permissions) and clears persisted tenant on failure.
5. Unit tests: single-tenant, multi-tenant, inactive, removed, non-member.

## Files Expected

```text
docs/forge-saas-foundation/sprints/MK-S3-PLAN.md
docs/forge-saas-foundation/sprints/MK-S3-COMPLETE.md
docs/forge-saas-foundation/MEMBERSHIPS.md
packages/contracts/src/membership-domain.ts (+ tests)
packages/contracts/src/index.ts (exports)
apps/platform-api/.../auth-context.select-tenant.test.ts
packages/web-kit/src/auth-provider.tsx (switch clear on failure)
packages/web-kit/src/auth-provider.switch.test.tsx (or existing test file)
```

## Database Changes

None (map onto existing statuses).

## Security Impact

- Explicit rejection of inactive/removed memberships on tenant switch
- Client must not retain stale tenantId after failed switch

## Tests Required

- one user / one tenant selectable
- one user / multiple tenants
- non-member selection fails
- inactive (SUSPENDED) fails
- removed (REVOKED) fails
- switch replaces session summary (no stale tenantId)

## Out of Scope

- Invitation UX (MK-S6)
- Custom RBAC (MK-S4)
- Production mutations

## Risks

- Dual `user_tenant_access` projection drift — document HARDEN note; no third model.
