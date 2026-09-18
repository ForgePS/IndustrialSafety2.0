# FIS-SEC-AUDIT-001 Remediation

**Checkpoint:** `FORGE-INDUSTRIAL-SEC-REMEDIATION-S1`  
**Source audit:** `FIS-SEC-AUDIT-001`  
**Working repository:** `forge-platform-industrial-recon`  
**Environment:** local / development only until release gates pass  
**Production deploy:** **NOT EXECUTED**

## Baseline

| Field | Value |
|-------|--------|
| Repository root | `C:/Users/jerem/Projects/forge-platform-industrial-recon` |
| Branch at start | `industrial/training-employee-portal` (user task branch; dirty worktree preserved) |
| Remediation branch | `security/industrial-fis-sec-audit-001` |
| Baseline commit SHA | `54a4742b3736f9bccdb052ba308811b5547301d8` |
| Final commit SHA | `23fdd94a226602280f9220273e84ce4deb12f65d` |
| Remediation commits | `1033169` discovery → `9ece0a2` FIS-H01 → `581fd50` authz matrix → `9194748` CSP/branding/legacy → `23fdd94` evidence |
| Package manager | `pnpm@10.12.1` |
| Workspaces | `apps/*`, `packages/*`, `infrastructure/*`, `tools/data-migration/*` |
| Node | `>=20` |
| Frontend architecture | Industrial/Field production: Next.js `output: "export"` (static) behind CloudFront |

Pre-existing dirty worktree was preserved; unrelated user changes were not reset or discarded.

### Pre-modification tests

| Command | Result |
|---------|--------|
| `pnpm --filter @forge/web-kit test` | **45/45 passed** (pre-change baseline) |

## Ownership map (discovery)

### Auth storage / client session

| Concern | Path | Symbols |
|---------|------|---------|
| Token keys / storage | `packages/web-kit/src/auth-storage.ts` | memory bearer/tenant/CSRF; `purgeLegacyAuthKeys`; refresh never stored |
| Session orchestration | `packages/web-kit/src/auth-provider.tsx` | `AuthProvider`, `establishSession`, login/logout |
| API client | `packages/web-kit/src/api-client.ts` | `credentials: 'include'`, `x-forge-csrf`, `x-tenant-id` |
| OAuth / password | `cognito-oauth.ts`, `cognito-password-auth.ts` | BFF `/api/v1/auth/session/*` |
| Refresh single-flight | `packages/web-kit/src/session-refresh.ts` | `tryRefreshSession` via session refresh |

### Server session BFF (new)

| Concern | Path | Symbols |
|---------|------|---------|
| HTTP | `auth-session.controller.ts` | oauth/callback, password, refresh, logout |
| Service | `auth-session.service.ts` | exchange, rotate, revoke |
| Cookie / CSRF / Origin | `auth-session-cookie.ts` | `__Host-forge-session` / `forge-session`, `x-forge-csrf` |
| Crypto | `auth-session-crypto.ts` | AES-GCM refresh ciphertext |
| Persistence | `packages/database/src/schema/auth-browser-sessions.ts` | `authBrowserSessions` |
| Migration | `packages/database/drizzle/0105_auth_browser_sessions_s1.sql` | RLS + SECURITY DEFINER lookup |

### Cognito / principal

| Concern | Path | Symbols |
|---------|------|---------|
| Principal resolve | `auth-context.service.ts` | `resolvePrincipal`, `allowsDevPrincipalHeader` (local/testing or break-glass flag only) |
| JWT verify | `packages/auth/src/index.ts` | `verifyCognitoAccessToken` |
| Cognito admin | `cognito-admin.service.ts` | `globalSignOut` |

### Tenant / RBAC

| Concern | Path | Notes |
|---------|------|--------|
| APP_GUARD chain | `app.module.ts` | Auth → Tenant → Permission → Legal |
| Policy | `packages/authorization` | `evaluateAuthorization` |
| HTTP matrix | `industrial-authz-matrix.http.test.ts` | synthetic Tenant A/B + roles |

### Hosting / CSP / legacy hosts

| Concern | Path | Notes |
|---------|------|--------|
| CSP builder | `forge-static-hosting-csp.ts` | `script-src 'self'`; narrowed `connect-src` |
| Static hosting | `forge-static-hosting.ts` | `/api/*` + `/health` proxy; legacy host 301 |
| Industrial/Field | `forge-industrial-hosting.ts`, `forge-field-hosting.ts` | `domains.api` proxy + Producers legacy redirect |
| Theme boot | `apps/*/public/theme-boot.js` | externalized FOUC script (no inline) |

### Public branding (FIS-L01)

| Concern | Path | Notes |
|---------|------|--------|
| DTO schema | `login-branding.public-schema.ts` | presentation fields only; **no tenantId** |
| Service | `login-branding.service.ts` | host → tenant server-side; strip identifiers from response |

## Session and cookie threat model

| Threat | Control |
|--------|---------|
| XSS steals refresh token | Refresh never in JS storage; HttpOnly host-only cookie; access token memory-only |
| Session fixation | New opaque session id issued at login; rotation on refresh |
| Refresh replay | Prior session revoked on rotate (`rotatedFromSessionId` / `revokedAt`) |
| CSRF on cookie POSTs | Origin/Referer allowlist + session-bound `x-forge-csrf` |
| Token logging | `@forge/security` redaction; crypto/session tests assert no plaintext refresh in logs |
| Cross-site cookie | `__Host-` prefix when HTTPS non-localhost: `Secure`, `Path=/`, no `Domain`, `SameSite=Strict` |
| Cross-origin API without BFF | Mitigated by same-origin `/api/*` CloudFront behavior to `domains.api` |

## Tenant / RBAC / object matrix (summary)

See `industrial-authz-matrix.http.test.ts` (18 cases): walkthrough allow/deny, flat, wrong tenant header, cross-tenant object NOT_FOUND (no leak), reporting permissions, anonymous/malformed/expired/forged-dev/revoked.

## CSP origin inventory

Built by `buildSpaContentSecurityPolicy`:

- `default-src 'self'`; `base-uri 'self'`; `object-src 'none'`; `frame-ancestors 'none'`
- `script-src 'self'` (no `unsafe-inline` / `unsafe-eval`)
- `connect-src 'self'` + `https://{apiProxyOriginHostname}` + Cognito/office/blob extras via props
- `style-src` still allows `unsafe-inline` (scripts were the finding; styles deferred)
- Theme FOUC moved to `/theme-boot.js`

## Logout / offline cleanup inventory

| Item | Behavior |
|------|----------|
| In-memory bearer / tenant / CSRF | cleared by `clearAuthStorage` |
| Legacy localStorage keys | `purgeLegacyAuthKeys` removeItem only |
| `forge-auth-me-cache` | sessionStorage cleared |
| Tenant switch | `clearCachedAuthMe` before bind (`tenant-switch.ts`) |
| Server session | `POST /api/v1/auth/session/logout` revokes row + clears cookie |
| Cognito | existing `logoutAll` / `globalSignOut` path retained |
| IndexedDB / Cache Storage / SW | Field: `purgeFieldForgeBrowserState` deletes `forge-field-offline`, `forge-field-shell*` caches, unregisters `/sw.js` on logout; Industrial has no IDB/SW |
| Tenant switch | `AuthProvider.chooseTenant` → `runForgeBrowserCleanup("tenant-switch")` before select-tenant |
| Logout (all paths) | `AuthProvider.logout` → `runForgeBrowserCleanup("logout")` then session clear (covers legal gate `logout()`) |
| Theme / nav prefs | Intentionally retained (not tenant operational data) |
| IndexedDB / Cache Storage / SW (prior gap) | Addressed for Field; Industrial remains LS-only by design |

## Changed files by finding

### FIS-H01 — JS-readable refresh credentials
- `packages/web-kit/src/auth-storage.ts` (+ tests)
- `packages/web-kit/src/cognito-oauth.ts`, `cognito-password-auth.ts`, `session-refresh.ts`, `api-client.ts`, `auth-provider.tsx`, `index.ts`
- `apps/platform-api/src/modules/auth-context/auth-session*.ts` (+ tests)
- `packages/database/src/schema/auth-browser-sessions.ts`, `drizzle/0105_auth_browser_sessions_s1.sql`, journal
- `packages/environment` — `FORGE_AUTH_SESSION_*` optional fields

### Authorization gates / RG matrix
- `industrial-authz-matrix.http.test.ts`
- `auth-context.security.test.ts` (hosted-dev Bearer required)
- `tenant-switch.ts` (+ tests)
- `demo-tenant.test.ts`, SMS dry-run test

### FIS-M01 — CSP
- `forge-static-hosting.ts`, `forge-static-hosting-csp.ts`, hosting wrappers, CSP tests
- `theme-boot.js` + layout references (industrial/field/creator)

### FIS-L01 — Public branding
- `login-branding.service.ts`, `login-branding.public-schema.ts` (+ test)
- client vanity / login branding hooks

### FIS-L02 — Legacy hostname
- Industrial `legacyRedirects` in CF viewer-request (301 + strip auth query keys)
- Comments on alias scripts (aliases retained)

## Post-change test commands

| Command | Result |
|---------|--------|
| `pnpm --filter @forge/web-kit test` | **58/58 passed** |
| platform-api auth-session + security + matrix + branding + demo + presentation | **see vitest slices** |
| `vitest run test/forge-static-hosting-csp.test.ts` | **3/3 passed** |
| `node scripts/verify-forge-industrial-security.mjs` | **12 PASS / 0 FAIL / 1 REVIEW** |

### verify-forge-industrial-security.sh

In-repo substitute: `node scripts/verify-forge-industrial-security.mjs`  
Latest run: **12 PASS, 0 FAIL, 1 REVIEW** (live Producers matrix). External `.sh` package still not found under Downloads.

## Release gates RG-01 … RG-10

| Gate | Status | Evidence |
|------|--------|----------|
| RG-01 Cross-tenant isolation | **PARTIAL** | Synthetic HTTP matrix pass; live Producers **not** run (no approved creds) |
| RG-02 Tenant-header validation | **PARTIAL** | Matrix HDR-DENY + TenantGuard; live pending |
| RG-03 Dev-principal rejection | **PASS (code)** | `allowsDevPrincipalHeader` fail-closed; security tests assert Bearer required for hosted development without flag |
| RG-04 Anonymous API rejection | **PASS (code)** | Matrix ANON + existing production probe evidence in audit pack |
| RG-05 Role/permission enforcement | **PARTIAL** | Matrix roles on representative families; not every route |
| RG-06 Object-level authorization | **PARTIAL** | Cross-tenant NOT_FOUND fixture; broader IDOR suite still open |
| RG-07 Production secret exposure | **REVIEW** | No secret rotation/deploy in this task; dependency audit not re-run as clearance |
| RG-08 Deployment security (CSP) | **PASS (code)** | CSP unit tests: no script `unsafe-inline`; connect-src not bare `https:` |
| RG-09 Logout/offline data | **PASS (code)** | Cleanup registry + industrial/field purge + `rg09-browser-cleanup.matrix.test.ts` (logout/tenant-switch/XSS scan); verify script PASS |
| RG-10 Presentation containment | **PASS (code)** | `presentation-containment.test.ts` (demo safety flags, Reset Demo gate, SMS dry-run, walkthrough perms, MP4 tenant scope); live presentation walkthrough still optional |

## Remaining limitations

1. Live Producers Rice Mill authenticated matrix still requires approved credentials (audit blocker).
2. `verify-forge-industrial-security.sh` missing from remediation package path searched.
3. DB migration `0105` must be applied in each environment before session BFF is live.
4. `FORGE_AUTH_SESSION_ENCRYPTION_KEY` must be set outside local/testing.
5. CloudFront `/api` proxy + legacy alias association require Frontend stack deploy (**NOT EXECUTED**).
6. `style-src 'unsafe-inline'` retained intentionally.
7. Full offline IndexedDB/Cache Storage inventory for RG-09 remains incomplete for non-Field apps only; Field wipe is implemented. Optional Playwright RG-09 browser matrix still open.

## Development rollback

1. Revert commits on `security/industrial-fis-sec-audit-001` or reset to baseline `54a4742b3736f9bccdb052ba308811b5547301d8` (only if discarding this branch work intentionally).
2. Clear industrial host cookies; run logout / `purgeLegacyAuthKeys`.
3. Roll back or skip migration `0105_auth_browser_sessions_s1` if applied locally.
4. Redeploy prior Frontend/API artifacts if a non-prod deploy had been made (none in this task).

## Production plan (**NOT EXECUTED**)

1. Review + approve evidence; apply migration `0105` via approved migrate path.
2. Set `FORGE_AUTH_SESSION_ENCRYPTION_KEY` via Secrets Manager / task def (use aws-secrets-manager skill; do not print secret).
3. Deploy API then Frontend (industrial CF behaviors + CSP + legacy redirect).
4. Confirm alias scripts still map legacy host if cert/domainNames require it.
5. Smoke: login, refresh, logout, tenant switch, walkthrough, CSP console clean.
6. Monitor 401/403 rates and session table growth; revoke via `logout-all` if needed.
7. Rollback: redeploy previous task defs + frontend; clear sessions table; keep legacy host mapping.

## Confirmation

**Production was not deployed or changed** in this remediation. No production secrets were rotated, no production data modified, no worker service changes, no hostname/distribution deletions.
