# Import Platform S8 - Permission Matrix Results

**Document:** `docs/testing/import-platform-s8-permission-matrix.md`  
**Date:** 2026-07-30  
**Design matrix:** [`docs/imports/s8-permission-test-matrix.md`](../imports/s8-permission-test-matrix.md)

## Summary

| Layer                                               | Status                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Documented Allow/Deny matrix (12 `import.*` codes)  | **VERIFIED** as design artifact                                                     |
| `@forge/import-center` permission helper unit tests | **VERIFIED**                                                                        |
| Live HTTP authorized/unauthorized matrix            | **FAIL** - 14/15 cases passed                                                       |
| Live HTTP permission coverage                       | **12/12 represented**; 11/12 permissions returned the expected authorization result |
| Browser permission tour                             | **NOT_VERIFIED**                                                                    |

## Live HTTP results

Evidence: `docs/testing/evidence/import-platform/s8-permission-matrix-live.json`  
Script: `scripts/import-s8-permission-matrix-live.mjs`  
API: `https://d108fstxdv69bo.cloudfront.net`  
Completed: `2026-07-30T17:45:44.749Z`

| Case                              | Permission             | Expected    | Actual | Result   |
| --------------------------------- | ---------------------- | ----------- | ------ | -------- |
| viewer list jobs                  | import.view            | 200         | 200    | PASS     |
| unauthorized list jobs            | import.view            | 401/403     | 403    | PASS     |
| viewer upload denied              | import.upload          | 403         | 403    | PASS     |
| viewer mappings update denied     | import.map             | 403         | 403    | PASS     |
| viewer validation request denied  | import.validate        | 403         | 403    | PASS     |
| viewer preview request denied     | import.preview         | 403         | 403    | PASS     |
| viewer error retry denied         | import.error.reprocess | 403         | 403    | PASS     |
| operator approve denied           | import.approve         | 403         | 403    | PASS     |
| operator execute denied           | import.execute         | 403         | 403    | PASS     |
| viewer rollback denied            | import.rollback        | 403         | 403    | PASS     |
| tenant B cannot get tenant A job  | tenant-scope           | 404         | 404    | PASS     |
| viewer profile create denied      | import.profile.manage  | 403         | 403    | PASS     |
| operator profile create allowed   | import.profile.manage  | 200/201     | 201    | PASS     |
| viewer template create denied     | import.template.manage | 403         | 404    | **FAIL** |
| viewer privileged download denied | import.sensitive       | 403/404/409 | 403    | PASS     |

No unauthorized success was observed.

## Coverage and failure

The live script now contains at least one authorized or deny case for all 12 permissions:

`import.view`, `import.upload`, `import.map`, `import.validate`, `import.preview`, `import.approve`, `import.execute`, `import.rollback`, `import.profile.manage`, `import.template.manage`, `import.error.reprocess`, and `import.sensitive`.

`import.template.manage` remains an implementation gap. `POST /api/v1/imports/templates` returned `404 NOT_FOUND`, not the required `403 FORBIDDEN`. The current `imports.controller.ts` exposes only template GET routes protected by `import.view`; it has no POST, PUT, or PATCH template management route guarded by `import.template.manage`. A route-level 404 is not accepted as permission-denial evidence.

The error retry test uses a synthetic error UUID and returned 403 before resource lookup, confirming permission enforcement without requiring real error data.

## Remaining for full gate close

- Add and deploy a template mutation endpoint guarded by `import.template.manage`, then rerun the live matrix.
- Per-permission authorized UI visibility and action.
- Direct route access matrix for every allow/deny cell.
- Role refresh and permission revocation.

## Sign-off

| Role          | Result                                                         | Date       |
| ------------- | -------------------------------------------------------------- | ---------- |
| Evidence pass | 14/15 live cases passed; template management route gap remains | 2026-07-30 |
