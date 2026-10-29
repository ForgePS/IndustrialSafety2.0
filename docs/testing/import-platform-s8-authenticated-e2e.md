# Import Platform S8 — Authenticated E2E

**Document:** `docs/testing/import-platform-s8-authenticated-e2e.md`  
**Date:** 2026-07-30  
**Environment:** development (`https://d108fstxdv69bo.cloudfront.net`)

## Summary

| Path                                                    | Status           | Evidence                                                                           |
| ------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| Live API authenticated create→execute (upload + worker) | **PASS**         | `docs/testing/evidence/import-platform/s8-authenticated-workflow.json`             |
| Playwright full browser UI workflow                     | **NOT_VERIFIED** | Closeout suite ran: 4 passed, 3 failed; authorized dashboards remained unavailable |
| Alternate browser flows (quarantine, deny, cancel, …)   | **NOT_VERIFIED** |                                                                                    |

## Playwright closeout run (2026-07-30)

The Chromium suite executed 7 tests: **4 passed, 3 failed**. Unauthorized fail-closed checks and both browser-persistence assertions passed. Authorized Creator Console and Tenant Admin dashboards remained on Import Center is unavailable; therefore the authorized axe scan did not run.

Evidence: docs/testing/evidence/import-platform/s8-playwright-import-center.json.

This suite does not drive create-upload-execute through the UI, so DEF-S8-002 remains **OPEN**.

## Successful API workflow (2026-07-30)

| Field                   | Value                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| Job ID                  | `019fb3c6-9a02-720d-96fb-8b50128ffaf8`                                   |
| Final status            | `COMPLETED`                                                              |
| Tenants / personas      | Tenant A operator → approver → executor → full → rollback                |
| Adapter                 | `reference:generic:record@1`                                             |
| Rollback classification | `ROLLBACK_PENDING` / `FULLY_REVERSIBLE` (preparation only)               |
| Format-detect           | Required manual SQS replay when stuck at `FORMAT_DETECTION` (DEF-S8-023) |
| Script                  | `scripts/import-s8-authenticated-workflow.mjs`                           |

### Steps verified (API)

1. Authenticate via `X-Forge-Dev-Principal` (operator)
2. `POST /upload` → S3 PUT (SSE-KMS) → `POST /upload/:id/complete`
3. Malware `CLEAN` → (detect replay if needed) → `READY_FOR_MAPPING`
4. Mappings → validation/preview audit requests → submit → approve (approver)
5. Stage rows → execute (executor) with reference adapter
6. Poll `COMPLETED` → results download URL issued (host only logged)
7. Rollback request → `ROLLBACK_PENDING`

### Explicit gaps vs directive §5

- Playwright trace / screenshots / video for Creator Console UI — **missing**
- UI-driven mapping / duplicate review screens — **missing**
- Batch detail UI navigation — **missing**

## Alternate flows

Not executed in this pass. Remain open under DEF-S8-002.

## Related defects

- DEF-S8-021 CLOSED — CF CORS Allow-Headers
- DEF-S8-022 CLOSED — personas seeded
- DEF-S8-023 OPEN — format-detect enqueue after malware clean
- DEF-S8-024 OPEN — API default adapter key (code fixed; not deployed)
