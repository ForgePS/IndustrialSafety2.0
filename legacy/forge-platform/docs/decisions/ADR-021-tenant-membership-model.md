# ADR-021: Tenant membership as the access-granting aggregate

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1E

## Context

Sprint 1D recorded a user's tie to a tenant in `user_tenant_access`, a flat table with no lifecycle, no history, and no clear scoping of roles, products, and modules. As invitations, suspension, and onboarding mature, we need one authoritative aggregate that owns the full lifecycle of a user's access and that cannot grant more than the tenant is entitled to.

## Decision

**`user_tenant_memberships` is the authoritative access record; only ACTIVE grants access.**

1. `user_tenant_memberships` replaces `user_tenant_access` as the authoritative record of a user's access to a tenant, with statuses PENDING, ACTIVE, SUSPENDED, EXPIRED, REVOKED, and ARCHIVED. Only ACTIVE grants access.
2. Child tables `membership_role_assignments`, `membership_product_access`, and `membership_module_access` scope roles, products, and modules per membership.
3. `membership_history` is an append-only transition log.
4. Product and module grants are intersected with tenant entitlements at authorization time, so a membership can never exceed what the tenant is entitled to.
5. Tenant admins cannot grant permissions they do not themselves hold, and cannot grant any `PLATFORM`-scoped role.
6. `user_tenant_access` is retained but demoted to a compatibility projection maintained by the membership service.

## Consequences

- One clear place to suspend or revoke access, rather than scattered flags.
- History is preserved rather than deleted, giving an auditable record of every access change.
- During the transition a second write path (the `user_tenant_access` projection) must be kept in sync, adding maintenance cost until callers migrate off it.
- Cross-tenant assignment is blocked at both the API layer and RLS (see ADR-014), so a membership cannot reference a foreign tenant even if application checks are bypassed.
- Intersecting grants with tenant entitlements means membership permissions shrink automatically when a tenant loses an entitlement.
