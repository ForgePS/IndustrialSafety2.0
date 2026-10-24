# NERIS Phase 3 Increment — Repeatable Records, Attachments, Security, Validation

**Date:** 2026-07-26  
**Status:** Implementation delivered in codebase; Phase 3 overall remains **IN PROGRESS** (not accepted).  
**SOC 2:** Readiness program only — no certification/compliance/Type 1/Type 2 claims.

## Summary

This increment builds on the specialty workflow engine with:

1. Specialty feature flag default **false** (synthetic FD override only)
2. Shared attachment service (S3 presign, quarantine malware interface, archive)
3. Repeatable exposures, civilian/fire-service casualties, hazmat substances/containers, alarm/protection systems
4. Occupancy/preplan links and proposed master-data updates
5. Specialty validation findings
6. Specialty permissions and specialized reviewer starter roles
7. RMS Web cards + attachment gallery
8. Documentation set under `docs/neris/`

## Migration

- `packages/database/drizzle/0011_neris_specialty_records.sql`
- Forces specialty flag catalog default to false
- Creates specialty tables + RLS FORCE policies for `forge_app`
- Extends review comments and validation results columns

**Do not deploy the Data stack** while GAP-009 remains unresolved. Apply SQL/migrations via the established database migration path only.

## Feature flag

| Tenant                       | Specialty flag                           |
| ---------------------------- | ---------------------------------------- |
| Default / production-capable | Disabled (`false`)                       |
| `rms-synthetic-fd`           | Enabled via override                     |
| `rms-synthetic-fd-b`         | Remains disabled (no specialty override) |

APIs call `assertSpecialtyWorkflowsEnabled`. Form descriptor returns core-only navigation when disabled. RMS hides specialty add controls via feature gate.

## Verification completed in this session

- `@forge/neris` specialty tests
- Contracts typecheck
- Flag default + synthetic override wiring
- Schema/migration authored

## Verification still required before calling the increment complete in production

- Local + development migration apply
- platform-api / rms-web deploy (non-Data stacks)
- Full unit/API/RLS/e2e matrix in [phase-3-repeatable-record-tests.md](../testing/phase-3-repeatable-record-tests.md)
- Ten deployed scenarios
- Accessibility + mobile pass
- Phase 1/2 regression green on CI

## Out of scope (unchanged)

CAD, external NERIS submission, offline sync, AI narrative, ePCR, IRWIN transmission, SOC 2 Type 1/2, production customer onboarding.
