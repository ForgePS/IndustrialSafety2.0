# Import Platform S8 — Browser Data Safety

**Document:** `docs/testing/import-platform-s8-browser-data-safety.md`  
**Date:** 2026-07-30  
**Status:** **PARTIAL** — storage assertions passed, privileged-path proof **NOT_VERIFIED**

## Scope

Prove Import Center does not retain canaries, raw row dumps, or long-lived presigned/object URLs in browser storage after use.

## Controls in code (design)

| Control                                      | Location               | Browser proof                       |
| -------------------------------------------- | ---------------------- | ----------------------------------- |
| Tenant cache clear helper                    | `@forge/import-center` | **NOT_VERIFIED** live               |
| Protected download dispose / revokeObjectURL | download helper        | Unit only; browser **NOT_VERIFIED** |
| Queue contract forbids URLs in messages      | `@forge/imports`       | Contract — not browser              |

## Playwright assertions (suite)

File: `apps/configuration-e2e/tests/import-center-s8.spec.ts`

- Reads `localStorage` / `sessionStorage` / cookies / href after Import Center load
- Asserts synthetic canaries (`S8-TEST-*`) absent
- Asserts no raw row dumps in persistence
- Tenant-switch cache helper path covered as a test case

**Evidence:** docs/testing/evidence/import-platform/s8-playwright-import-center.json — suite result **FAIL** (4 passed, 3 failed).

## Latest closeout result

Both persistence tests passed: canary/raw-row absence and tenant-switch canary absence. However, they only require an Import Center heading; the authorized page simultaneously reported Import Center is unavailable in the dashboard tests. They therefore do not prove the privileged data path, protected download disposal, or presigned URL cleanup. DEF-S8-003 remains **OPEN**.

## Gaps (limitations)

| LIM         | Topic                                   |
| ----------- | --------------------------------------- |
| LIM-IMP-012 | Tenant-switch cache browser evidence    |
| LIM-IMP-013 | Protected download browser evidence     |
| LIM-IMP-014 | Presigned URL disposal browser evidence |

## Sign-off

| Role     | Result                     | Date       |
| -------- | -------------------------- | ---------- |
| QA / eng | **PARTIAL / NOT_VERIFIED** | 2026-07-30 |
