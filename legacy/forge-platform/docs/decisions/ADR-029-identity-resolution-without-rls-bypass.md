# ADR-029: Identity resolution without RLS bypass

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1E

## Context

Every authenticated API request must resolve a Cognito bearer token to a Forge user and tenant before `SET LOCAL app.current_tenant_id` can run. That first lookup is inherently tenant-agnostic: the token carries a provider subject, not a tenant UUID. Granting `forge_app` a blanket RLS bypass would let a compromised or misconfigured request read any tenant's routing data. We need a narrow, auditable path for bootstrap reads that never elevates the application role to superuser or bypass.

## Decision

**Tenant-agnostic routing reads use SECURITY DEFINER functions owned by a dedicated `forge_identity_lookup` role; `forge_app` receives EXECUTE only.**

1. A NOLOGIN role `forge_identity_lookup` holds SELECT-only RLS policies on the routing columns of `tenants`, `users`, `authentication_identities`, `user_invitations`, `user_tenant_memberships`, and `user_tenant_access`. Policies apply only to that role, so `forge_app` remains subject to normal tenant RLS on direct table access.
2. Three STABLE SECURITY DEFINER functions, owned by `forge_identity_lookup`, expose the minimum columns needed for auth bootstrap:
   - `forge_lookup_identity(provider, subject)` — maps an IdP subject to user id, home tenant id, user status, `session_version`, and `sessions_revoked_at`.
   - `forge_lookup_invitation(token_hash)` — maps a hashed invitation token to invitation id, tenant id, status, and expiry (no token material returned).
   - `forge_lookup_user_tenants(user_id)` — lists tenants the user may select, driven by `user_tenant_memberships` with a fallback to the legacy `user_tenant_access` projection for unmigrated rows.
3. `forge_app` is granted EXECUTE on these functions and is never granted membership in `forge_identity_lookup`.
4. Session invalidation uses `users.session_version` (monotonic counter) and `users.sessions_revoked_at` (instant cutoff). Access tokens whose `iat` predates either guard are refused. Both fields bump on logout-all, account disablement, and membership suspension (see ADR-021).
5. After identity resolution, all profile and domain reads run inside `withTenantTransaction` under normal RLS (see ADR-014).

## Consequences

- Auth bootstrap works without disabling RLS globally or granting `forge_app` cross-tenant SELECT on protected tables.
- The attack surface is bounded to three functions returning routing columns only; profile and domain data still require a tenant-scoped transaction.
- Function ownership and `REVOKE ALL FROM PUBLIC` must be preserved in every migration that touches these objects; accidental ownership drift to `forge_app` would widen privilege.
- `user_tenant_access` remains readable through `forge_lookup_user_tenants` until all callers migrate to memberships; the projection can be retired once migration is complete.
- Session guards are checked on every authenticated request, so forced sign-out after disablement or suspension takes effect without waiting for token expiry.
