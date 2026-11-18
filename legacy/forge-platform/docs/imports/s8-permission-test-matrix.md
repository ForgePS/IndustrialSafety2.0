# Import Platform S8 — Permission Test Matrix

**Document:** `docs/imports/s8-permission-test-matrix.md`  
**Source of truth:** OpenAPI `docs/api/import-openapi.yaml` + `@forge/import-center` matrix  
**Enforcement under test:** API (UI checks are supplemental)

Legend: **Allow** = 2xx as designed · **Deny** = 401/403 · **N/A** = not applicable · **Block** = business/security gate (may be 409/422/`IMPORT_*`)

## Permissions under test

`import.view` · `import.upload` · `import.map` · `import.validate` · `import.preview` · `import.approve` · `import.execute` · `import.rollback` · `import.profile.manage` · `import.template.manage` · `import.error.reprocess` · `import.sensitive`

## Matrix (principal holds ONLY the listed permission unless noted)

| #   | Operation (representative)                     | view  | upload | map   | validate | preview | approve | execute | rollback | profile.manage | template.manage | error.reprocess | sensitive |
| --- | ---------------------------------------------- | ----- | ------ | ----- | -------- | ------- | ------- | ------- | -------- | -------------- | --------------- | --------------- | --------- |
| 1   | List/get jobs, job status, scan-events GET     | Allow | Deny   | Deny  | Deny     | Deny    | Deny    | Deny    | Deny     | Deny           | Deny            | Deny            | Deny      |
| 2   | Masked results/errors/security-report download | Allow | Deny   | Deny  | Deny     | Deny    | Deny    | Deny    | Deny     | Deny           | Deny            | Deny            | Deny      |
| 3   | Privileged download (`privileged=true`)        | Deny* | Deny   | Deny  | Deny     | Deny    | Deny    | Deny    | Deny     | Deny           | Deny            | Deny            | Deny†     |
| 4   | Upload initialize / complete / abort           | Deny  | Allow  | Deny  | Deny     | Deny    | Deny    | Deny    | Deny     | Deny           | Deny            | Deny            | Deny      |
| 5   | Put mappings                                   | Deny  | Deny   | Allow | Deny     | Deny    | Deny    | Deny    | Deny     | Deny           | Deny            | Deny            | Deny      |
| 6   | Validation request                             | Deny  | Deny   | Deny  | Allow    | Deny    | Deny    | Deny    | Deny     | Deny           | Deny            | Deny            | Deny      |
| 7   | Malware rescan POST                            | Deny  | Deny   | Deny  | Allow    | Deny    | Deny    | Deny    | Deny     | Deny           | Deny            | Deny            | Deny      |
| 8   | Preview request / get preview                  | Deny  | Deny   | Deny  | Deny     | Allow   | Deny    | Deny    | Deny     | Deny           | Deny            | Deny            | Deny      |
| 9   | Approve / reject                               | Deny  | Deny   | Deny  | Deny     | Deny    | Allow   | Deny    | Deny     | Deny           | Deny            | Deny            | Deny      |
| 10  | Execute import                                 | Deny  | Deny   | Deny  | Deny     | Deny    | Deny    | Allow   | Deny     | Deny           | Deny            | Deny            | Deny      |
| 11  | Cancel execution                               | Deny  | Deny   | Deny  | Deny     | Deny    | Deny    | Allow   | Deny     | Deny           | Deny            | Deny            | Deny      |
| 12  | Rollback classification request                | Deny  | Deny   | Deny  | Deny     | Deny    | Deny    | Deny    | Allow    | Deny           | Deny            | Deny            | Deny      |
| 13  | Profile create/update/archive                  | Deny  | Deny   | Deny  | Deny     | Deny    | Deny    | Deny    | Deny     | Allow          | Deny            | Deny            | Deny      |
| 14  | Template manage ops                            | Deny  | Deny   | Deny  | Deny     | Deny    | Deny    | Deny    | Deny     | Deny           | Allow           | Deny            | Deny      |
| 15  | Error reprocess                                | Deny  | Deny   | Deny  | Deny     | Deny    | Deny    | Deny    | Deny     | Deny           | Deny            | Allow           | Deny      |
| 16  | Malware override HTTP                          | Deny  | Deny   | Deny  | Deny     | Deny    | Deny    | Deny    | Deny     | Deny           | Deny            | Deny            | Deny      |
| 17  | Quarantine release HTTP                        | Deny  | Deny   | Deny  | Deny     | Deny    | Deny    | Deny    | Deny     | Deny           | Deny            | Deny            | Deny      |

\* Privileged download requires **both** view-capable access and `import.sensitive` (OpenAPI: default masked under `import.view`; privileged needs sensitive).  
† `import.sensitive` alone without `import.view` must Deny.

## Combined-permission cases

| Case                                                            | Expected                                                |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| `view` + `sensitive` privileged download                        | Allow URL issuance; secrets still masked/non-returnable |
| `execute` without CLEAN / security hold                         | Block (gate) even with permission                       |
| `upload` in production-like + reference scanner                 | Block `IMPORT_SCANNER_PROVIDER_UNAVAILABLE`             |
| Cross-tenant job id with any permission                         | Deny / empty (RLS) — never other tenant payload         |
| Alternate security arrays (upload\|approve on some file routes) | Allow if **any** listed permission present per OpenAPI  |

## UI supplemental checks (`@forge/import-center`)

| Check                                      | Expected                              |
| ------------------------------------------ | ------------------------------------- |
| Control hidden/disabled without permission | `disabledReason` cites permission     |
| Override control                           | Absent for all roles                  |
| Quarantine release control                 | Absent                                |
| Rollback wording                           | Classification request, not full undo |

## Evidence status

| Layer                             | Status                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Unit permissions helpers          | Covered in `@forge/import-center` unit tests                                 |
| Full HTTP matrix against live API | Record results in `docs/testing/import-platform-s8-results.md` when executed |
| Browser E2E permission tour       | PENDING (no greenfield Playwright suite)                                     |

## Sign-off

| Role                | Name | Date | Result |
| ------------------- | ---- | ---- | ------ |
| QA / eng            |      |      |        |
| Security (optional) |      |      |        |
