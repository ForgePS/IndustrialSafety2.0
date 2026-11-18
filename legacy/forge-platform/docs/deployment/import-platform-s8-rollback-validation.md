# Import Platform S8 — Rollback Validation

**Document:** `docs/deployment/import-platform-s8-rollback-validation.md`  
**Date:** 2026-07-30  
**Status:** **EXECUTED — VERIFIED**

## Controlled development rehearsal

| Step                         | Target                                                           | Status                   |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------ |
| Pre-state                    | API `:42`, worker `:26`, running/desired `1/1`                   | **VERIFIED**             |
| Roll back API TD             | `:42` → `:40`                                                    | **VERIFIED**             |
| Roll back worker TD          | `:26` → `:25`                                                    | **VERIFIED**             |
| Wait for rollback stability  | API and worker running/desired/pending `1/1/0`                   | **VERIFIED**             |
| Smoke after rollback         | `/health` 200; unauthenticated `/api/v1/imports/jobs` 401        | **VERIFIED**             |
| Leave schema `0027` in place | No migration command run                                         | **VERIFIED**             |
| Roll forward API TD          | `:40` → `:42`                                                    | **VERIFIED**             |
| Roll forward worker TD       | `:25` → `:26`                                                    | **VERIFIED**             |
| Wait for final stability     | Both rollout states `COMPLETED`, running/desired/pending `1/1/0` | **VERIFIED**             |
| Repeat final smoke           | `/health` 200; unauthenticated `/api/v1/imports/jobs` 401        | **VERIFIED**             |
| Preserve app DB secret       | LastChangedDate `2026-07-26T15:30:16.387000-05:00`               | **VERIFIED — unchanged** |

## Image evidence

- Baseline and restored tag: `import-s8-patch-20260730113557`
- API baseline/restored digest: `sha256:03c9833a54eb368795b296f3cac2ed0be66195c9c12e79b3830285ac541f61a3`
- Worker baseline/restored digest: `sha256:cc4fa0c35ccdff05aed487b6b31a5b54b7411ced558335b18cf537bc47f93d3f`
- API rollback digest: `sha256:f86fef9e8be4969f88e72d201323f07286d504cb097f7b575e59ea309d77935b`
- Worker rollback digest: `sha256:e4472318107466d4ad4a40032d73a8aaa81b338fa8e262ad4b74e19578def557`

Evidence: `docs/testing/evidence/import-platform/s8-rollback-rehearsal.json`

## Plan reference

Procedure: `docs/deployment/import-platform-s8-rollback.md`

## Constraints

- Never disable FORCE RLS
- Never weaken Outcome B to “false” production imports
- Development only — no laptop production deploy

## Sign-off

| Role      | Result       | Date       |
| --------- | ------------ | ---------- |
| Ops / eng | **VERIFIED** | 2026-07-30 |
