# Integrating 2.0 into the 1.0 platform

Status: plan, not started. Nothing in the 1.0 repository or AWS account has been changed.

## Decisions

| Question | Decision |
|---|---|
| How 2.0 lives inside 1.0 | 2.0 runs as its own service in 1.0's AWS, behind the same domain and login. 1.0's menu lists 2.0 modules. |
| Login | 1.0's Cognito for everything. 2.0 stops using Supabase Auth. |
| Data | 2.0 tables live in their own schema in 1.0's Aurora PostgreSQL. 1.0 owns shared records (tenants, sites, people); 2.0 receives copies. |
| Modules in both versions | 1.0 stays the default. A Creator switch moves one tenant's module to 2.0, after its data is migrated. |

Because of these choices, 2.0 keeps its own codebase and release cycle. A 2.0 release reaches 1.0 as a new container image plus its own migrations, so 2.0 features are never rebuilt in 1.0's code.

## Where the two platforms differ

| | 1.0 (forge-platform) | 2.0 (IndustrialSafety2.0) |
|---|---|---|
| Web | Next.js static export SPAs on S3 + CloudFront | Next.js server app (server components, server actions, 27 API routes) |
| API | NestJS `platform-api` on ECS | None; pages and actions query the database directly |
| Database | Aurora PostgreSQL 15, Drizzle, journal `0000`–`0114` | Supabase Postgres, 78 timestamped SQL migrations, about 24k lines |
| Tenancy | `tenant_id`, RLS forced through `SET LOCAL app.current_tenant_id` | `organization_id`, filtered in app code under the service role |
| Auth | Cognito, `__Host-forge-session` cookie, same-origin `/api` | Supabase Auth cookies; 281 references to `auth.users`, 71 to `auth.uid()` |
| Permissions | `industrial.<domain>.view/manage/approve`, `tenant_module_entitlements`, `feature_definitions` | `forge_permission_registry`, tenant roles and overrides, scopes, `forge_feature_registry` |
| Files | S3 | Supabase Storage (`forge-evidence`, `forge-support`, `forge-training`, `forge-wc-forms`) |
| Scheduling | Worker service with SQS | Three cron endpoints with bearer secrets; no scheduler configured |
| Deploy | Scripts: ECR, ECS task definition, ECS migrate task, static site sync | No hosted deployment |

2.0 has almost no Vercel coupling. Its Supabase coupling is heavy:

- about 1,370 `.from()` calls and 54 RPCs across 200 files, with no data-access layer;
- 117 security-definer functions;
- pgvector;
- Supabase Auth and Storage.

## Target architecture

```
                       CloudFront (one domain)
             ┌────────────────┼────────────────────┐
         /  (1.0 SPAs)     /api/*  (1.0)        /v2/*  (2.0)
         S3 static         NestJS on ECS        2.0 Next.js on ECS
                               │                   │   │
                               │            PostgREST sidecar (phase 1)
                               ▼                   ▼
                     Aurora PostgreSQL ── schema public (1.0) | schema forge2 (2.0)
                               │
                 SQS: shared-record events (tenant, site, person) ──► 2.0 sync worker
```

- **One domain.** 2.0 is served under a path prefix (`/v2`, set with 2.0's existing `BASEPATH`). The Cognito session cookie is `__Host-` and SameSite=Strict, so 2.0 has to be on the same host to receive it.
- **Login.** 2.0 reads the `__Host-forge-session` cookie and verifies the Cognito JWT with the same issuer and keys as `platform-api`. The Cognito `sub` maps to a 2.0 user row. Sign-in, sign-out and password flows stay in 1.0.
- **Database.** 2.0's migrations run into a `forge2` schema on the same Aurora cluster, under a dedicated database role that cannot write 1.0's tables. 2.0 keeps its own migration ledger, separate from Drizzle's journal. That avoids the journal `when` ordering problem and keeps 2.0 releases independent of 1.0's.
- **Data access, phase 1.** A PostgREST container runs next to 2.0 against the `forge2` schema. supabase-js talks to PostgREST, so the 1,370 existing queries keep working unchanged. Swapping to a typed data layer can then happen gradually instead of blocking the move.
- **Files.** A storage adapter replaces `supabase.storage` (12 files) with S3 under a `forge2/` prefix, keeping the bucket names as key prefixes.
- **Scheduling.** EventBridge Scheduler calls the three cron endpoints with secrets from Secrets Manager.
- **AI.** The OpenAI key and model settings move to Secrets Manager. 1.0's rule against direct OpenAI imports covers 1.0's own code; 2.0 keeps its provider interface as a separate service.

## Shared records

1.0 is the owner of tenants, sites (locations, divisions) and people. 2.0 keeps copies so its foreign keys, scopes and roles keep working.

- **Mapping table.** `forge2.platform_links` maps 1.0 `tenant_id` → 2.0 `organization_id`, 1.0 site ids → 2.0 `locations`/`divisions`, and Cognito `sub` / 1.0 user id → 2.0 user id.
- **How changes flow.** 1.0 publishes a change event on SQS when a tenant, site or person changes. A 2.0 sync worker applies it idempotently. A nightly full reconcile catches anything missed.
- **One direction.** These records are read-only in 2.0's UI once a tenant is linked. Edits happen in 1.0.
- **Users.** On Aurora, 2.0's `auth.users` references point at `forge2_auth.users`, a stand-in table that carries the Cognito `sub` and is filled by the sync. `auth.uid()` becomes `forge2_auth.uid()`, which reads the same request claims PostgREST sets. Both come from `integration/aurora/00_platform_shim.sql`, so no 2.0 migration has to change.

## Modules in both versions

1. 1.0's `INDUSTRIAL_MODULE_REGISTRY` and `tenant_module_entitlements` gain a "served by" value: `v1` (default) or `v2`.
2. When a tenant's module is `v2`, industrial-web's menu entry links to the `/v2/...` route, and 1.0's own screens for that module become read-only for that tenant.
3. Before the switch, a migration job copies that tenant's records for the module from 1.0's `industrial_*` tables into 2.0. 1.0's provenance columns (`source_collection`, `source_document_id`) give each record a stable key, so the job can run repeatedly without duplicating rows. 2.0 records keep that key in a `forge2.legacy_record_links` table.
4. The switch is allowed only after the job reports zero unmapped records, which follows the parity matrix rule of zero silent data loss.
5. Switching back to `v1` is possible until 2.0 has accepted new writes for that module. After that, going back needs a reverse copy.

Modules that only 2.0 has (Forge AI Command Center, help desk, and so on) need no migration. They show up in 1.0's menu once the tenant is entitled.

## How future 2.0 work reaches 1.0 as an update

Every 2.0 change must ship as one versioned release that deploys into 1.0's AWS without any code change in 1.0. The rules below make that hold.

### The release

- 2.0 CI builds one container image per release, tagged with the version and commit, and pushes it to 1.0's ECR.
- A migrate task applies that release's `forge2` migrations, then the ECS service rolls to the new image. This mirrors 1.0's existing deploy scripts.
- Each release carries an **integration manifest** (`integration/manifest.json`). It lists the release's modules, routes, permission keys, feature flags and menu entries. 1.0 reads it at deploy time to register new menu entries, permission codes and feature definitions, so a new 2.0 module appears in 1.0 without a 1.0 code change.

### Guards in 2.0 CI

Every pull request must pass these checks before it can merge:

- **Portable SQL.** No new references to `auth.*`, `storage.*` or Supabase roles (`anon`, `authenticated`). Every object goes in the `forge2` schema.
- **Aurora parity.** All migrations apply cleanly to plain PostgreSQL 15 with only the extensions Aurora offers (pgcrypto, vector, btree_gist).
- **Manifest.** Every new route, permission and flag in code appears in the manifest, and the reverse.
- **No direct platform calls.** New code reaches auth, files and the scheduler only through the adapters.
- **Contract test.** A test signs in with a Cognito-shaped token, opens each manifest route under `/v2`, and checks tenant isolation.

### Versioning

- **Version numbers.** Releases use semantic versions. A minor release adds things; a major release removes or renames a route, permission or table.
- **Migrations.** Migrations only add. A column or table is dropped one release after the code stops using it, so rolling back one image never breaks the schema.
- **Changelog.** Each release has a changelog section listing anything that needs 1.0 attention.

## Phases

Phases 0–2 happen only in the 2.0 repository and need nothing from 1.0. Phases 3 and later change the 1.0 repository or AWS, and each one waits for your approval.

| Phase | Where | Work | Done when |
|---|---|---|---|
| 0 Portability groundwork | 2.0 | Migration translator and Aurora shim (`forge2`, `forge2_auth`, `forge2_ext`, `forge2_*` roles, own ledger), storage and identity adapters, integration manifest, CI guards, env list cleanup. See "Phase 0 as built" | All suites pass on a fresh reset with the new guards on, and the Aurora rehearsal passes |
| 1 Cognito sign-in | 2.0 | Auth adapter that verifies Cognito JWTs; local mode with a test issuer | 2.0 runs locally with Cognito-shaped tokens and no Supabase Auth |
| 2 Aurora rehearsal | 2.0 + local containers | Run 2.0 on plain Postgres 15 + PostgREST + S3-compatible storage (MinIO) | Full test sweep passes off Supabase |
| 3 Infrastructure | 1.0 repo (CDK), staging | ECS service, CloudFront `/v2/*` behaviour, `forge2` role, PostgREST, S3 prefix, EventBridge, secrets | 2.0 serves under `/v2` in staging with 1.0 login |
| 4 Shared-record sync | 1.0 + 2.0, staging | Change events from 1.0, 2.0 sync worker, nightly reconcile | A staging tenant's sites and people match in both |
| 5 First module | Staging, one tenant | Forge AI Command Center in 1.0's menu for a test tenant | Usable end to end in staging |
| 6 Module switch | 1.0 + 2.0 | "Served by" setting, Creator switch, per-module migration job (first: Incidents) | One staging tenant moved to 2.0 Incidents with zero unmapped records |
| 7 Production | Production, with your approval at each step | Same as staging, one tenant at a time | First production tenant live |

## Phase 0 as built

Migrations stay written for Supabase. They are translated at deploy time, so the 78 existing ones are untouched.

| Piece | Where | What it does |
|---|---|---|
| Translator | `scripts/portability/sql.cjs`, `translate-migrations.cjs` | Renames `public` → `forge2`, `auth` → `forge2_auth`, `extensions` → `forge2_ext`, and `anon`/`authenticated`/`service_role` → `forge2_*`. Leaves the `PUBLIC` keyword and `'public'` data values alone. Drops Storage policies, grants to Supabase's internal roles, and the schema and extension creation the shim already does (the migrator may create neither). Output goes to `integration/aurora/build/` (not committed) |
| Aurora shim | `integration/aurora/00_platform_shim.sql` | Run once per database by an administrator. Creates the three schemas and the roles (`forge2_migrator` owns 2.0's objects; `forge2_authenticator` is PostgREST's login), and makes the administrator a member of `forge2_migrator`, which Aurora's `rds_superuser` needs to hand it ownership. Adds the extensions, the `forge2_auth.users` stand-in, `uid()`/`role()`/`jwt()`, and the `forge2.schema_migrations` ledger |
| Rehearsal | `scripts/portability/rehearse-aurora.cjs` | Applies the shim and every translated migration to a scratch database as `forge2_migrator`, one transaction each, recorded in the ledger. Then checks that nothing landed outside the `forge2` schemas. Runs in CI. First local run: 78 migrations, 248 tables (all with row level security), 163 functions, no grants to `forge2_anon` |
| Guard | `scripts/portability/check-portability.cjs`, `baseline.json` | Migrations newer than the baseline may use only what the shim provides. Code may reach Supabase Auth, Storage and Vercel only through `apps/web/src/lib/platform`; existing direct uses are listed and can only go down. Runs in CI |
| Storage adapter | `apps/web/src/lib/platform/storage.ts` | Upload, remove, signed link and download for the four buckets. All 11 server call sites use it; the S3 driver is the remaining work |
| Identity adapter | `apps/web/src/lib/platform/identity.ts` | `currentUser()` and `optionalUserId()`. All 10 former `getAuthUser` callers and the QR route use it; the Cognito driver is phase 1 |
| Manifest | `integration/manifest.json`, `scripts/portability/build-manifest.cjs` | Modules and features (33), permissions (208), menu entries (28, from `forge_experience_elements`), routes (155 pages, 24 API) and scheduled jobs, read from the migrated registries. CI fails if it is out of date |

Still on Supabase after phase 0, by design: the sign-in, sign-up and sign-out screens (inside 1.0 those belong to 1.0), `my-profile` (the boilerplate avatar upload), and the session-refresh middleware.

## Open items

- **Aurora extensions.** Confirm the cluster's PostgreSQL 15.10 offers `vector` at a version that supports the 2.0 indexes before phase 2.
- **1.0 work in progress.** The same person develops both repositories. Phase 3 changes to the CDK and deploy scripts must be coordinated with in-flight 1.0 work, such as the AWS cutover. The production web build currently comes from the `forge-platform-industrial-recon` worktree, not master, so menu changes must land there too.
- **Phase 1 data layer.** PostgREST is a stopgap. Moving to a typed data layer is long-running work and should be planned module by module.
- **Supabase leftovers.** Boilerplate pieces (JetShip billing, avatars, reviews, email templates) should be removed before the move, not ported.
