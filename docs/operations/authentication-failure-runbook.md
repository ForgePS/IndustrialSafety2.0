# Authentication Failure Runbook

**Sprint:** 1E  
**Scope:** Cognito access tokens, identity resolution, session guards, membership access  
**Related:** [ADR-029](../decisions/ADR-029-identity-resolution-without-rls-bypass.md), [platform-errors-v1.md](../api/platform-errors-v1.md)

## Symptoms

- `401 UNAUTHORIZED` on `/api/v1/auth/me` or tenant routes
- `403 FORBIDDEN` with "Membership is not active" or "No active access"
- Creator Console login loop or empty tenant list
- Spike in auth failure CloudWatch alarm (Sprint 1E Wave 6)

## Architecture reminder

1. Bearer token verified against Cognito user pool.
2. Subject mapped through `forge_lookup_identity` (SECURITY DEFINER, `forge_identity_lookup` owner).
3. Tenant access verified via `user_tenant_memberships` (ACTIVE) or platform admin bypass.
4. Session guards: `users.session_version`, `users.sessions_revoked_at`, membership suspension bumps.
5. **Cognito groups are not authorization.** Permission codes come from roles and memberships.

`forge_app` never bypasses RLS on direct table reads.

## Triage checklist

| Step | Action                                                                            |
| ---- | --------------------------------------------------------------------------------- |
| 1    | Capture `requestId` and `correlationId` from the error body                       |
| 2    | Confirm environment: production-like envs reject `x-forge-dev-principal`          |
| 3    | Check token expiry and clock skew on client                                       |
| 4    | Verify Cognito app client id matches deployed `COGNITO_CLIENT_ID`                 |
| 5    | Query identity link: authentication_identities row for provider COGNITO + subject |
| 6    | Check user status (DISABLED?) and `sessions_revoked_at` vs token `iat`            |
| 7    | Check membership status for requested tenant (must be ACTIVE)                     |
| 8    | Check tenant status (ACTIVE for non-admin select-tenant)                          |

## Common causes and fixes

### Invalid or expired access token

**Error:** `UNAUTHORIZED` — "Invalid or expired access token"

**Fix:** Refresh tokens through Cognito hosted UI or client SDK. Confirm pool region and client id.

### Identity not linked

**Error:** `UNAUTHORIZED` — "Authentication identity is not linked"

**Fix:** User must accept an invitation (`POST /api/v1/auth/invitations/accept`) or complete admin provisioning. Identity links only at acceptance ([ADR-020](../decisions/ADR-020-invitation-lifecycle.md)).

### Session revoked (logout-all, disable, suspension)

**Error:** `UNAUTHORIZED` — "Session has been revoked"

**Fix:** User must sign in again. Expected after `POST /api/v1/auth/logout-all`, user disable, or membership suspension.

### No active membership

**Error:** `FORBIDDEN` — "No active membership for the selected tenant"

**Fix:** Activate membership (`POST .../memberships/:id/activate`) or create membership with `platform.membership.manage`. Check `user_tenant_access` legacy rows if migration incomplete.

### Wrong tenant in path

**Error:** `FORBIDDEN` — "No active access to the requested tenant"

**Fix:** Call `POST /api/v1/auth/select-tenant` or ensure `:tenantId` matches an ACTIVE membership. Platform admins may cross tenants when permitted.

### Dev principal misuse

**Error:** `UNAUTHORIZED` — "Missing Authorization or dev principal header"

**Fix:** Local/development/testing only: send valid JSON in `x-forge-dev-principal`. See [platform-bootstrap.md](../development/platform-bootstrap.md).

## Escalation

1. If identity lookup functions missing or owned by wrong role, inspect migration `0005_sprint_1e_identity_resolution.sql` and re-run migrate task.
2. If Cognito Admin API failures during invite/resend, check IAM task role and Cognito service quotas.
3. If widespread 401 after deploy, compare ECS task environment variables to Secrets Manager references.

## Prevention

- Monitor auth anomaly alarm and Cognito `SignIn`/`Token` error metrics.
- Audit membership suspensions and logout-all operations.
- Never grant `forge_app` RLS bypass; extend lookup functions instead ([ADR-029](../decisions/ADR-029-identity-resolution-without-rls-bypass.md)).

## References

- [tenant-access-runbook.md](./tenant-access-runbook.md)
- [authentication architecture](../architecture/identity-architecture.md)
