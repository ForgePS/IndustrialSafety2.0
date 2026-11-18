# MK-S23 Production Readiness — FORGE-SAAS-CORE

**Program:** FORGE-SAAS-CORE  
**Sprint:** MK-S23  
**Date:** 2026-08-11  
**Production operations:** NONE  
**Production migrations:** NONE  
**Production AWS modifications:** NONE  
**Deferred BACKLOG work:** NONE

---

## Overall readiness verdict

```text
NOT READY
```

Unconditional **READY** is forbidden while the **MK-S22 full HTTP E2E condition remains OUTSTANDING**, and while CRITICAL production blockers below remain open.

| Field                  | Value                |
| ---------------------- | -------------------- |
| Sprint delivery status | PASS WITH CONDITIONS |
| Readiness verdict      | NOT READY            |
| MK-S22 E2E condition   | OUTSTANDING          |
| Production authorized  | NO                   |

---

## Outstanding condition from MK-S22 (mandatory carry-forward)

**MK-S22:** PASS WITH CONDITIONS — **not** a clean PASS.

**Condition:** Local Postgres/Docker was unavailable; the full HTTP lifecycle suite was authored and CI-wired but **not** executed against `forge_platform_test`.

**Required validation (isolated test DB only — never production):**

```bash
pnpm db:up
pnpm db:migrate:test
pnpm --filter @forge/platform-api test:e2e
```

**Evidence paths:** `apps/platform-api/src/mk-s22-lifecycle.e2e.test.ts`, `docs/forge-saas-foundation/MK-S22-UAT.md`.

**Rule:** Production readiness must not be scored READY or READY WITH CONDITIONS as an _unconditional_ go-live until this E2E either:

- **A.** passes locally against the isolated test database, **or**
- **B.** passes in CI against an isolated test database with retained evidence.

This document records the condition as **OUTSTANDING**.

---

## 1. Environment inventory

### 1.1 Required variables (`packages/environment`)

| Group       | Keys (names only)                                                                                                                      | Ownership              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Core        | `NODE_ENV`, `APP_ENV`, `APP_NAME`, `APP_VERSION`, `LOG_LEVEL`, `AWS_PARTITION`, `AWS_REGION`, `AWS_SECONDARY_REGION`, `AWS_ACCOUNT_ID` | Platform eng / deploy  |
| Database    | `DATABASE_URL`, `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USERNAME`, `DATABASE_SECRET_ARN`                          | DBA / CDK Data stack   |
| Cognito     | `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_DOMAIN`                                                                          | Identity stack         |
| KMS         | `KMS_GENERAL_KEY_ARN`, `KMS_SENSITIVE_DATA_KEY_ARN`                                                                                    | Security stack         |
| S3          | `S3_DOCUMENT_BUCKET`, `S3_IMPORT_BUCKET`, `S3_EXPORT_BUCKET`, `S3_AUDIT_BUCKET`                                                        | Data / frontend stacks |
| Queues      | `SQS_IMPORT_QUEUE_URL`, `SQS_NOTIFICATION_QUEUE_URL` (+ optional CAD)                                                                  | Messaging stack        |
| Public URLs | `PUBLIC_ACADEMY_URL`, `PUBLIC_RMS_URL`, `PUBLIC_CREATOR_URL`, `PUBLIC_API_URL`                                                         | Edge / DNS owners      |
| SES         | `SES_FROM_ADDRESS`                                                                                                                     | Messaging / ops        |
| Flags       | `FEATURE_FLAG_PROVIDER`; optional `CORS_ORIGINS`, `BODY_SIZE_LIMIT`, `REQUEST_TIMEOUT_MS`                                              | App config             |

**App-only (not in `@forge/environment` schema):** `BILLING_WEBHOOK_SECRET` (billing controller header verification).

### 1.2 Development / staging / production differences

| Concern               | Local / development / testing                     | Staging / production-like                        |
| --------------------- | ------------------------------------------------- | ------------------------------------------------ |
| Public URLs           | `http` allowed                                    | **HTTPS required**                               |
| `DATABASE_SECRET_ARN` | Optional (placeholder)                            | **Required ARN**                                 |
| KMS ARNs              | Min-length strings                                | Valid ARNs                                       |
| CDK account           | Real/dev account configs                          | `production.ts` still placeholder `000000000000` |
| Cognito callbacks     | localhost + `*-dev.forgepublicsafety.com`         | Still `academy.example.com` in `production.ts`   |
| ECS `APP_ENV`         | Hardcoded `"development"` in `forge-ecs.ts` today | **Must** become environment-driven before launch |
| Deploy CI             | `.github/workflows/deploy-development.yml` only   | **No** production workflow                       |

### 1.3 Missing / incomplete configuration before launch

- Real production AWS account + region mapping
- Production Cognito callback/logout URLs
- Production public HTTPS domain set for academy/RMS/creator/tenant-admin/API
- Live SES identity + provider wiring
- `BILLING_WEBHOOK_SECRET` (and provider) if billing webhooks go live
- SNS alarm subscribers
- Production OIDC deploy role + approval gate

### 1.4 Secrets that must exist before launch (names / purpose — no values)

| Secret / config                            | Purpose                    | Must exist before           |
| ------------------------------------------ | -------------------------- | --------------------------- |
| `forge-{env}-secrets-database`             | Aurora migrate/admin       | Migrate tasks               |
| `forge-{env}-secrets-database-app`         | App RLS role credentials   | API/worker boot             |
| Cognito pool/client/domain IDs in task env | Auth                       | API boot                    |
| KMS key ARNs                               | Field encryption / buckets | API + S3                    |
| `forge-{env}-cad-*` (optional)             | CAD webhooks               | CAD features                |
| SES verified identity (not yet CDK)        | Outbound mail              | Invite/notification go-live |
| `BILLING_WEBHOOK_SECRET`                   | Provider webhook auth      | Billing ingestion           |

### 1.5 Configuration ownership

| Owner                | Owns                                                           |
| -------------------- | -------------------------------------------------------------- |
| Platform engineering | Nest env schema, ECS task env, app code                        |
| Infrastructure (CDK) | Secrets naming, IAM, Cognito, Aurora, buckets, CF, WAF, alarms |
| Ops / security       | Alarm paging, production deploy approval, ACM/DNS cutover      |
| Product programs     | Firebase cutover (separate authorization)                      |

---

## 2. AWS Secrets / configuration

| System                             | Status          | Notes                                              |
| ---------------------------------- | --------------- | -------------------------------------------------- |
| Secrets Manager — DB master        | READY (pattern) | CDK `rds.DatabaseSecret`                           |
| Secrets Manager — DB app           | CONDITION       | GAP-009 import vs create; required at launch       |
| SSM Parameter Store                | N/A             | No CDK SSM parameters found                        |
| Cognito configuration              | CONDITION       | Pool ready; prod URLs placeholder                  |
| Database credentials               | CONDITION       | Dual-secret model documented; values never in docs |
| API secrets (KMS, buckets, queues) | CONDITION       | Injected via ECS task env from stack outputs       |
| Billing / webhook secrets          | GAP             | Ad-hoc env; provider often `NONE`                  |
| SES configuration                  | GAP             | Noop/stub provider; no SES CDK identity            |
| Third-party / CAD secrets          | CONDITION       | Naming convention `forge-{env}-cad-*`; optional    |

**Do not paste secret values into git, tickets, or this document.**

---

## 3. IAM review

| Check                  | Finding                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Application task roles | Separate API / worker / migrate roles (`forge-ecs.ts`)                                                   |
| Secrets access         | App + **master** secret `grantRead` on API/worker — **least-privilege CONDITION**                        |
| S3 access              | Task `grantReadWrite` documents/imports/exports — broad for prod review                                  |
| Database access        | Via secrets + security groups (private Aurora); migrate uses admin secret only                           |
| CloudWatch             | Execution role logging via managed ECS execution policy                                                  |
| Deployment roles       | Dev GitHub OIDC only; **prod deploy role GAP**                                                           |
| Lambda/service roles   | Primary compute is **ECS Fargate**, not Lambda API                                                       |
| Cross-tenant risks     | App uses FORCE RLS + AuthZ; IAM itself is account-wide (expected)                                        |
| Wildcards              | S3 deny-insecure uses `s3:*` conditioned on `aws:SecureTransport=false`; CAD secret ARN pattern wildcard |

**Launch prerequisite:** Documented least-privilege pass (drop unnecessary master-secret read from runtime API; tighten S3 prefixes if feasible).

---

## 4. Database production migration plan

**DO NOT run production migrations in this sprint.**

### 4.1 Order (logical)

1. Confirm Aurora up, deletion protection on, backup retention ≥ production profile (35d).
2. Take / confirm fresh backup / PITR window.
3. Apply Drizzle migrations via **ECS one-off migrate task** using **admin** secret only (`scripts/run-ecs-migrate.mjs`).
4. Run migrate status / RLS verification scripts against non-prod first; then production under change control.
5. Smoke API health before cutover traffic.

### 4.2 Prerequisites

- Image built/pushed
- Admin secret present
- Network path migrate task → Aurora
- Change ticket + production authorization (separate from MK-S23)

### 4.3 Downtime

- Prefer online forward migrations; expect brief connection blips during DDL
- Planned maintenance window if heavy locks anticipated (assess per migration set)

### 4.4 Backup requirements

- Pre-migrate snapshot / rely on Aurora automated backups + AWS Backup plan
- Record restore point ID before apply

### 4.5 Rollback strategy

- **Forward-only** schema policy (`docs/operations/database-migration-runbook.md`)
- Rollback = restore snapshot / PITR to pre-migrate point + redeploy prior API image
- Never “down migrate” in production

### 4.6 Verification

- Migration status complete
- RLS forced on tenant tables
- Health + auth smoke
- Spot-check invite / tenant isolation (non-destructive)

### 4.7 Schema compatibility / failure handling

- App version must be compatible with applied schema (deploy API after migrate when additive; coordinate breaking changes with dual-write/dual-read plan)
- On migrate failure: stop deploy, do not proceed to frontends; restore if DB left inconsistent

---

## 5. CloudFront review

| Topic                  | Finding                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| Distributions          | Static SPA hosts (console/RMS/tenant-admin) + API distribution          |
| Origins                | Private S3 + OAC (static); ALB HTTP_ONLY (API) until ACM cutover        |
| Caching                | Static: managed CachingOptimized (ops docs); API: **CACHING_DISABLED**  |
| SPA / static export    | CF Function + 403/404 → `/index.html` (5m error TTL)                    |
| API separation         | Separate API CF distribution; no caching of authenticated responses     |
| Auth-sensitive caching | API cache disabled — appropriate                                        |
| Security headers       | Static + API response headers policies (HSTS, frame deny, CSP variants) |
| Invalidation           | Required after `scripts/sync-static-site.mjs` sync                      |
| Deploy ordering        | Sync S3 **then** invalidate; DNS/alias after cert ready                 |

**No production CloudFront changes in MK-S23.**

---

## 6. S3 review

| Control              | Status (`forge-buckets.ts` + static hosts)                         |
| -------------------- | ------------------------------------------------------------------ |
| Frontend buckets     | Private + OAC only                                                 |
| Tenant file storage  | documents / imports / exports / audit archive                      |
| Bucket policies      | Enforce SSL; public blocked                                        |
| Public access blocks | `BLOCK_ALL`                                                        |
| Encryption           | KMS on data buckets; S3-managed on static origins                  |
| CORS                 | Not configured on data buckets (prefer CF/API paths)               |
| Lifecycle            | Import/export retention from cost profile; audit retain            |
| Versioning           | On for data buckets; off for applicationAssets                     |
| Tenant isolation     | Application-layer + object key prefixes; FORCE RLS for DB metadata |
| Presigned URLs       | App-issued; short TTL patterns in branding/docs domains            |

---

## 7. Cognito review

| Topic                   | Finding                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------- |
| User pool               | Email alias; auto-verify email                                                          |
| App clients             | Academy, RMS, Creator, Department, Student — public clients, SRP, no password auth flow |
| Callback / logout       | Config-driven; **production still example.com**                                         |
| Token lifetime          | Not overridden in CDK (service defaults) — set explicitly before launch                 |
| MFA                     | OPTIONAL                                                                                |
| Groups / claims         | Custom claims via app token enrichment — verify launch claims map                       |
| Account recovery        | EMAIL_ONLY                                                                              |
| Self signup             | Disabled in production config                                                           |
| Firebase Auth migration | **Separate program** — not in MK-S23                                                    |

**Do not modify production Cognito in this sprint.**

---

## 8. Network / API review

| Layer           | Finding                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------- |
| API surface     | ECS Fargate behind ALB (+ API CloudFront) — not API Gateway for core platform             |
| VPC             | Private Aurora; public ALB pattern in CDK                                                 |
| Security groups | Task ↔ DB restricted                                                                      |
| CORS            | Env `CORS_ORIGINS` + API CF allowlist from browser origins                                |
| Throttling      | WAF rate limits not custom-documented beyond AWS Managed CRS; launch needs rate rule plan |
| Public/private  | DB private; static via CF; ALB currently HTTP origin to CF                                |

---

## 9. Domain / DNS review

### Documented / configured hostnames (non-secret)

| Environment           | Examples found in-repo                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development           | `api-dev.forgepublicsafety.com`, `console-dev.forgepublicsafety.com`, `rms-dev.forgepublicsafety.com`, `creator-dev.forgepublicsafety.com`, `admin-dev.forgepublicsafety.com`, `industrial-dev.forgepublicsafety.com` |
| Production commercial | **Not finalized** in `production.ts` (placeholders)                                                                                                                                                                   |
| Legacy Firebase       | `forge-academy-95f84.web.app`, `rms.forgepublicsafety.com`                                                                                                                                                            |

### Targets for production planning (to be filled before launch)

| Role            | Production target (TBD) | ACM / CF notes               |
| --------------- | ----------------------- | ---------------------------- |
| Creator Console | TBD                     | CF cert in **us-east-1**     |
| Tenant Admin    | TBD                     | CF us-east-1                 |
| RMS web         | TBD                     | CF us-east-1                 |
| Academy web     | TBD                     | CF us-east-1                 |
| Platform API    | TBD                     | CF and/or ALB ACM (regional) |

**Do not change DNS in MK-S23.** Document Route53 vs external DNS ownership before cutover. Redirect strategy (Firebase → AWS) belongs to migration program.

---

## 10. ACM review

| Topic                   | Finding                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| CloudFront certificates | Must be **us-east-1**; SAN cover all SPA hosts                   |
| API / ALB certificates  | Regional ACM via `forge-edge-tls.ts` when `edge.enableHttps`     |
| Current enablement      | Development edge HTTPS often **off**; production hosts not wired |
| Renewal                 | ACM auto-renew when DNS validated                                |
| Wildcard                | Optional `*.forgepublicsafety.com` — decide before launch        |

**Do not request/alter production certs in this sprint.**

---

## 11. WAF / edge security

| Topic                | Finding                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| ALB WAF              | AWS Managed Common Rule Set when `enableWaf` (on in production profile) |
| CloudFront WAF       | **Not** established as associated — GAP                                 |
| Rate limiting        | Need explicit launch rules for auth and API                             |
| Admin route exposure | Creator Console behind Cognito; ensure WAF + auth both apply            |
| Exploit baseline     | Managed CRS present; expand with OWASP / IP reputation for launch       |

---

## 12. Observability plan

| Signal                        | Plan                                                                    |
| ----------------------------- | ----------------------------------------------------------------------- |
| CloudWatch logs               | KMS-encrypted groups (API, worker, DB, WAF, migration)                  |
| Metrics / dashboards          | `forge-monitoring.ts` dashboard + import/config ops dashboards          |
| API 5xx / latency             | ALB + optional CF 5xx alarms; add latency alarms for launch             |
| DB errors / CPU / connections | Existing CPU + connections alarms                                       |
| Auth failures                 | App logs + Cognito metrics; add anomaly alarm                           |
| Billing webhook failures      | App logs; alarm when billing live                                       |
| Email failures                | Noop today — add SES bounce/complaint + app send failures when SES live |
| Background jobs               | Worker task count + SQS DLQ / age / backlog alarms                      |

---

## 13. Launch alarms (required)

Already present (names are logical): UnhealthyTargets, Api5xx, DbHighCpu, DbConnections, Imports/Notifications/Documents/Integration DLQs, Imports backlog/age, Api/Worker RunningTasks, optional CF 5xx.

**Must add / wire before launch:**

| Alarm                   | Trigger intent                                    |
| ----------------------- | ------------------------------------------------- |
| API elevated latency    | p95/p99 over threshold                            |
| Auth anomaly            | Spike in 401/403 or Cognito failures              |
| Billing webhook failure | Provider ingest errors (when enabled)             |
| Email send failure      | SES / provider failures (when enabled)            |
| SNS subscription        | Real on-call endpoint on `forge-{env}-sns-alarms` |

---

## 14. Backup / recovery

| Item                      | Status                                                                         |
| ------------------------- | ------------------------------------------------------------------------------ |
| Aurora automated backups  | Production profile **35** days retention                                       |
| AWS Backup plan           | Daily rule; construct `deleteAfter: 14` days (align with policy before launch) |
| PITR                      | Aurora continuous backup window — use for migrate rollback                     |
| S3 versioning             | Enabled on data buckets                                                        |
| Config recovery           | CDK synth/deploy from git; secrets retained                                    |
| Infra recreation          | CDK app `@forge/infrastructure-cdk`                                            |
| Firebase source retention | **Required** until AWS cutover accepted (`docs/program/governance.md`)         |

---

## 15. Disaster recovery

| Topic                 | Documented assumption                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Restore procedure     | Snapshot / PITR restore to new cluster → re-point secrets → migrate verify → redeploy tasks → smoke |
| Critical dependencies | Cognito, Aurora, Secrets Manager, KMS, S3, CF, SES (future), DNS/ACM                                |
| RPO / RTO             | **Not measured** — CONDITION; run restore drill                                                     |
| Emergency rollback    | Prior ECS task definition + CF/S3 prior object versions + DNS revert; DB only via restore           |
| Multi-region          | `secondaryRegion` declared; **no** multi-region stacks yet — RTO assumes single-region rebuild      |

---

## 16. Production deployment sequence

Adapt to discovered stacks (`bin/forge-platform.ts`):

| Stage | Action                                                 | Gate                                |
| ----- | ------------------------------------------------------ | ----------------------------------- |
| A     | Prerequisite AWS account, OIDC deploy role, networking | Config validated                    |
| B     | Secrets (DB master/app) + KMS                          | Secrets exist; no values in CI logs |
| C     | Database backup / PITR checkpoint                      | Restore point recorded              |
| D     | Schema migrations (ECS migrate, admin secret)          | Status OK; RLS verify               |
| E     | Platform API (ECS service)                             | `/health` green                     |
| F     | Background workers                                     | RunningTaskCount + DLQ quiet        |
| G     | Cognito / auth config confirmation                     | Callbacks match production domains  |
| H     | S3 / storage confirmation                              | Buckets private + encrypted         |
| I     | Frontend static sync (console, RMS, tenant-admin)      | Sync complete                       |
| J     | CloudFront invalidation                                | Invalidation complete               |
| K     | DNS / domain aliases (only when authorized)            | Certs ISSUED                        |
| L     | External webhooks (billing/CAD)                        | Secrets set; test ingest            |
| M     | Smoke testing (section 18)                             | Checklist signed                    |
| N     | Production UAT (section 19)                            | Checklist signed                    |

**MK-S23 does not execute this sequence.**

---

## 17. Rollback plan (by stage)

| Stage                    | Trigger             | Action                                                | Data implications     | Verify               |
| ------------------------ | ------------------- | ----------------------------------------------------- | --------------------- | -------------------- |
| Migrate                  | Failed DDL / verify | Stop; PITR/snapshot restore                           | Data rewound          | Migrate status + RLS |
| API / worker             | Health / 5xx spike  | ECS previous task def (circuit breaker may auto-roll) | None if schema compat | `/health`, auth      |
| Frontend                 | Bad UI              | Re-sync prior artifact + invalidate                   | None                  | Page load, login     |
| CloudFront / DNS         | Mis-route           | Revert alias / distribution config                    | Traffic path only     | Edge curl HTTPS      |
| Secrets rotation mistake | Auth/DB fail        | Restore previous secret version                       | Brief reconnect       | DB connect / Cognito |

**Database compatibility:** App rollback without schema down-migrate only if schema remains backward compatible.

---

## 18. Smoke test plan (post-deploy)

Non-production first; production only under separate authorization.

| Check               | Pass criteria                                                            |
| ------------------- | ------------------------------------------------------------------------ |
| App loads           | Creator Console, Tenant Admin, RMS shells 200                            |
| Login / logout      | Cognito hosted UI / app flows succeed                                    |
| Tenant selection    | `/api/v1/auth/me` + select-tenant                                        |
| RBAC                | Admin allowed; restricted role denied                                    |
| Module entitlements | Disabled module denied                                                   |
| Notifications       | In-app list (email optional until SES)                                   |
| Storage             | Upload/download or branding asset signed URL                             |
| APIs                | Key platform GETs 200 with authZ                                         |
| Billing             | Overview read-only if enabled; **no** live charge tests without approval |
| Audit               | Recent events visible for admin                                          |

---

## 19. Post-deploy UAT (production-safe)

- Prefer read-only probes and synthetic tenants
- Do **not** mutate real customer records unnecessarily
- Reuse MK-S22 lifecycle steps only against synthetic tenant
- Sign evidence into change ticket

**Blocked from claiming complete** until MK-S22 e2e condition is resolved in non-prod (A or B).

---

## 20. Customer data migration readiness (dependency)

MK-S23 documents dependency only — **does not** perform Firebase → AWS customer migration.

| Dependency                              | Notes                                                  | Docs                                                         |
| --------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| Firestore                               | Still SoT for Academy / some products                  | `docs/discovery/data-migration-inventory.md`                 |
| Firebase Auth                           | Cognito cutover separate; industrial P2 evidence paths | `docs/discovery/firebase-inventory.md`, ind-11 auth evidence |
| Firebase Storage                        | S3 copy/cutover separate                               | ind-11 storage evidence                                      |
| Reconciliation                          | Required before authoritative AWS SoT                  | Industrial/program cutover plans                             |
| Final delta / cutover                   | Requires explicit authorization                        | `docs/program/governance.md`                                 |
| Firebase rollback / read-only retention | Retain Firebase until AWS accepted; no silent delete   | governance + coexistence decisions                           |

---

## 21. Architecture / security / AWS readiness summary

| Domain                                        | Score                                             |
| --------------------------------------------- | ------------------------------------------------- |
| Architecture (shared Aurora + RLS + ECS + CF) | READY (pattern)                                   |
| Environment                                   | CONDITION / GAP (prod placeholders, APP_ENV)      |
| AWS IaC                                       | CONDITION                                         |
| Security (AuthZ, RLS, WAF baseline)           | CONDITION (CF WAF, least privilege)               |
| Database                                      | CONDITION (migrate plan ready; restore drill GAP) |
| Deployment sequence                           | READY (documented) — execution NOT authorized     |
| Rollback                                      | CONDITION (doc ready; drills pending)             |
| Monitoring / alarms                           | CONDITION (SNS subscribers + latency/auth/email)  |
| Backups                                       | CONDITION (construct ready; drill GAP)            |
| Email / SES                                   | GAP                                               |
| MK-S22 E2E                                    | OUTSTANDING                                       |

---

## 22. Production blockers

1. **MK-S22 full HTTP E2E** not executed against isolated test DB (local or CI evidence).
2. **SES** noop/stub — no production email.
3. **Production CDK config** placeholders (account, Cognito URLs, domains).
4. **ECS `APP_ENV` hardcoded** to `development`.
5. **No production deploy CI / approval guard**.
6. **Backup restore drill** not evidenced.
7. **ALB HTTPS / ACM / DNS** production front-door not finalized.
8. **CloudFront WAF** not established.
9. **SNS on-call subscribers** placeholder.
10. **Firebase → AWS customer-data cutover** not complete (separate authorization).

---

## 23. Launch prerequisites (checklist)

- [ ] MK-S22 `test:e2e` PASS with retained evidence (A or B)
- [ ] SES verified + live provider + IAM
- [ ] Production account/domains/Cognito URLs real
- [ ] ECS task env `APP_ENV` = production
- [ ] Production OIDC deploy + human approval
- [ ] Pre-launch backup + restore drill signed
- [ ] ACM issued for all SPA + API hostnames
- [ ] DNS cutover plan + rollback owner
- [ ] WAF rate limits + CF WAF decision
- [ ] Alarm SNS → on-call
- [ ] Least-privilege IAM review signed
- [ ] Explicit **production authorization** for deploy/migrate/DNS
- [ ] Customer data migration/cutover authorization (if serving migrated tenants)

---

## Verdict (directive allowed values)

```text
NOT READY
```

Rationale: MK-S22 E2E condition OUTSTANDING + CRITICAL blockers (SES, prod config, APP_ENV, prod deploy path). Platform is production-_shaped_ and this sprint completed planning/docs only.

---

## Explicit non-goals honored

- No production deploy, migrate, or AWS resource mutation
- No deferred BACKLOG implementation
- No unrelated features
- No silent upgrade of MK-S22 to clean PASS
- No Firebase customer-data migration execution
