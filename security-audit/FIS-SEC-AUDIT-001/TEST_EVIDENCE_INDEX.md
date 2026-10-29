# Test Evidence Index — FIS-SEC-AUDIT-001

**Commit:** `54a4742b3736f9bccdb052ba308811b5547301d8`  
**Date:** 2026-09-17

| Evidence ID | Description                                        | Location                                             | Result                                            |
| ----------- | -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| EV-001      | Production anonymous `/api/v1/auth/me`             | Live curl; also `evidence/rg03-rg04-cors.txt`        | HTTP 401 Bearer required                          |
| EV-002      | Production forged `x-forge-dev-principal`          | Live curl + Node HTTPS                               | HTTP 401 Bearer required                          |
| EV-003      | Development forged principal (valid JSON)          | Node HTTPS to `api-dev`                              | HTTP 401 `User not found` (principal path active) |
| EV-004      | Health environment labels                          | Live `/health`                                       | prod=`production`, dev=`development`              |
| EV-005      | Industrial security headers                        | `curl -I https://industrial.forgepublicsafety.com`   | HSTS/CSP/nosniff/frame deny present               |
| EV-006      | Producers vanity security headers                  | `evidence/rg03-rg04-cors.txt`                        | Same class of headers                             |
| EV-007      | CORS evil vs industrial Origin                     | `evidence/rg03-rg04-cors.txt`                        | Evil: no ACAO; Industrial: ACAO set               |
| EV-008      | Auth context security unit tests                   | `evidence/auth-context-security-vitest.txt`          | 8/8 pass                                          |
| EV-009      | Select-tenant / QR / config isolation units        | `evidence/more-security-vitest.txt`                  | 15 pass, 1 fail (platform-admin shadow)           |
| EV-010      | Live industrial first-load JS scan                 | `evidence/bundle-scan.txt`                           | No ALLOW_DEV_TRUE / AKIA in sampled scripts       |
| EV-011      | pnpm production audit                              | `evidence/pnpm-audit-prod.txt`                       | 37 vulns (2 critical / 16 high)                   |
| EV-013      | Public QR client `permissions` source confirmation | Controller/service/scan-actions citations; explorers | Critical FIS-SEC-010 confirmed                    |

## Commands and interpretation

### Command: Production anonymous auth

```text
Command: curl.exe -sS https://api.forgepublicsafety.com/api/v1/auth/me
Working directory: repo root
Exit code: 0 (HTTP 401)
Result: {"error":{"code":"UNAUTHORIZED","message":"Authorization Bearer token required",...}}
Audit interpretation: RG-04 PASS on production.
```

### Command: Production forged principal (Node)

```text
Command: node HTTPS GET /api/v1/auth/me with x-forge-dev-principal JSON, no Authorization
Working directory: repo root
Exit code: 0 (HTTP 401)
Result: Authorization Bearer token required
Audit interpretation: RG-03 PASS on production.
```

### Command: Development forged principal (Node)

```text
Command: node HTTPS GET https://api-dev.forgepublicsafety.com/api/v1/auth/me with x-forge-dev-principal JSON
Working directory: repo root
Exit code: 0 (HTTP 401)
Result: User not found
Audit interpretation: RG-03 FAIL for hosted development — header accepted as auth path (FIS-SEC-001).
```

### Command: Auth security vitest

```text
Command: pnpm --filter @forge/platform-api exec vitest run src/modules/auth-context/auth-context.security.test.ts
Working directory: repo root
Exit code: 0
Result: 8 passed
Audit interpretation: Production-mode unit expectations for missing/invalid tokens and disabled users hold in test doubles.
```

### Command: Additional security vitests

```text
Command: pnpm --filter @forge/platform-api exec vitest run src/configuration-tenant-isolation.unit.test.ts src/modules/auth-context/auth-context.select-tenant.test.ts src/modules/auth-context/auth-context.platform-admin-shadow.test.ts src/modules/industrial/qr-token.security.test.ts
Working directory: repo root
Exit code: 1
Result: 15 passed, 1 failed (platform-admin shadow)
Audit interpretation: Tenant select membership rules covered; platform-admin edge case uncertain (FIS-SEC-006).
```

### Command: Dependency audit

```text
Command: pnpm audit --prod
Working directory: repo root
Exit code: non-zero (vulnerabilities present)
Result: 37 vulnerabilities (2 critical, 16 high, 15 moderate, 4 low)
Audit interpretation: Requires reachability triage; recorded as FIS-SEC-003.
```

## Manual matrix status

| Test                                            | Result                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Anonymous protected API                         | PASS (prod)                                                                        |
| Forged `x-forge-dev-principal` without auth     | PASS (prod) / FAIL (api-dev)                                                       |
| Valid Producers user + foreign `x-tenant-id`    | BLOCKED                                                                            |
| Valid user + foreign object ID                  | BLOCKED                                                                            |
| Normal user → tenant-admin endpoint             | BLOCKED                                                                            |
| Tenant admin → platform-admin endpoint          | BLOCKED                                                                            |
| Disabled user authenticated action              | Covered in unit tests; live BLOCKED                                                |
| Unauthorized CORS origin                        | PASS (no ACAO)                                                                     |
| Logout + back navigation                        | BLOCKED                                                                            |
| Tenant switch stale request                     | BLOCKED                                                                            |
| Offline queued mutation scope                   | BLOCKED                                                                            |
| Foreign attachment / signed URL                 | BLOCKED                                                                            |
| Import foreign tenant ID                        | BLOCKED (source review only)                                                       |
| Protected role fields mass assignment           | BLOCKED (source review partial)                                                    |
| Public QR enumeration                           | FAIL on authz model — client `permissions` trusted (FIS-SEC-010, source-confirmed) |
| Public QR history with forged admin permissions | Source-confirmed bypass path; live exploit not executed against prod               |
| Frontend production bundle scan                 | PARTIAL PASS (sampled)                                                             |
| Security headers live                           | PASS WITH CONDITIONS                                                               |

No production tokens, cookies, or personal data are stored in this evidence folder.
