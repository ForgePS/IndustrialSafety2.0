# Authentication & Sessions (MK-S2)

## Identity provider

**REUSE Amazon Cognito** — do not introduce a parallel IdP.

| Concern              | Implementation                                                 |
| -------------------- | -------------------------------------------------------------- |
| Sign-in              | Cognito Hosted UI + PKCE (`@forge/web-kit`)                    |
| Sign-out             | Frontend token clear + `POST /api/v1/auth/logout-all`          |
| Token validation     | `@forge/auth` JWKS verify + claim audience/client checks       |
| Session context      | `AuthContextService.resolvePrincipal` (server-side)            |
| Disabled account     | Identity / user `DISABLED` → `FORBIDDEN`                       |
| Session invalidation | `users.sessions_revoked_at` + `session_version` vs token `iat` |
| Password recovery    | Cognito `AccountRecovery.EMAIL_ONLY`                           |
| Email verification   | Cognito `autoVerify.email`                                     |
| MFA                  | Cognito `Mfa.OPTIONAL` (architecture present; policy is ops)   |

## Authoritative rule

Frontend auth state never authorizes protected APIs. Global Nest `AuthGuard` resolves a `ForgePrincipal` before controllers run (except `@Public()`).

Resolved session fields:

```text
userId
authenticationIdentityId
tenantId (active / requested)
tenant candidates (via GET /auth/me → tenants[])
active membership (status ACTIVE)
permissions / products / modules (loaded for context; RBAC deepening is MK-S4)
```

## Tenant session eligibility

Uses `evaluateTenantOperationalState(...).canAuthenticate`:

- Allowed: `PROVISIONING`, `TRIAL`, `ACTIVE`, `SUSPENDED`
- Denied: `ARCHIVED`, `CANCELED`, legacy `DECOMMISSIONED`

Product use remains gated separately by subscription + entitlements.

## Client allowlist

`COGNITO_CLIENT_ID` may be a comma-separated list of allowed app clients. Industrial Cognito client export gap remains **BACKLOG-001**.

## Security tests (MK-S2)

- Missing bearer rejected
- Invalid/expired JWT rejected
- Disabled user rejected
- Revoked session rejected
- `AuthGuard` unauthorized on protected routes
- Claim audience / subject / token_use validation
