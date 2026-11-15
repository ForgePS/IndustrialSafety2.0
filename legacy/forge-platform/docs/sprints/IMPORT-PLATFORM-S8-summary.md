# Import Platform — Sprint S8 Completion Report

**Sprint:** S8 — Production hardening, scale validation, operational readiness, platform freeze  
**Date:** 2026-07-29  
**Status:** `NOT_READY_FOR_REVIEW` (closeout evidence incomplete; development deploy accepted)  
**Environment:** AWS development `511343547817` / `us-east-1`

## Executive summary

S8 closed production ambiguity for the malware scanner (**Outcome B** — block untrusted imports in production-like envs) and Step Functions (**Option B** — keep API → SQS → ECS). Production guards, ADRs, DLQ tooling, stuck-job thresholds, import CloudWatch dashboards, expanded CDK alarms (code), and the full ops/architecture/security documentation set are in place.

**Not yet READY_FOR_REVIEW:** Aurora-backed multi-size load matrix, full Playwright browser E2E (non-mocked), live permission HTTP matrix re-run, controlled backup restore drill, and deployment of S8 API/worker/frontend images remain open. Per governing principles, these are not claimed as passed.

## Decisions

| Decision         | Outcome                                                     | ADR                                                             |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Malware provider | **B — production imports blocked** until production scanner | `docs/decisions/import-malware-provider-production-decision.md` |
| Step Functions   | **B — SQS/worker remains production path**                  | `docs/decisions/import-step-functions-production-decision.md`   |

## Files created (high level)

- Guards: `packages/imports/src/security/production-guards.ts`, `s8-hardening.unit.test.ts`
- UI: `ProductionScannerRestrictionBanner` in `@forge/import-center`
- Scripts: `scripts/import-dlq-ops.mjs`, `scripts/put-import-dashboards.mjs`
- ADRs, freeze, open limitations, permission matrix under `docs/imports/` and `docs/decisions/`
- Ops runbooks: DLQ, worker recovery, stuck job, backup/restore, master import runbook
- Architecture / security / testing / deployment S8 docs (see freeze + results indexes)

## Files modified

- `apps/platform-api/.../import-upload.service.ts` — scanner guard on upload init/complete
- `apps/worker-service/.../import-malware-processor.ts` — production block + EMF metric
- `packages/import-center` — banner + `appEnv` prop; creator-console / tenant-admin pages pass env
- `infrastructure/cdk/.../forge-monitoring.ts` — queue age, worker capacity, scanner-blocked alarms + widgets

## Migrations

- **None.** Baseline remains `0027`. No S8 schema migration.

## Image tags / task definitions

| Component     | Prior                      | S8 deployed                                                                      |
| ------------- | -------------------------- | -------------------------------------------------------------------------------- |
| Tag           | `import-s6-20260729202056` | `import-s8-20260729182259`                                                       |
| API           | `:39`                      | **`:40`**                                                                        |
| Worker        | `:24`                      | **`:25`**                                                                        |
| API digest    | S6                         | `sha256:f86fef9e8be4969f88e72d201323f07286d504cb097f7b575e59ea309d77935b`        |
| Worker digest | S6                         | `sha256:e4472318107466d4ad4a40032d73a8aaa81b338fa8e262ad4b74e19578def557`        |
| Frontend      | S7                         | Console `I8UZZFUXPH6FL4IJ8FUO0G9T2V` / Tenant Admin `IAH6SN8BJR1LDYH66PSIDNGEAC` |
| App secret    | unchanged                  | unchanged `2026-07-26T15:30:16.387000-05:00`                                     |

## Deploy evidence

- `docs/deployment/import-platform-s8-deployment.md`
- `docs/testing/evidence/import-platform/s8-image.json`
- `docs/testing/evidence/import-platform/s8-td-register.json`
- `docs/testing/evidence/import-platform/s8-deploy.json`
- `docs/testing/evidence/import-platform/s8-smoke.json`
- Smoke: health `200`, `/api/v1/imports/jobs` unauth `401`

## Gate list before READY_FOR_REVIEW

1. ~~Re-authenticate AWS; re-run `scripts/import-rls-verify.mjs`~~ **DONE**
2. ~~Build/push API+worker images with S8 guards; register TDs~~ **DONE** (`:40` / `:25`)
3. ~~Deploy creator-console + tenant-admin (production restriction banner)~~ **DONE**
4. Execute Aurora protocol sizes in `docs/testing/import-platform-s8-performance.md` (synthetic tenants only)
5. Playwright browser E2E + a11y (non-mocked acceptance suite)
6. Controlled backup restore drill evidence
7. ~~CLI alarms for queue-age / worker / scanner-blocked~~ **DONE** (CDK parity still pending synth/deploy)
8. Close all P0/P1 defects discovered in those runs
9. Update `docs/testing/import-platform-s8-results.md` with remaining pass evidence
10. Flip this report to `READY_FOR_REVIEW` and keep freeze as `PLATFORM_FREEZE_PENDING_ACCEPTANCE`

## Explicit non-work

- No product adapters
- No QR Platform
- No Step Functions activation
- No production-grade scanner integration (Outcome A deferred)
- No app database secret rotation

## Recommendation for S9

**NOT AUTHORIZED** until S8 is accepted. After acceptance and freeze: adapters in order Industrial → RMS → Academy, only with explicit authorization.
