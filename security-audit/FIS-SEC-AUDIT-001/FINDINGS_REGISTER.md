# Findings Register — FIS-SEC-AUDIT-001

## FIS-SEC-010 — Public QR endpoints trust client-supplied `permissions`

**Severity:** Critical  
**Status:** Mitigated (API deployed `sec-audit-hotfix-20260917185831`; web client redeploy optional)  
**Presentation Blocker:** Conditional until redeployed  
**Affected Component:** `apps/platform-api` public scan QR (`IndustrialPublicQrController` / `IndustrialPublicQrService` / `scan-actions.ts`)  
**Affected Tenant/Role:** Any tenant with an active public QR token (includes Producers Rice Mill if QR links are in use)  
**OWASP Category:** A01 Broken Access Control

### Summary

Unauthenticated `@Public()` endpoints `POST /api/v1/public/scan/:token/actions` and `.../history` previously accepted `body.permissions` from the client. Fixed: client permissions are ignored; optional Bearer tokens are resolved server-side via `AuthContextService`.

### Evidence

- File/configuration: `apps/platform-api/src/modules/industrial/industrial-public-qr.controller.ts` lines 43–51, 64–73
- Service builds permission Set from body: `industrial-public-qr.service.ts` lines 719–726, 827–856
- Action filter honors client perms / admin: `scan-actions.ts` lines 491–493
- Discovery: [Explore XSS files CORS secrets](a3dcb3ec-37e4-421e-aa50-931618ee6d29)

### Exploit Conditions

1. Knowledge of a valid public QR token for a target asset/link
2. HTTP POST with fabricated `permissions` array (e.g. `["industrial.admin"]`)
3. No authenticated Forge session required

### Business Impact

Unauthorized disclosure of asset inspection/corrective history and elevation of available public scan actions within the token’s tenant. Presentation risk if demo uses live QR scan flows.

### Recommended Remediation

1. Ignore client `permissions` on public routes; derive capability only from server-side link config, verified employee number, and/or short-lived public session tokens minted after identify.
2. Add regression tests that POST admin permissions and expect forbidden/unchanged action sets.
3. Review other `industrial-public-*` controllers for the same pattern.

### Verification Test

With only a QR token: `POST .../history` with `permissions:["industrial.admin"]` must remain `403` unless employee verification (or an equivalent server session) authorizes history.

### Owner and Target Date

Industrial API owners — before any live Producers presentation that demonstrates QR scan.

---

## FIS-SEC-001 — Hosted development API accepts `x-forge-dev-principal` without Cognito

**Severity:** Critical  
**Status:** Mitigated (deployed api-dev td `:128` + production td `:392`)  
**Presentation Blocker:** Contained — post-deploy probe returns Bearer required on api-dev  
**Affected Component:** `apps/platform-api` AuthContextService; `https://api-dev.forgepublicsafety.com`  
**Affected Tenant/Role:** Any tenant/user ID known to the attacker on the development environment  
**OWASP Category:** A07 Identification and Authentication Failures

### Summary

When `APP_ENV` is `development`, the API authenticates callers using the `x-forge-dev-principal` header if no Bearer token is present. The hosted development API advertises `environment: development` and processes forged principals.

### Evidence

- File/configuration: `apps/platform-api/src/modules/auth-context/auth-context.service.ts` lines 120–147
- Live: `GET https://api-dev.forgepublicsafety.com/health` → `"environment":"development"`
- Live: `GET /api/v1/auth/me` with valid JSON principal, no Authorization → `401` `"User not found"` (proves principal path, not Bearer-only rejection)
- Contrast: production returns `"Authorization Bearer token required"` for the same header

### Exploit Conditions

1. Network reachability to `api-dev.forgepublicsafety.com`
2. Knowledge of a valid `userId` and `tenantId` in that environment

### Business Impact

Full account impersonation on the development environment without password/MFA/Cognito. Cross-tenant impact if identifiers for other tenants are known. Presentation risk if any demo client points at api-dev.

### Recommended Remediation

1. Fail closed for internet-facing APIs: only allow the header when `APP_ENV=local` (or behind an explicit break-glass secret / IP allowlist).
2. Confirm UAT (if separate) uses Cognito-only.
3. Rotate any development credentials that may have been exercised via this path.

### Verification Test

Repeat Node/curl principal probe: expect production-equivalent `"Authorization Bearer token required"` (or connection denied), never user lookup.

### Owner and Target Date

Platform API owners — before any live Producers presentation.

---

## FIS-SEC-002 — Refresh and access tokens stored in `localStorage`

**Severity:** High  
**Status:** Open  
**Presentation Blocker:** Conditional (elevates any XSS to session theft)  
**Affected Component:** `packages/web-kit/src/auth-storage.ts`  
**Affected Tenant/Role:** All browser users  
**OWASP Category:** A02 Cryptographic Failures / A07

### Summary

Cognito access and refresh tokens are persisted under `forge-bearer-token` and `forge-refresh-token` in `localStorage`, readable by any XSS on the Industrial origin.

### Evidence

- File: `packages/web-kit/src/auth-storage.ts` lines 3–67, 125–130

### Exploit Conditions

Successful XSS or malicious extension on the Industrial / vanity origin.

### Business Impact

Session hijack, refresh persistence after access-token expiry, potential cross-module abuse until revocation.

### Recommended Remediation

Prefer HttpOnly Secure SameSite cookies or a BFF pattern; until then harden CSP (remove `unsafe-inline`), sanitize HTML sinks, and ensure logout + `sessionsRevokedAt` paths are exercised.

### Verification Test

Confirm tokens not readable from `document` after architectural change; regression on login/refresh.

### Owner and Target Date

Web platform — post-presentation hardening acceptable if CSP/XSS gates held; still High.

---

## FIS-SEC-003 — Production dependency advisories include Critical/High

**Severity:** High  
**Status:** Open  
**Presentation Blocker:** Conditional (pending reachability)  
**Affected Component:** pnpm workspace production dependency graph  
**Affected Tenant/Role:** Potentially API/worker/frontend depending on package  
**OWASP Category:** A06 Vulnerable and Outdated Components

### Summary

`pnpm audit --prod` reported 37 issues including 2 critical and 16 high (2026-09-17 snapshot). Reachability not fully analyzed in this sprint.

### Evidence

- Command: `pnpm audit --prod`
- Evidence file: `evidence/pnpm-audit-prod.txt` (partial)

### Exploit Conditions

Depends on whether vulnerable code paths are loaded in production Industrial API/web.

### Business Impact

Potential RCE/DoS/data exposure if reachable (unconfirmed).

### Recommended Remediation

Triage Critical/High advisories for packages actually shipped in Industrial production images; patch or justify accept risk.

### Verification Test

Re-run `pnpm audit --prod` after upgrades; confirm Industrial runtime images rebuild.

### Owner and Target Date

Platform maintainers — within 7 days for Critical reachability triage.

---

## FIS-SEC-004 — CSP allows `script-src 'unsafe-inline'`

**Severity:** Medium  
**Status:** Open  
**Presentation Blocker:** No (defense-in-depth)  
**Affected Component:** CloudFront response headers on Industrial / Producers vanity  
**Affected Tenant/Role:** All browser users  
**OWASP Category:** A05 Security Misconfiguration

### Summary

Live CSP includes `script-src 'self' 'unsafe-inline'`, reducing XSS containment. `connect-src` allows broad `https:`.

### Evidence

- `curl -I https://industrial.forgepublicsafety.com` / `producersrice.forgepublicsafety.com`

### Exploit Conditions

XSS injection opportunity.

### Business Impact

Easier script execution if markup injection exists.

### Recommended Remediation

Nonce/hash-based CSP; tighten `connect-src` to API + required CDNs only.

### Verification Test

Header re-check after CloudFront policy change.

### Owner and Target Date

Infra / frontend — backlog with urgency after XSS sink review.

---

## FIS-SEC-005 — Legal acknowledgment renders HTML without client sanitization

**Severity:** Medium  
**Status:** Mitigated  
**Presentation Blocker:** No  
**Affected Component:** `apps/industrial-web/src/app/legal/acknowledge/page.tsx`  
**Affected Tenant/Role:** Users viewing legal docs  
**OWASP Category:** A03 Injection (XSS)

### Summary

`dangerouslySetInnerHTML` renders `body.content` from legal document versions without DOMPurify at the client.

### Evidence

- Lines ~161–164 in `legal/acknowledge/page.tsx`

### Exploit Conditions

Attacker who can modify platform legal HTML content, or compromised admin path.

### Business Impact

Stored XSS → token theft given localStorage sessions.

### Recommended Remediation

Sanitize with a vetted HTML sanitizer; CSP without unsafe-inline; restrict who can edit legal HTML.

### Verification Test

Harmless marker string in local fixture must not execute script after sanitization.

### Owner and Target Date

Industrial web — near-term.

---

## FIS-SEC-006 — Platform-admin membership shadow unit test failing

**Severity:** Medium  
**Status:** Mitigated  
**Presentation Blocker:** No  
**Affected Component:** `auth-context.platform-admin-shadow.test.ts` / AuthContextService  
**Affected Tenant/Role:** Platform super-admin with customer membership  
**OWASP Category:** A01 Broken Access Control

### Summary

`resolvePrincipal` previously used `access?.tenantId` as the “home” tenant when loading roles, so a customer membership could strip `PLATFORM_SUPER_ADMIN`. Fixed to always load platform-admin authority from `user.tenantId`.

### Evidence

- Fix: `auth-context.service.ts` (`homeTenantId = user.tenantId`)
- Vitest: `auth-context.platform-admin-shadow.test.ts` now passes

### Exploit Conditions

Platform admin also holding a customer-tenant membership and selecting that tenant.

### Business Impact

Support privilege confusion / unexpected permission narrowing.

### Recommended Remediation

Done in code; redeploy platform-api.

### Verification Test

`pnpm --filter @forge/platform-api exec vitest run src/modules/auth-context/auth-context.platform-admin-shadow.test.ts`

### Owner and Target Date

Auth owners — mitigated pending deploy.

---

## FIS-SEC-007 — API discloses `X-Powered-By: Express`

**Severity:** Low  
**Status:** Mitigated (deployed; `X-Powered-By` absent on prod/dev `/health`)  
**Presentation Blocker:** No  
**Affected Component:** platform-api / Express  
**Affected Tenant/Role:** All API clients  
**OWASP Category:** A05

### Summary

Production API responses include `X-Powered-By: Express`.

### Evidence

- Live response headers on `/api/v1/auth/me`

### Exploit Conditions

None direct.

### Business Impact

Minor fingerprinting aid.

### Recommended Remediation

`app.disable('x-powered-by')` or strip at CloudFront.

### Verification Test

Header absent on health/auth responses.

### Owner and Target Date

Backlog.

---

## FIS-SEC-008 — Production anonymous and forged-principal rejection (positive control)

**Severity:** Informational  
**Status:** Mitigated (observed healthy)  
**Presentation Blocker:** No  
**Affected Component:** Production platform-api  
**Affected Tenant/Role:** N/A  
**OWASP Category:** A07

### Summary

Production API rejects missing Authorization and does not honor `x-forge-dev-principal` (`Authorization Bearer token required`).

### Evidence

- Live probes in `evidence/rg03-rg04-cors.txt` and Node probes

### Exploit Conditions

N/A

### Business Impact

Positive control for production auth entry.

### Recommended Remediation

Keep `APP_ENV=production` immutable in prod task definitions; alert on drift.

### Verification Test

Periodic synthetic 401 checks.

### Owner and Target Date

Ops — continuous.

---

## FIS-SEC-009 — CORS denies unapproved browser origins (positive control)

**Severity:** Informational  
**Status:** Mitigated (observed healthy)  
**Presentation Blocker:** No  
**Affected Component:** platform-api CORS  
**Affected Tenant/Role:** N/A  
**OWASP Category:** A05

### Summary

Request with `Origin: https://evil.example` received 401 without `Access-Control-Allow-Origin`. Industrial origin received ACAO echo with credentials.

### Evidence

- `evidence/rg03-rg04-cors.txt`

### Recommended Remediation

Keep CORS allowlist explicit; exclude localhost from production.

### Owner and Target Date

Ops — continuous.

---

## FIS-SEC-011 — Field logout does not clear offline IndexedDB / localStorage caches

**Severity:** Medium  
**Status:** Mitigated  
**Presentation Blocker:** No  
**Affected Component:** `apps/field-web` shell logout vs `clearAllOfflineData`  
**Affected Tenant/Role:** Field users on shared tablets  
**OWASP Category:** A01 / A04

### Summary

Industrial shell clears offline data on sign-out; Field shell logout does not call the existing `clearAllOfflineData` helper (present and unit-tested only).

### Evidence

- Field shell logout: `apps/field-web/src/components/field-shell.tsx` (~167)
- Clear helper: `apps/field-web/src/lib/offline/cache.ts` (~122)
- Discovery: [Explore XSS files CORS secrets](a3dcb3ec-37e4-421e-aa50-931618ee6d29)

### Exploit Conditions

Shared device; prior user logs out; next user can still read offline drafts/queues for prior tenant/user.

### Business Impact

Cross-user residual Field data on presentation or shop-floor devices.

### Recommended Remediation

Call `clearAllOfflineData` from Field logout the same way Industrial does; add e2e coverage.

### Verification Test

After logout, Dexie/localStorage offline keys empty; RG-09 checklist.

### Owner and Target Date

Field web — before Field-inclusive demos.

---

## FIS-SEC-012 — Import ZIP path entries lack `../` rejection before extract

**Severity:** Medium  
**Status:** Mitigated  
**Presentation Blocker:** No  
**Affected Component:** `packages/imports/src/formats/zip.ts`  
**Affected Tenant/Role:** Import operators  
**OWASP Category:** A01 / A03

### Summary

ZIP migration inventory validates extensions but does not reject path-traversal entry names (`../`) before any extract-to-disk path.

### Evidence

- `packages/imports/src/formats/zip.ts` (~44–64, 114–218)
- Discovery: [Explore XSS files CORS secrets](a3dcb3ec-37e4-421e-aa50-931618ee6d29)

### Exploit Conditions

Malicious ZIP uploaded by an authorized importer; worker extracts using entry paths unsafely.

### Business Impact

Possible ZIP Slip / path traversal if extract path joins raw entry names.

### Recommended Remediation

Normalize and reject absolute paths and `..` segments; add unit tests with traversal payloads.

### Verification Test

Traversal ZIP fails validation; no files written outside destination root.

### Owner and Target Date

Import platform — near-term.
