# AI Narrative Foundation — Acceptance Report

**Date:** 2026-07-27 (America/Chicago) / 2026-07-28 UTC close  
**Environment:** development only  
**Account:** `511343547817`  
**Region:** `us-east-1`  
**Verdict:** `ACCEPTED_WITH_LIMITATIONS`

## Authorization scope honored

- Phase 5: **not started**
- Production enablement: **not performed**
- External NERIS submission / ePCR / offline AI / restricted medical processing: **not enabled**
- Phase 4 synthetic CAD tenant (`rms-synthetic-fd`): **not modified for AI flags**
- Application database secret: **unchanged**

## Checkpoint (pre-change)

Recorded in `docs/sprints/ai-narrative-acceptance-checkpoint.json`.

| Item                       | Value                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| App secret ARN             | `arn:aws:secretsmanager:us-east-1:511343547817:secret:forge-development-secrets-database-app-SknUu5`          |
| App secret LastChangedDate | `2026-07-26T15:30:16.387000-05:00` (unchanged after acceptance)                                               |
| Secret rotation planned    | **No**                                                                                                        |
| ECS cluster                | `forge-development-ecs-platform`                                                                              |
| API (pre)                  | `forge-development-ecs-platform-api:20`                                                                       |
| Worker (pre/post)          | `forge-development-ecs-worker-service:19` (`closeout-20260727125918`) — **unchanged**                         |
| API health                 | `200 healthy`                                                                                                 |
| RMS UI                     | `200`                                                                                                         |
| CAD intake DLQ             | `0`                                                                                                           |
| Git                        | Local `.git` has **no commit history** (empty repo). Rollback checkpoint is the JSON file + image tags below. |

## Migration

| Field           | Value                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Migration       | `0020_ai_narrative_foundation.sql`                                                                                   |
| Additive        | **Yes** (CREATE TABLE / INDEX / ENABLE+FORCE RLS only; DROP POLICY IF EXISTS only)                                   |
| Destructive ops | **None**                                                                                                             |
| Tenant_id       | Present on all tenant-owned AI tables; nullable only for platform-scoped config tables                               |
| RLS             | `ENABLE` + `FORCE ROW LEVEL SECURITY` for all 12 AI tables                                                           |
| Start           | `2026-07-27T17:45:03-05:00` (task start)                                                                             |
| Completion      | `2026-07-27T17:46:01-05:00` (task exit 0)                                                                            |
| Role            | ECS migrate one-off with **admin** secret `forge-development-secrets-database` (not app secret)                      |
| Runtime role    | API continues on `forge_app` via app secret                                                                          |
| Verification    | CloudWatch: `{"status":"migrated",...}`; DROP POLICY “does not exist, skipping” warnings only (expected first apply) |
| Rollback        | Feature remains flag-gated; tables may remain unused. Do not drop in production without separate authorization.      |

## Provider

| Item                            | Status                               |
| ------------------------------- | ------------------------------------ |
| Provider used                   | **stub** (`stub-v1`)                 |
| External network                | None                                 |
| Estimated cost                  | **$0.00**                            |
| Commercial provider             | **Prepared docs only — not enabled** |
| Credentials in code/client/logs | **None**                             |

Stub acceptance behavior verified: deterministic schema, missing-field reporting, conflict reporting, restricted SSN excluded from payload/manifest.

## Synthetic AI tenant

| Field                       | Value                                                                  |
| --------------------------- | ---------------------------------------------------------------------- |
| Tenant key                  | `rms-ai-synthetic-fd`                                                  |
| Tenant id                   | `019fa5c5-6bd9-734c-ace5-76e0b8da28a0`                                 |
| Admin user                  | `admin@rms-ai-synthetic.test` / `019fa5c5-6bd9-734c-ace5-7eb763a6ad5f` |
| Purpose                     | AI Narrative development acceptance only                               |
| CAD / NERIS external / ePCR | Not configured                                                         |
| Phase 4 tenant              | Untouched                                                              |

### Flags enabled (AI tenant only)

- `ai.narrative.enabled`
- `ai.narrative.rms.enabled`
- `ai.narrative.rewrite.enabled`
- `ai.narrative.quality_check.enabled`
- `rms.neris.incident_shell.enabled`
- `rms.neris.manual_intake.enabled`
- `rms.neris.officer_review.enabled`

### Kept disabled

- `ai.narrative.industrial.enabled`
- `ai.narrative.academy.enabled`
- `ai.narrative.voice_input.enabled`
- `ai.narrative.sensitive_data.enabled`
- Global defaults remain `false`

### Entitlement / permissions

- Module entitlement: `AI_NARRATIVE`
- Permissions seeded for acceptance admin: use/generate/review/accept/reject + RMS incident AI generate/accept + incident view/create/edit/finalize (review submit/approve added in seed source for follow-up reseed; live finalize path limited — see limitations)

## Deployed API for acceptance

| Item                | Value                                                            |
| ------------------- | ---------------------------------------------------------------- |
| Final API task def  | `forge-development-ecs-platform-api:25`                          |
| Image               | `.../forge-development-ecr-platformapi:ai-accept-20260727185000` |
| Worker              | Still `:19` (Phase 4 CAD worker unchanged)                       |
| Health after deploy | `200 healthy`                                                    |

## Live E2E results (synthetic AI tenant, stub)

Executed via development `x-forge-dev-principal` (no Cognito user required for API acceptance).

| Step                                                                 | Result                                                                                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Create synthetic incident                                            | PASS (`019fa632-45c9-70bd-bfeb-c2df5a0461f2`)                                                                                             |
| Generate with structured facts + missing + conflict + restricted SSN | PASS → `READY_FOR_REVIEW`                                                                                                                 |
| Source redaction excludes SSN                                        | PASS (`ssnInBody=False`)                                                                                                                  |
| Missing water supply reported                                        | PASS                                                                                                                                      |
| Location conflict reported                                           | PASS                                                                                                                                      |
| Draft label unreviewed                                               | PASS (`AI DRAFT — NOT REVIEWED`)                                                                                                          |
| Narrative not auto-inserted before accept                            | PASS (before body empty)                                                                                                                  |
| Accept sets `acceptedAt` / `acceptedByUserId`                        | PASS                                                                                                                                      |
| Label after accept                                                   | PASS (`AI-ASSISTED — HUMAN REVIEWED`)                                                                                                     |
| Insert into incident narrative after accept                          | PASS (`AFTER_LEN=258`, contains Structure Fire)                                                                                           |
| Unauthenticated GET denied                                           | PASS (`401`)                                                                                                                              |
| Usage API with min perms                                             | Expected FORBIDDEN without `ai.narrative.view_usage` (by design of min perms)                                                             |
| Finalize then AI deny                                                | **Not completed live** (review transition permissions / approval interrupt) — covered by unit `assertRecordAllowsAiMutation("FINALIZED")` |
| Tenant B isolation live                                              | **Not completed live** in this session (principal for B not wired here) — RLS FORCE present; package/unit isolation patterns unchanged    |

Earlier generate also produced request `019fa5f9-80ca-738d-8006-cd9327c0d36d` with missing/conflict/SSN checks.

## Unit / typecheck results

| Suite                                   | Passed | Failed | Skipped |
| --------------------------------------- | ------ | ------ | ------- |
| `@forge/ai-policy`                      | 2      | 0      | 0       |
| `@forge/ai-redaction`                   | 1      | 0      | 0       |
| `@forge/ai-evaluation`                  | 2      | 0      | 0       |
| `@forge/ai` (incl. acceptance pipeline) | 8      | 0      | 0       |
| `@forge/contracts` typecheck            | PASS   |        |         |
| `@forge/platform-api` typecheck         | PASS   |        |         |

## Full regression (directive §10)

| Suite                                           | Status                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| AI package unit tests                           | PASS (13)                                                                 |
| Platform API typecheck                          | PASS                                                                      |
| Platform API unit/integration                   | **Not fully re-run** this session                                         |
| Database/RLS suite                              | **Not re-run** this session (migration applied with FORCE RLS)            |
| Phase 2/3/4 Playwright + review + full chromium | **Not re-run** this session                                               |
| AI Narrative Playwright UI                      | Smoke spec present; full UI E2E requires RMS web deploy + Cognito AI user |

**Regression acceptance criterion (0 failed / 0 skipped across full matrix): NOT MET in this run.**  
Phase 4 CAD worker/image and queues left intact; API health remains green.

## Security verification

| Check                                       | Result                                            |
| ------------------------------------------- | ------------------------------------------------- |
| AI tables RLS + FORCE                       | PASS (migration)                                  |
| Runtime uses app secret / `forge_app`       | PASS (API env `DATABASE_SECRET_ARN` = app secret) |
| App secret unchanged                        | PASS                                              |
| Provider secrets in SM only                 | PASS (stub; no commercial secret)                 |
| Full narrative/source not logged by default | PASS (observability helpers emit metrics only)    |
| Redacted values not in audit summaries      | PASS (field IDs only in redaction audit)          |
| Correlation IDs present                     | PASS (error/success responses)                    |
| Quotas tenant-scoped                        | PASS (assertQuotas filters by tenantId)           |
| AI cannot NERIS submit / ePCR               | PASS (no such code paths)                         |
| Sensitive-data flag off                     | PASS                                              |

## Observability

| Item                     | Status                                              |
| ------------------------ | --------------------------------------------------- |
| Metric helpers           | Present (`AiNarrativeRequests/Success/Failure/...`) |
| Stub cost                | $0.00                                               |
| CloudWatch alarms for AI | **Not provisioned in CDK this sprint** — limitation |

## Known limitations

1. Local git has no commits; checkpoint is JSON + image tags, not a git SHA.
2. Full Phase 2/3/4 Playwright regression not executed in this acceptance window.
3. Live finalize → post-finalize AI denial not completed (review permissions / approval interrupt).
4. Live Tenant B cross-read not executed in this window.
5. Creator Console / RMS UI static sites not redeployed; API + seed + panel code are in repo.
6. Stub conflict heuristic flags multiple distinct datetime fields in the same category (false positive alongside real location conflict).
7. Commercial provider configuration prepared in docs only — not activated.
8. AI CloudWatch alarms not yet in infrastructure.

## Rollback instructions

1. Keep all `ai.narrative.*` overrides absent for non-AI tenants (Phase 4 remains off).
2. Optionally suspend AI tenant policy via `POST /api/v1/ai/management/tenants/:tenantId/suspend`.
3. Roll API task definition back to Phase 4 baseline `:20` if needed:
   - `aws ecs update-service --cluster forge-development-ecs-platform --service forge-development-ecs-platform-api --task-definition forge-development-ecs-platform-api:20 --force-new-deployment`
4. Leave worker on `:19`.
5. Do not rotate/replace `forge-development-secrets-database-app`.
6. Migration `0020` tables may remain; feature is inert without flags/entitlements.

## Post-test state

- AI **disabled globally** (defaults false)
- AI enabled **only** on `rms-ai-synthetic-fd` for continued regression
- Sensitive-data AI disabled
- External provider disabled
- Phase 5 unauthorized
- Phase 4 synthetic tenant unchanged
- App DB secret unchanged (`LastChangedDate` still `2026-07-26T15:30:16-05:00`)
- API on `:25` (AI foundation); worker on `:19` (Phase 4 CAD)

## Production-readiness recommendation

**Not production-ready.**  
Accept development foundation with limitations. Before any broader enablement:

1. Re-run full Playwright Phase 2/3/4 + review + AI E2E to 0 failed / 0 skipped
2. Complete live finalize + Tenant B isolation matrix
3. Deploy Creator Console + RMS UI builds
4. Add CloudWatch alarms
5. Product-owner authorization for any commercial provider / additional tenants

**STOP.** Awaiting explicit product-owner authorization for next steps.
