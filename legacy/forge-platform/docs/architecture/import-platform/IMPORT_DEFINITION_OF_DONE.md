# Universal Import Platform — Definition of Done

**Status:** ARCHITECTURE  
**Date:** 2026-07-28

No Import Platform implementation sprint is complete until **all** of the following are true for the shared platform (product adapters may trail only after shared DoD):

| Gate                  | Required                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Working UI            | Creator + Tenant Admin Import Center wizard                                                             |
| Working APIs          | All `/api/v1/import/...` endpoints live                                                                 |
| Database schema       | `0022` applied with FORCE RLS                                                                           |
| Migrations            | Documented, additive, verified                                                                          |
| RLS                   | Proven via isolation tests                                                                              |
| Permissions           | Seeded unscoped `import.*` catalog (scope via role assignment, not `platform.`/`tenant.` name prefixes) |
| Audit                 | Mutations audited with correlation IDs                                                                  |
| Validation            | Rules engine; no silent discards                                                                        |
| Error handling        | Structured Forge errors + row errors                                                                    |
| Search / filters      | Job list filters                                                                                        |
| Progress              | Status endpoint + UI                                                                                    |
| Rollback              | Where safe; tested                                                                                      |
| Background processing | S3 + SQS + Step Functions + worker + DLQ                                                                |
| Monitoring            | Dashboards/alarms for queue/failures                                                                    |
| Tests                 | Unit, integration, API, RLS, Playwright, a11y — 0 failed / 0 skipped                                    |
| Documentation         | User, API, ops, security, test plan current                                                             |

## Architecture stop DoD (this delivery)

- [x] Architecture package documents exist
- [x] Draft schema + API contracts exist
- [x] `@forge/imports` skeleton exists
- [x] Supporting docs exist
- [x] Sprint breakdown documented
- [ ] Runtime implementation (separate sprints after architecture review)
