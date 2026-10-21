# Forge Industrial Safety — Security Audit Report

**Audit ID:** FIS-SEC-AUDIT-001  
**Date:** 2026-09-17  
**Commit:** `54a4742b3736f9bccdb052ba308811b5547301d8` (`industrial/training-employee-portal`)  
**Auditor:** Cursor under operator supervision  
**Presentation tenant:** Producers Rice Mill  
**Mode:** Non-destructive source, configuration, dependency, authorization, tenant-isolation, and deployment review  

## Decision

**FAIL / STOP SHIP**

Primary drivers:

1. **Public QR authorization bypass (FIS-SEC-010):** `@Public()` scan endpoints accept client-supplied `body.permissions` and use them to unlock asset history and restricted actions (including checks for `industrial.admin`). Confirmed in source after follow-up from [Explore XSS files CORS secrets](a3dcb3ec-37e4-421e-aa50-931618ee6d29).
2. Hosted **development** API (`api-dev.forgepublicsafety.com`, `APP_ENV=development`) accepts `x-forge-dev-principal` as an authentication path without a Cognito bearer token (FIS-SEC-001).
3. Live authenticated Producers Rice Mill cross-tenant / IDOR proofs for **RG-01** and **RG-02** remain **BLOCKED** (no approved presentation credentials).

Production API (`api.forgepublicsafety.com`) correctly rejects anonymous and forged-dev-principal requests. That is necessary but not sufficient to clear a live presentation under this release gate. Auth/tenant architecture notes from [Explore auth and tenant isolation](23b1cd0f-4cc7-416d-a95d-07c3610c618c) align with the production Cognito + RLS design already documented.

## Presentation recommendation

**DO NOT USE LIVE PLATFORM** until:

1. Hosted development (and any UAT) either disables the `x-forge-dev-principal` path or is unreachable from presentation browsers/networks, and  
2. Approved Producers Rice Mill authenticated RG-01 / RG-02 tests are executed and pass, and  
3. Presentation traffic is locked to production Industrial / Producers vanity hosts and `api.forgepublicsafety.com` only.

Safe interim alternatives: pre-recorded walkthrough, static screenshots, or a local synthetic tenant environment. Do **not** demonstrate live public QR history/actions until FIS-SEC-010 is patched.

---

## 1. Scope and trust boundaries

### Monorepo map (relevant)

| Area | Location |
| --- | --- |
| Industrial frontend | `apps/industrial-web` (static export / CloudFront) |
| Field frontend | `apps/field-web` |
| Creator / platform admin | `apps/creator-console` |
| Tenant admin | `apps/tenant-admin` |
| API | `apps/platform-api` (NestJS) |
| Workers | `apps/worker-service` |
| Auth / tokens (shared) | `packages/auth`, `packages/web-kit` |
| Authorization | `packages/authorization` |
| Tenant context | `packages/tenant-context` |
| Database / RLS helpers | `packages/database` |
| Imports | `packages/imports`, `packages/import-center`, API import modules |
| IaC | `infrastructure/cdk` |

### Observed public origins

- Frontend: `https://industrial.forgepublicsafety.com`, `https://producersrice.forgepublicsafety.com`, `https://producers-rice-mill.forgepublicsafety.com`
- API prod: `https://api.forgepublicsafety.com` (`environment: production`)
- API dev: `https://api-dev.forgepublicsafety.com` (`environment: development`)
- Creator / RMS / admin hosts appear in production CORS allowlists (Task Definition evidence; values not repeated as secrets)

### Trust-boundary diagram (concise)

```text
[Browser: industrial / producersrice vanity]
   |  Cognito access + refresh tokens in localStorage (web-kit)
   |  Optional x-tenant-id from forge-active-tenant-id
   v
[CloudFront + S3 static assets]  -- security headers (HSTS, CSP, frame-ancestors none)
   |
   | HTTPS API calls
   v
[CloudFront / ALB -> platform-api]
   |  AuthContextService.resolvePrincipal
   |    - production: Bearer Cognito JWT only
   |    - local|development|testing: may accept x-forge-dev-principal
   |  Membership check on requested tenant (x-tenant-id / route param)
   |  PermissionGuard / TenantGuard / module entitlements
   v
[Postgres via withTenantTransaction + RLS app role]
   |
   +--> [S3 signed URLs / imports / exports / workers]
```

Static frontend code is **not** a trust boundary. Enforcement must hold at API + database.

---

## 2. Authentication findings (summary)

| Control | Result | Evidence |
| --- | --- | --- |
| Prod anonymous `/api/v1/auth/me` | **PASS** (`401`, Bearer required) | `evidence/rg03-rg04-cors.txt` |
| Prod forged `x-forge-dev-principal` | **PASS** (`401`, Bearer required) | Node + curl probes |
| Dev forged `x-forge-dev-principal` | **FAIL** (principal path active; unknown user → `User not found`) | Node probe against `api-dev` |
| Cognito verify path (source) | Present via `verifyCognitoAccessToken` | `auth-context.service.ts` |
| Refresh token storage | **HIGH** — `localStorage` key `forge-refresh-token` | `packages/web-kit/src/auth-storage.ts` |
| Frontend deploy strips `NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL` | Intended by `scripts/sync-static-site.mjs` | Source review |

### Critical path: hosted development principal

```120:147:apps/platform-api/src/modules/auth-context/auth-context.service.ts
    } else if (
      this.env.APP_ENV === "local" ||
      this.env.APP_ENV === "development" ||
      this.env.APP_ENV === "testing"
    ) {
      const raw =
        req.header("x-forge-dev-principal") ??
        req.header("x-forge-dev-user") ??
        req.header("X-Forge-Dev-User");
      // ...
    } else {
      throw new ForgeError("UNAUTHORIZED", "Authorization Bearer token required");
    }
```

Live `GET https://api-dev.forgepublicsafety.com/health` returns `"environment":"development"`.  
Live `GET /api/v1/auth/me` with a valid JSON `x-forge-dev-principal` and **no** Authorization header returned `401 User not found` — proving the header is parsed and used as the authenticated identity path.

Any actor who can reach `api-dev` and knows (or can guess / enumerate) a real `userId` + `tenantId` can impersonate that user without Cognito.

---

## 3. Tenant isolation (RG-01 / RG-02)

### Source/control design (positive)

- Requested tenant is taken from route/`x-tenant-id`/token hint, then **membership is required** unless platform super-admin (`auth-context.service.ts` ~173–197).
- `TenantGuard` rejects route `:tenantId` mismatches for non-platform admins (`tenant.guard.ts`).
- DB access uses `withTenantTransaction`; integration tests exist for RLS person isolation (`packages/database/src/tenant-isolation.integration.test.ts`).
- Unit tests: `auth-context.select-tenant.test.ts` (8 passed), `configuration-tenant-isolation.unit.test.ts` (3 passed), `auth-context.security.test.ts` (8 passed).

### Live verification

| Test | Status |
| --- | --- |
| Producers user + foreign `x-tenant-id` | **BLOCKED** — no approved credentials |
| Producers user + foreign object ID (IDOR) | **BLOCKED** |
| Platform-admin shadow unit test | **FAILED** locally (`auth-context.platform-admin-shadow.test.ts`) — privilege-model uncertainty |

**Gate status:** RG-01 **BLOCKED**, RG-02 **BLOCKED** for live clearance. Code review is supportive but insufficient alone per sprint rules.

---

## 4. Authorization / roles

Server-side guards observed: `AuthGuard`, `PermissionGuard`, `TenantGuard`, entitlement loading, disabled-user rejection, session revocation checks.

Not fully matrix-tested live for ordinary vs tenant-admin vs platform-admin against Producers Rice Mill. Mark representative live role tests **BLOCKED**.

Failing platform-admin shadow unit test indicates uncertainty when a platform admin also has a customer membership — treat as Medium until fixed and re-verified.

---

## 5. Browser / XSS / offline

| Item | Assessment |
| --- | --- |
| Access + refresh tokens in `localStorage` | **HIGH** (XSS → session theft) |
| `clearAuthStorage()` on logout | Present (tokens + active tenant + auth me cache) |
| Offline / IndexedDB full inventory | Partial review only — full RG-09 browser matrix **BLOCKED** without presentation profile |
| `dangerouslySetInnerHTML` on legal acknowledge page | **MEDIUM** — platform-authored HTML, no DOMPurify at render |
| Photo markup SVG `dangerouslySetInnerHTML` | Review as defense-in-depth |
| Live CSP | Present; `script-src 'self' 'unsafe-inline'` weakens XSS mitigation |

---

## 6. CORS and security headers

### Frontend (`industrial` / `producersrice`)

Observed: HSTS (preload), CSP with `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy.

Weaknesses: CSP `script-src` includes `'unsafe-inline'`; `connect-src` allows `https:` broadly.

### API (`api.forgepublicsafety.com`)

Observed: HSTS, CSP `default-src 'none'; frame-ancestors 'none'`, nosniff, COOP, CORP `cross-origin`, Permissions-Policy.

- Unapproved origin (`https://evil.example`): **no** `Access-Control-Allow-Origin` on 401 response.
- Approved origin (`https://industrial.forgepublicsafety.com`): ACAO echoes origin with credentials.
- `X-Powered-By: Express` disclosed (**LOW**).

---

## 7. Secrets and build artifacts

- No AWS access-key / private-key patterns found in targeted repo grep of tracked sources.
- Deploy script deletes `NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL` for production builds.
- Live industrial index-linked chunk scan did not surface `ALLOW_DEV_PRINCIPAL=true` or AWS key material in the first-load script set (limited sample; dynamic chunks not exhaustively enumerated).
- Local `.env.local` is gitignored; example files use placeholders.
- Many local diagnostic JSON files exist at repo root (operator artifacts). Confirm they are gitignored / untracked before any share; do not commit.

---

## 8. Dependencies

`pnpm audit --prod` reported **37** vulnerabilities: **2 critical, 16 high, 15 moderate, 4 low** (snapshot 2026-09-17).

These are **not** auto-classified as exploitable in the Forge attack path without reachability analysis. Tracked as High/Critical backlog items pending triage (see `SECURITY_BACKLOG.md` and `FINDINGS_REGISTER.md`).

---

## 9. Files / imports / QR (summary)

- **Critical:** Public QR `POST .../actions` and `.../history` trust client `permissions` (controller lines 43–73; service 719–856; `scan-actions.ts` 491–493). See FIS-SEC-010.
- Import malware scanning and principal-scoped tenant assignment are present; ZIP entry path traversal checks are incomplete (FIS-SEC-012).
- Field logout does not clear offline Dexie caches (FIS-SEC-011); Industrial logout does.
- QR token hashing unit tests passed (`qr-token.security.test.ts`, 4 tests) — does **not** cover the permissions bypass.
- Full live cross-tenant attachment / signed-URL / import-tenant-id abuse tests **BLOCKED** without approved fixtures.

---

## 10. Automated checks executed

| Command | Result |
| --- | --- |
| `pnpm --filter @forge/platform-api exec vitest run ...auth-context.security.test.ts` | PASS (8) |
| `... qr-token.security.test.ts` | PASS (4) |
| `... configuration-tenant-isolation.unit.test.ts` | PASS (3) |
| `... auth-context.select-tenant.test.ts` | PASS (8) |
| `... auth-context.platform-admin-shadow.test.ts` | FAIL (1) |
| `pnpm audit --prod` | 37 findings (2 critical / 16 high) |
| Live header / auth / CORS probes | See `evidence/` |
| Full monorepo typecheck/lint/build | **NOT RUN** (timeboxed; not required to overturn Critical finding) |
| DB RLS integration test | **NOT RUN** (requires local Postgres `forge_app`) |

---

## 11. Areas not tested / blocked

- Authenticated Producers Rice Mill RG-01 / RG-02 / RG-05 / RG-06 live matrix
- Presentation-profile RG-09 / RG-10 browser containment
- Exhaustive industrial production bundle map enumeration
- AWS IAM / S3 public-access / WAF deep read-only review (AWS MCP unavailable this session)
- UAT hostname distinct from `api-dev` (if any) — treat `api-dev` as hosted non-prod risk
- Malicious import / upload live abuse cases
- Stored XSS payload testing (intentionally not executed in production)

---

## 12. Remaining risk statement

Absence of additional Critical findings on the **production** API anonymous Cognito path does **not** prove the platform is secure. Confirmed Critical issues remain: public QR client-permission trust (FIS-SEC-010) and hosted development principal auth (FIS-SEC-001). Tenant isolation for the presentation tenant remains unverified live. Do not clear an unqualified go-live for Industrial Safety under FIS-SEC-AUDIT-001 rules.
