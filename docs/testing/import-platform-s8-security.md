# Import Platform S8 — Security Test Notes

**Document:** `docs/testing/import-platform-s8-security.md`  
**Threat model:** `docs/security/import-threat-model.md`

## Objectives

Prove fail-closed production posture, tenant isolation controls, and absence of unsafe bypasses — without claiming unrun browser suites as green.

## Cases

| ID        | Case                                                     | Method                          | Expected                                          | Status                                                  |
| --------- | -------------------------------------------------------- | ------------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| S8-SEC-01 | Reference scanner in `development`                       | Unit / optional API             | Allowed                                           | VERIFIED (unit)                                         |
| S8-SEC-02 | Reference scanner in `production`/`staging`/`govcloud-*` | Unit + API smoke when available | `IMPORT_SCANNER_PROVIDER_UNAVAILABLE`             | VERIFIED (unit); API smoke PENDING per env              |
| S8-SEC-03 | No admin bypass for Outcome B                            | Code review                     | No bypass flag                                    | VERIFIED (guards)                                       |
| S8-SEC-04 | No malware override endpoint                             | OpenAPI / route inventory       | Absent                                            | VERIFIED (spec)                                         |
| S8-SEC-05 | Privileged download requires `import.sensitive`          | API                             | Deny without; allow with (secrets still withheld) | PENDING live matrix                                     |
| S8-SEC-06 | Masked default downloads                                 | API                             | MASKED classification                             | PENDING live / covered by S6 design tests where present |
| S8-SEC-07 | Cross-tenant job access                                  | API + RLS                       | No foreign payload                                | PENDING controlled; RLS FORCE in migrations VERIFIED    |
| S8-SEC-08 | Queue messages lack presigned URLs                       | Contract tests / review         | Forbidden                                         | VERIFIED (contract design)                              |
| S8-SEC-09 | DLQ tooling does not print Body                          | Script review / dry run         | Attributes only                                   | VERIFIED (script design)                                |
| S8-SEC-10 | Quarantine blocks execute                                | API/worker gates                | Block                                             | Covered by S6 security suite lineage                    |
| S8-SEC-11 | SFN not relied upon for security                         | Live inventory                  | No SM; gates in API/worker                        | VERIFIED (baseline)                                     |
| S8-SEC-12 | FORCE RLS not dropped                                    | Migration review through 0027   | FORCE present                                     | VERIFIED                                                |

## Production-like guard matrix

| APP_ENV             | reference-malware | Expected  |
| ------------------- | ----------------- | --------- |
| local               | yes               | allow     |
| development         | yes               | allow     |
| testing             | yes               | allow     |
| staging             | yes               | **block** |
| production          | yes               | **block** |
| govcloud-staging    | yes               | **block** |
| govcloud-production | yes               | **block** |

## Residual risks (tracked)

| LIM             | Topic                              | Evidence still needed                               |
| --------------- | ---------------------------------- | --------------------------------------------------- |
| LIM-IMP-001     | Real provider (Outcome A)          | Provider integration — MITIGATED via Outcome B only |
| LIM-IMP-007     | Sensitivity heuristics             | Product metadata                                    |
| LIM-IMP-012–014 | Browser isolation/download/presign | Playwright or approved browser pack                 |

## Prohibited “fixes” during testing

- Temporarily allowing reference scanner in production-like
- Adding override “just for QA”
- Disabling RLS
- Pasting SQS bodies or presigns into tickets

## Sign-off

Record final statuses in `docs/testing/import-platform-s8-results.md`.
