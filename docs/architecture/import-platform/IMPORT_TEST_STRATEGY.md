# Universal Import Platform — Test Strategy

**Status:** ARCHITECTURE  
**Date:** 2026-07-28  
**Target:** 0 failed / 0 skipped for Import Platform suites at DoD

## Suite matrix

| Suite            | Scope                                                                     |
| ---------------- | ------------------------------------------------------------------------- |
| Unit             | `@forge/imports` formats, validation rules, duplicate scoring, transforms |
| Integration      | DB staging + RLS with harness                                             |
| API              | platform-api import module contract tests                                 |
| RLS              | FORCE policies; cross-tenant deny                                         |
| Tenant isolation | API 403/empty across tenants                                              |
| Duplicate        | Create/Update/Skip/Reject/Merge Review paths                              |
| Rollback         | Safe rollback + blocked unsafe cases                                      |
| Performance      | Large CSV batch throughput / memory bounds                                |
| Playwright       | Import Center happy path Creator + Tenant Admin                           |
| Accessibility    | axe + keyboard wizard                                                     |

## Evidence location (future)

`docs/testing/evidence/import-platform/`

## Gate

No Import Platform sprint is Done without green suites above. Product adapter sprints add adapter-specific tests without forking the shared engine suite.
