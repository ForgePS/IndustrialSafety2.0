# MK-S2 Plan — Authentication / Session Hardening

## Objective

Make Cognito-backed identity and session resolution authoritative and testable. Backend protected APIs must reject missing/invalid/revoked/disabled sessions without relying on frontend auth state.

## Current State

- Cognito User Pool + Hosted UI PKCE (`@forge/web-kit`) already handle sign-in / sign-out / recovery / optional MFA (CDK: `mfa: OPTIONAL`, email recovery).
- `AuthGuard` → `AuthContextService.resolvePrincipal` verifies JWT (JWKS), links identity, checks disabled users, revoked sessions, membership.
- Gaps: few dedicated security unit tests; tenant session gate still treats only `ACTIVE` as selectable (blocks MK-S1 `TRIAL`); industrial Cognito client allowlist remains BACKLOG-001.

## Reuse

- `@forge/auth` `verifyCognitoAccessToken`
- `AuthContextService` / `AuthGuard` / Cognito Hosted UI
- `evaluateTenantOperationalState` for tenant session eligibility

## Changes Required

1. Align tenant session selection with operational auth (allow TRIAL/PROVISIONING/SUSPENDED; deny ARCHIVED/CANCELED).
2. Add session security unit tests (missing/invalid/revoked/disabled).
3. Add `@forge/auth` token verification unit tests (audience, missing sub, token_use).
4. Document Cognito MFA / recovery as reused architecture (no IdP replacement).
5. Do not expand RBAC beyond session integration.

## Files Expected

```text
docs/forge-saas-foundation/sprints/MK-S2-PLAN.md
docs/forge-saas-foundation/sprints/MK-S2-COMPLETE.md
docs/forge-saas-foundation/AUTH_SESSIONS.md
apps/platform-api/src/modules/auth-context/auth-context.service.ts
apps/platform-api/src/modules/auth-context/auth-context.security.test.ts
apps/platform-api/src/modules/auth-context/auth.guard.test.ts
packages/auth/src/index.test.ts
```

## Database Changes

None.

## Security Impact

- Stronger tenant session eligibility
- Explicit regression tests for unauthorized access patterns
- No production Cognito/IAM changes

## Tests Required

- missing token rejected
- invalid token rejected
- revoked/expired session rejected
- disabled user rejected
- protected route unauthorized (AuthGuard)
- Cognito claim validation helpers

## Out of Scope

- RBAC rewrite (MK-S4)
- Membership UX beyond select-tenant hardening (MK-S3)
- Industrial Cognito client CDK gap (BACKLOG-001)
- Deploy / production Cognito mutation

## Risks

- Over-opening TRIAL/PROVISIONING sessions — mitigated by operational state rules already used for product gates.
