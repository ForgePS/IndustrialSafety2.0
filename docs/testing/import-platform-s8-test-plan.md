# Import Platform S8 — Test Plan

**Document:** `docs/testing/import-platform-s8-test-plan.md`  
**Goal:** Production hardening evidence without inventing scale/E2E results

## In scope

1. Unit coverage for production guards, stuck thresholds, batch recommendation
2. DLQ ops script safety (inspect / dry-run; no Body leakage)
3. Alarm/baseline health checks
4. ADR + limitation register consistency
5. Permission matrix execution (API) where environment available
6. Aurora multi-size performance **protocol** (execution may be PENDING)
7. Accessibility requirements documentation (suite may be pending)
8. Security regression: Outcome B block; no override; FORCE RLS unchanged

## Out of scope

- Product adapters
- Step Functions activation tests as live path
- Claiming cross-region DR
- Fabricating Aurora 250k throughput numbers

## Test suites

### A. Unit — `@forge/imports`

| Case                                                                 | Expected                              |
| -------------------------------------------------------------------- | ------------------------------------- |
| Reference scanner allowed in `development` / `testing` / `local`     | `ok: true`                            |
| Reference scanner blocked in `staging` / `production` / `govcloud-*` | `IMPORT_SCANNER_PROVIDER_UNAVAILABLE` |
| Non-reference provider allowed in production                         | `ok: true`                            |
| Stuck SCANNING beyond 15m                                            | `isStuckImportJob` true               |
| Terminal statuses                                                    | not stuck                             |
| `S8_BATCH_RECOMMENDATION`                                            | default 50, max 500                   |

File: `packages/imports/src/s8-hardening.unit.test.ts` (+ prior S1–S6 suites).

### B. Unit — `@forge/import-center`

Router, permissions, tenant cache clear, download dispose helpers, fixtures (existing S7 suite).

### C. Ops / AWS (controlled)

| Case          | Expected                                       |
| ------------- | ---------------------------------------------- |
| DLQ inspect   | Runs; prints attributes only; depth documented |
| Alarms        | DLQ + backlog state recorded                   |
| ECS revisions | Documented vs baseline                         |

### D. Permission matrix

Execute `docs/imports/s8-permission-test-matrix.md` against a non-prod API with fixture users.

### E. Performance protocol

Follow `docs/testing/import-platform-s8-performance.md`:

- Keep S5 in-process 500-row smoke as lower bound evidence
- Aurora matrix sizes (e.g. 500 / 5k / 50k / 250k) as **required protocol** with `PENDING_CONTROLLED_RUN` until executed

### F. Security

See `docs/testing/import-platform-s8-security.md`.

### G. Accessibility

See `docs/testing/import-platform-s8-accessibility.md` — keyboard + axe requirements; Playwright suite not yet greenfield.

## Environments

| Env                       | Scanner expectation        |
| ------------------------- | -------------------------- |
| development / testing     | Reference provider allowed |
| staging / production-like | Reference provider blocked |

## Exit criteria (honest)

S8 may be accepted with documented PENDING items if:

- Guards + ADRs + runbooks complete
- No false scale claims
- LIM register reflects MITIGATED/DEFERRED correctly
- Remaining evidence listed in results doc

## Results

Record in `docs/testing/import-platform-s8-results.md`.
