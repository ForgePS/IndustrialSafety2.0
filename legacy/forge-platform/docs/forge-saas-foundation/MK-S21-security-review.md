# MK-S21 Security Review — FORGE-SAAS-CORE

**Program:** FORGE-SAAS-CORE  
**Sprint:** MK-S21  
**Date:** 2026-08-11  
**Production operations:** NONE  
**Repair passes used:** 1

## Verdict

**PASS** after repair pass 1. All CRITICAL and HIGH findings from the red-team review are resolved in code (or reduced below HIGH with residual MEDIUM/INFO backlog). Cross-tenant path/RLS, invitations, session revoke, and branding ownership remain defended.

Severity scale: CRITICAL | HIGH | MEDIUM | LOW | INFO

---

## Attack-vector scorecard (post-repair)

| #   | Vector                       | Status                 | Severity (residual) |
| --- | ---------------------------- | ---------------------- | ------------------- |
| 1   | Cross-tenant read            | DEFENDED               | INFO                |
| 2   | Cross-tenant write           | DEFENDED               | INFO                |
| 3   | URL tenant substitution      | DEFENDED               | INFO                |
| 4   | Body tenant substitution     | DEFENDED               | INFO                |
| 5   | Facility substitution        | PARTIAL                | MEDIUM              |
| 6   | Role escalation              | DEFENDED (fixed)       | —                   |
| 7   | Hidden endpoint access       | PARTIAL                | MEDIUM              |
| 8   | Creator Console bypass       | HARDENED               | LOW                 |
| 9   | Module entitlement bypass    | HARDENED               | LOW                 |
| 10  | Suspended tenant bypass      | DEFENDED (fixed)       | —                   |
| 11  | Removed member session reuse | DEFENDED               | —                   |
| 12  | Expired invitation reuse     | DEFENDED               | —                   |
| 13  | Revoked invitation reuse     | DEFENDED               | —                   |
| 14  | Cross-tenant file access     | DEFENDED               | —                   |
| 15  | API key abuse                | PARTIAL                | MEDIUM              |
| 16  | Webhook replay               | PARTIAL (CAD defended) | MEDIUM              |

---

## CRITICAL findings

### S21-C1 — Role permission swap → platform admin

| Field    | Value                        |
| -------- | ---------------------------- |
| Status   | **RESOLVED** (repair pass 1) |
| Was      | VULNERABLE                   |
| Severity | CRITICAL                     |

**Exploit (pre-fix):** Tenant admin creates a custom role, assigns it to self, then `PUT` permissions includes `platform.tenant.create` + `platform.tenant.suspend` + `platform.entitlement.manage`, triggering `isPlatformAdmin` heuristic.

**Fix:**

- `AuthorizationService.setRolePermissions` / `assignRole` enforce creator-only + caller-must-hold rules (same shape as memberships `assertGrantable`)
- Regression tests: `authorization.escalation.test.ts`

---

## HIGH findings

### S21-H1 — Suspended tenant self-reactivation

| Field    | Value                        |
| -------- | ---------------------------- |
| Status   | **RESOLVED** (repair pass 1) |
| Was      | PARTIAL bypass               |
| Severity | HIGH                         |

**Exploit (pre-fix):** Owner holds `platform.tenant.update` with `allowWhenSuspended` and calls `POST …/tenants/:id/activate`.

**Fix:** Activate requires `platform.tenant.suspend` (creator-only), matching suspend.

### S21-H2 — Module/product entitlement self-serve

| Field    | Value                        |
| -------- | ---------------------------- |
| Status   | **RESOLVED** (repair pass 1) |
| Was      | PARTIAL                      |
| Severity | HIGH                         |

**Exploit (pre-fix):** Tenant owner held `platform.entitlement.manage` and could assign unpaid modules while suspended.

**Fix:**

- `platform.entitlement.manage` added to `CREATOR_ONLY_PERMISSIONS`
- Removed from `TENANT_OWNER_PERMISSIONS` / `TENANT_ADMIN`
- Migration `0038_mk_s21_security_hardening.sql` strips template + TENANT_OWNER/ADMIN role bindings (not applied prod)

### S21-H3 — Creator Console surface for tenant personas

| Field    | Value               |
| -------- | ------------------- |
| Status   | **HARDENED**        |
| Severity | HIGH → LOW residual |

Entitlement-write Creator APIs are now creator-only. Residual: tenant owners still hold some `platform.*` read/manage codes by design for Tenant Admin; UI gates are non-authoritative. Catalog list remains behind `platform.tenant.read`.

---

## MEDIUM residuals (documented, not blocking PASS)

| ID     | Topic                        | Notes                                                                             |
| ------ | ---------------------------- | --------------------------------------------------------------------------------- |
| S21-M1 | Facility substitution        | Membership facility IDs validated on invite; not enforced on all resource queries |
| S21-M2 | Outbound webhook replay      | HMAC without timestamp/nonce; CAD inbound has replay cache                        |
| S21-M3 | API keys unused for auth     | Lifecycle is safe; request auth not wired                                         |
| S21-M4 | Missing `@RequirePermission` | PermissionGuard no-ops when decorator absent (e.g. search)                        |

---

## DEFENDED (evidence)

| Vector                             | Evidence                                                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant + URL substitution    | AuthGuard membership bind; TenantGuard; RLS `withTenantTransaction`; `packages/authorization` TENANT_MISMATCH tests; `tenant-isolation.integration.test.ts` |
| Invitation expiry/revocation       | `invitations.service.ts` + `invitations.security.test.ts`                                                                                                   |
| Session revoke                     | `sessionsRevokedAt` vs JWT `iat`; `auth-context.security.test.ts`                                                                                           |
| Branding file ownership            | Object key + tenant checks; `branding-ownership.test.ts`                                                                                                    |
| Body tenant mismatch (invitations) | `invitations.security.test.ts`                                                                                                                              |

---

## Code / migration changes (MK-S21)

| Area                 | Change                                                              |
| -------------------- | ------------------------------------------------------------------- |
| AuthorizationService | Permission assignability checks on set/assign                       |
| TenantsController    | Activate → `platform.tenant.suspend`                                |
| contracts            | `platform.entitlement.manage` creator-only; owner template stripped |
| drizzle              | `0038_mk_s21_security_hardening.sql`                                |
| tests                | `authorization.escalation.test.ts`                                  |

---

## Explicit non-goals

- Live production penetration
- Industrial-only red team
- Production migrate/deploy
- Full facility ACL (BACKLOG-016)
- API-key request authentication productization
