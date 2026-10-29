# NERIS Phase 2 — Final Acceptance Report

**Decision:** `ACCEPTED`  
**Report date:** 2026-07-26  
**Environment:** AWS development  
**Prepared by:** Engineering (agent-assisted closeout)  
**Phase 3:** Not started (explicit stop)

---

## 1. Executive summary

Phase 2 (Core Incident Shell + MANUAL_ONLY intake) is **accepted** for the development environment after Cognito-backed browser/API verification, cross-tenant isolation with a second synthetic tenant, FORCE RLS validation under the `forge_app` runtime role, HTTPS/security-header checks, CloudWatch evidence, and a full deployed Playwright suite (**13/13 passed, 0 skipped**).

Runtime database access was switched from Aurora master `forge_admin` (BYPASSRLS) to `forge_app` so FORCE RLS applies. Cross-tenant isolation was proven through Cognito identities, HTTPS API authorization, and PostgreSQL RLS.

---

## 2. Deployed RMS URL

https://d3ud5uzwd9js2z.cloudfront.net

CloudFront distribution: `E2LZJLH664YX70`  
S3 bucket: `forge-development-rms-511343547817-us-east-1`

## 3. Secure API URL

https://d108fstxdv69bo.cloudfront.net

(ADR-036 CloudFront HTTPS edge → ALB HTTP origin)  
Health: `GET /health` → **200**

## 4. AWS account and region

| Field           | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| Account         | `511343547817`                                               |
| Region          | `us-east-1`                                                  |
| CLI profile     | `forge-dev` (SSO)                                            |
| API ECS service | `forge-development-ecs-platform-api` task definition **:14** |

## 5. Synthetic tenants used

| Key                  | Tenant ID                              | Purpose                                         |
| -------------------- | -------------------------------------- | ----------------------------------------------- |
| `rms-synthetic-fd`   | `019f9e06-a0b2-75f4-9e0b-5ae9befd8193` | Primary acceptance tenant (Synthetic Valley FD) |
| `rms-synthetic-fd-b` | `019fa017-c632-74ae-b70b-672711c72f20` | Isolation tenant (Synthetic Ridge FD)           |

Seeded via `scripts/run-ecs-seed-rms.mjs` (A) and `packages/database/src/seed-rms-synthetic-b.ts` / `scripts/run-ecs-seed-rms-isolation-tenant.mjs` (B).

## 6. Cognito test identities and roles (no credentials)

| Email                        | Cognito sub                            | App user                               | Tenant               | Role                    |
| ---------------------------- | -------------------------------------- | -------------------------------------- | -------------------- | ----------------------- |
| `admin@rms-synthetic.test`   | `b4383438-00b1-708a-b31d-f34daaa05c62` | `019f9e06-a0b2-75f4-9e0b-6334f1f14039` | `rms-synthetic-fd`   | `RMS_SYNTHETIC_ADMIN`   |
| `admin@rms-synthetic-b.test` | `544854e8-f0a1-7082-ca0f-e1a26122aa2c` | `019fa017-c632-74ae-b70b-6b5cf32fc839` | `rms-synthetic-fd-b` | `RMS_SYNTHETIC_ADMIN_B` |

User pool: `us-east-1_VYjUFLXG4`  
RMS client: `6ad44jqh9pbibkao8lqcqu4mnv`

Credentials stored only in local gitignored `apps/rms-web-e2e/.env.e2e.local` (not committed).

## 7. Playwright test totals

**Command:**

```bash
cd apps/rms-web-e2e
# env from .env.e2e.local
npx playwright test --project=chromium
```

**Result (2026-07-26):** **13 passed, 0 failed, 0 skipped** (~1.3m)

| Spec                                      | Result |
| ----------------------------------------- | ------ |
| Autosave persist after refresh `@smoke`   | PASS   |
| Dual-context save conflict `@smoke`       | PASS   |
| Cognito Hosted UI login `@smoke`          | PASS   |
| Cross-tenant isolation (7 tests) `@smoke` | PASS   |
| Manual incident + overview `@smoke`       | PASS   |
| Mobile viewport `@smoke`                  | PASS   |
| Officer review → finalize → locked edits  | PASS   |

## 8. Exact cross-tenant results

**Suite:** `apps/rms-web-e2e/tests/isolation.spec.ts`  
**Auth:** Real Cognito Hosted UI for both users (no `x-forge-dev-principal`)

| Check                                                                       | Result                         |
| --------------------------------------------------------------------------- | ------------------------------ |
| Tenant B cannot open Tenant A incident in UI                                | PASS (denied / failed-to-load) |
| Tenant B list excludes Tenant A incident id                                 | PASS                           |
| Tenant B `GET` A incident under B tenant path                               | PASS (403/404)                 |
| Tenant B `GET` with A `tenantId` in URL                                     | PASS (**403** tenant mismatch) |
| Tenant B PATCH / submit / approve / finalize / void / archive on A incident | PASS (403/404)                 |
| Tenant B list A stations / units / personnel / configuration                | PASS (403/404)                 |
| Spoofed `x-tenant-id` header to A                                           | PASS (still denied)            |

## 9. RLS verification

**Command:** `node scripts/phase2-verify-rls.mjs` (ECS one-off)

**Result after `forge_app` cutover:**

```json
{
  "ok": true,
  "currentUser": "forge_app",
  "sessionUser": "forge_app",
  "databaseUrlUser": "forge_app",
  "relForceRowSecurity": {
    "neris_incidents": { "rowSecurity": true, "forceRls": true },
    "rms_stations": { "rowSecurity": true, "forceRls": true }
  },
  "fakeTenantIncidentCount": 0,
  "otherTenantCanSeeSyntheticIds": []
}
```

**Pre-cutover (failed / evidence of bypass):** under `forge_admin`, `fakeTenantIncidentCount` was **42** despite FORCE RLS flags — Aurora master has BYPASSRLS behavior. This motivated the runtime role switch.

Local CI suite: `pnpm --filter @forge/database test:rls` (`tenant-isolation.integration.test.ts`).

## 10. Database runtime-role verification

| Check                               | Result      | Evidence                                                                                                             |
| ----------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Runtime uses `forge_app`            | PASS        | Task def `:14` `DATABASE_SECRET_ARN` → `forge-development-secrets-database-app-*`; RLS probe `currentUser=forge_app` |
| Not table-owner / master            | PASS        | Master remains `forge_admin` for migrations only                                                                     |
| `forge_app` cannot bypass FORCE RLS | PASS        | Cross-tenant counts = 0 under `withTenantTransaction`                                                                |
| Secret provision                    | PASS        | `scripts/phase2-provision-forge-app.mjs`                                                                             |
| CDK follow-through                  | DONE (code) | `ForgeDatabase.appSecret` + Compute `appDatabaseSecret` wiring                                                       |

## 11. HTTPS verification

| Check                          | Result                                                                |
| ------------------------------ | --------------------------------------------------------------------- |
| RMS HTTPS                      | PASS (`https://d3ud5uzwd9js2z.cloudfront.net/` → 200)                 |
| API HTTPS                      | PASS (`https://d108fstxdv69bo.cloudfront.net/health` → 200)           |
| HTTP → HTTPS (RMS)             | PASS (`http://…` → **301** Location HTTPS)                            |
| HTTP API CF                    | **403** (viewer protocol policy rejects HTTP; not open cleartext API) |
| TLS certificate                | PASS (browser/CloudFront managed)                                     |
| No mixed content               | PASS (RMS built with `NEXT_PUBLIC_API_URL=https://d108…`)             |
| No raw ALB URL in frontend out | PASS (`NO_ALB_IN_OUT`)                                                |

**Command:** `node scripts/phase2-verify-headers.mjs`

## 12. Security headers

Exact headers from closeout run:

### RMS (`HEAD https://d3ud5uzwd9js2z.cloudfront.net/`)

- `strict-transport-security: max-age=31536000; includeSubDomains; preload`
- `content-security-policy: default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https:; form-action 'self' https:`
- `x-content-type-options: nosniff`
- `referrer-policy: strict-origin-when-cross-origin`
- `x-frame-options: DENY`
- `permissions-policy: camera=(), microphone=(), geolocation=()`

### API (`HEAD https://d108fstxdv69bo.cloudfront.net/health`)

- `strict-transport-security: max-age=31536000; includeSubDomains; preload`
- `content-security-policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`
- `x-content-type-options: nosniff`
- `referrer-policy: strict-origin-when-cross-origin`
- `x-frame-options: DENY`
- `permissions-policy: camera=(), microphone=(), geolocation=()`

## 13. CORS results

| Origin                                  | Result                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `https://d3ud5uzwd9js2z.cloudfront.net` | `Access-Control-Allow-Origin: https://d3ud5uzwd9js2z.cloudfront.net` + `Access-Control-Allow-Credentials: true` |
| `https://evil.example`                  | **No** `Access-Control-Allow-Origin` echo (allowlist enforced)                                                  |
| Wildcard `*` with credentials           | Not used                                                                                                        |

Configured via `CORS_ORIGINS` on API task (RMS + Creator CloudFront origins).

## 14. Autosave results

- Playwright: `persists edits after refresh @smoke` — **PASS**
- Debounce timer bug fixed (`use-autosave.tsx` no longer clears timers on status→dirty)
- Indicator reaches **All changes saved**; values survive reload

## 15. Conflict-handling results

- Playwright: `dual-context edit surfaces save conflict @smoke` — **PASS**
- UI surfaces **Save conflict** + **Edit conflict** dialog (412 / If-Match)

## 16. Officer-review results

- Playwright: submit → return → correct → resubmit → approve → finalize — **PASS**
- Status path exercised: `DRAFT` → `IN_PROGRESS` → `SUBMITTED_FOR_REVIEW` → `RETURNED_FOR_CORRECTION` → … → `APPROVED` → `FINALIZED`

## 17. Finalization-lock results

- After finalize, edit attempt surfaces locked / cannot-edit / save-failed style denial — **PASS** (Playwright review workflow)

## 18. Mobile and accessibility results

| Check                                  | Result                                        |
| -------------------------------------- | --------------------------------------------- |
| Mobile viewport Playwright `@smoke`    | PASS                                          |
| rms-web axe unit tests (prior Phase 2) | PASS (2 tests)                                |
| Dedicated full axe suite on CloudFront | Not re-run this closeout; mobile shell usable |

## 19. CloudWatch evidence

| Item                    | Evidence                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Dashboard               | `ForgePlatform-Development-Overview`                                                                        |
| RMS CloudFront requests | Metric `AWS/CloudFront` `Requests` dist `E2LZJLH664YX70` — e.g. Sum **4731** in latest hour sampled         |
| Alarms (OK)             | `forge-development-alarm-api-5xx`, `api-unhealthy`, `rms-cf-5xx`, `db-cpu` (thresholds 5 / 1 / 5 / 80)      |
| Log groups + retention  | `/forge/development/platform-api` **14d**; worker **14d**; database **14d**; migration **14d**; waf **90d** |
| ECS task health         | Service stable on task def `:14`; `/health` 200                                                             |
| Controlled events       | Playwright create/autosave/review + isolation denials generated API traffic and logs                        |

Saved queries / widgets: Monitoring stack (`infrastructure/cdk/lib/constructs/forge-monitoring.ts`).

## 20. Audit-event evidence

| Mechanism                  | Status                                                                           |
| -------------------------- | -------------------------------------------------------------------------------- |
| `audit_events` table + RLS | Present (Sprint 1D/1E)                                                           |
| API                        | `GET /api/v1/tenants/:tenantId/audit-events` (`platform.audit.read`)             |
| Domain events              | Review transitions emit NERIS incident domain events (`rms.neris.incident.*.v1`) |
| Authorization denials      | `authorization_decision_log` + API 403 paths exercised by isolation suite        |

Closeout did not dump raw audit rows (PII/minimization); infrastructure and denial paths verified by tests.

## 21. Migrations deployed

Aurora journal through NERIS Phase 2 migrations (**0009** RMS master data, **0010** incident shell) applied earlier via `scripts/run-ecs-migrate.mjs` (exit 0). No new migration required for `forge_app` cutover (role existed; password/secret synced).

## 22. Feature flags enabled

On both synthetic tenants:

- `rms.neris.incident_shell.enabled`
- `rms.neris.manual_intake.enabled`
- `rms.neris.officer_review.enabled`
- `rms.neris.tenant_configuration.enabled`

## 23. Known limitations

- Development environment only (not production/gov).
- Cross-tenant isolation secondary credentials are local/gitignored (recommend GitHub Actions secrets for CI).
- Worker service still may need the same `DATABASE_SECRET_ARN` cutover confirmation on next full CDK deploy.
- Full axe/accessibility pass on every CloudFront route not repeated in this closeout.
- ALB RequestCount sample returned empty datapoints in one query window (CF metrics confirmed traffic).

## 24. Deferred Phase 3 items

- CAD adapters / CAD UI
- External NERIS / state submission
- Offline sync, AI narrative, public portals
- Creator Console migration to `@forge/web-kit` (if still outstanding)
- Production hardening / multi-region

**Do not begin Phase 3 without a separate directive.**

## 25. Security concerns

| Severity            | Item                                                                         | Disposition                                                                       |
| ------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Critical (resolved) | API connected as `forge_admin` bypassing RLS                                 | **Fixed** — runtime `forge_app` + secret `forge-development-secrets-database-app` |
| Medium              | CDK Data stack must adopt existing app secret on next deploy without clobber | Documented; construct name aligned                                                |
| Low                 | Development Cognito test users                                               | Acceptable for non-prod; rotate periodically                                      |

No open critical/high issues remain for this environment after cutover.

## 26. Product acceptance recommendation

**Recommend `ACCEPTED` for NERIS Phase 2 in AWS development.**

Criteria met: full Playwright pass including Cognito cross-tenant isolation; secure HTTPS RMS/API; required headers/CORS; `forge_app` + FORCE RLS proven; CloudWatch dashboard/alarms/logs documented; audit/authorization paths exercised.

## 27. Human sign-off section

| Role                             | Name                                      | Date       | Signature                       |
| -------------------------------- | ----------------------------------------- | ---------- | ------------------------------- |
| Engineering                      | Auto (agent) — closeout evidence recorded | 2026-07-26 | Automated verification complete |
| Product                          | _pending_                                 |            |                                 |
| Security / compliance (optional) | _pending_                                 |            |                                 |

---

### Appendix — key commands

```bash
# Headers / CORS
node scripts/phase2-verify-headers.mjs

# RLS under forge_app (ECS)
node scripts/phase2-verify-rls.mjs

# Provision forge_app secret (already applied)
node scripts/phase2-provision-forge-app.mjs

# Seed isolation tenant B
node scripts/run-ecs-seed-rms-isolation-tenant.mjs

# Link Cognito B
# RMS_E2E_COGNITO_SUB=<sub> RMS_E2E_ADMIN_EMAIL=admin@rms-synthetic-b.test \
#   RMS_SYNTHETIC_TENANT_KEY=rms-synthetic-fd-b node scripts/run-ecs-link-rms-cognito.mjs

# Playwright
cd apps/rms-web-e2e && npx playwright test --project=chromium
```
