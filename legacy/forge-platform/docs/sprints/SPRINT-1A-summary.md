# Sprint 1A Summary — Discovery and Inventory

**Sprint:** 1A  
**Title:** Discovery and Inventory  
**Date completed:** 2026-07-25  
**Status:** COMPLETE

## Objectives

- Inspect Forge Academy and Forge RMS repositories (including supplemental `firebase-app`)
- Document routes/modules, Firestore, Storage, Functions, auth/roles
- Produce feature preservation matrix, migration inventory, sensitive-field and hard-coded config findings
- Establish `forge-platform` as docs home for the AWS rebuild

## Completed work

- Created `C:\Users\jerem\Projects\forge-platform` (git + docs-only scaffold)
- Inventories of:
  - `forge-academy-backup` (Firebase `forge-academy-95f84`)
  - `forge-rms` (Firebase `rms-dashboard-7562e`) — primary RMS
  - `firebase-app` (same project + `horn-lake-fire-app` alias) — supplement/legacy
- Wrote all required discovery documents
- Updated project status

## Files created

- `README.md`
- `.gitignore`
- `docs/discovery/existing-system-inventory.md`
- `docs/discovery/firebase-inventory.md`
- `docs/discovery/feature-preservation-matrix.md`
- `docs/discovery/data-migration-inventory.md`
- `docs/discovery/security-gap-analysis.md`
- `docs/discovery/aws-service-compatibility.md`
- `docs/discovery/govcloud-readiness-register.md`
- `docs/discovery/technical-debt-register.md`
- `docs/discovery/open-decisions.md`
- `docs/sprints/SPRINT-1A-summary.md`
- `docs/project-status.md`

## Files modified

- None in source application repos (read-only discovery)

## Database migrations

- None

## Infrastructure changes

- None (no CDK / AWS deploy)

## Tests added

- None

## Test results

- N/A (documentation sprint)

## Security considerations

- Documented critical gaps: open RMS Storage rules, legacy public Firestore writes, plaintext SSN field on RMS personnel, hard-coded creator emails / Horn Lake domain grants, co-located Academy sensitive student fields
- No production secrets were exported into docs
- Recommend freezing `firebase-app` rules deploys until single source of truth confirmed

## Known issues

- Production document/object volumes UNKNOWN (no live export)
- Whether production Firestore rules currently match `forge-rms` or older `firebase-app` UNKNOWN
- Some Academy/RMS placeholder routes intentionally not treated as features

## Deferred work

- Sprint 1B monorepo / tooling
- Sprint 1C CDK baseline
- Sprint 1D core platform skeleton
- Live Firebase count/hash measurement
- Any feature implementation or Firebase deletion

## Deployment status

- Not applicable — docs-only deliverable in `forge-platform`

## Rollback notes

- Delete or revert docs commits in `forge-platform` if needed; no runtime impact

## Next recommended sprint

**Sprint 1B: Architecture foundation** — pnpm/Turborepo monorepo, TypeScript strict, ESLint/Prettier, shared types, Vitest, Docker Compose PostgreSQL, basic CI, ADR templates, environment schema validation.
