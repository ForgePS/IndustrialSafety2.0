# Import Platform — Authorization Report (S1)

**Date:** 2026-07-28  
**Verdict:** **PASS** (catalog + live seed)  
**Note:** Nest import routes ship in S2. S1 verifies permission catalog, seed model, and service-layer helpers.

## Permissions seeded (catalog)

| Code                     | Unit | Live Aurora |
| ------------------------ | ---- | ----------- |
| `import.view`            | PASS | PASS        |
| `import.upload`          | PASS | PASS        |
| `import.map`             | PASS | PASS        |
| `import.validate`        | PASS | PASS        |
| `import.preview`         | PASS | PASS        |
| `import.approve`         | PASS | PASS        |
| `import.execute`         | PASS | PASS        |
| `import.rollback`        | PASS | PASS        |
| `import.profile.manage`  | PASS | PASS        |
| `import.template.manage` | PASS | PASS        |
| `import.error.reprocess` | PASS | PASS        |
| `import.sensitive`       | PASS | PASS        |

**Final live import permission count:** **12**

## Live seed execution

| Field                     | Value                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| Process                   | `node scripts/run-ecs-seed-import-permissions.mjs`                                                        |
| Task ARN                  | `arn:aws:ecs:us-east-1:511343547817:task/forge-development-ecs-platform/e2737e989b7a4a71b6ea24c0d7a88c3e` |
| Exit code                 | 0                                                                                                         |
| Result                    | `{"ok":true,"importPermissionCount":12,…}`                                                                |
| Idempotent                | yes (re-run safe; catalog verify still 12)                                                                |
| Duplicate permission rows | 0 observed                                                                                                |
| Evidence                  | `docs/testing/evidence/import-platform/s1-perms.json`                                                     |

Acceptance seed (synthetic tenants only): `run-ecs-seed-import-acceptance.mjs` exit 0 — evidence `s1-acceptance.json`. Fixture IDs retained in controlled evidence; not echoed in public ops logs.

## Boundaries

| Rule                                                                                | Result                                                                 |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Names are unscoped (`import.*` only)                                                | PASS                                                                   |
| No `platform.` / `tenant.` alternatives embedded in permission names                | PASS                                                                   |
| Tenant admin seed excludes `import.sensitive` and `import.template.manage`          | PASS (`tenantAdminImportPermissions`)                                  |
| Tenant administrators cannot grant Creator-only platform privileges via import seed | PASS                                                                   |
| `isCreatorOnlyPermission` does not treat import.* as creator-only platform codes    | PASS                                                                   |
| Missing permission throws FORBIDDEN helper                                          | PASS (`assertImportPermission`)                                        |
| Direct API enforcement                                                              | N/A until S2 routes                                                    |
| Denial audit behavior                                                               | Event type `ImportSensitiveFieldAccessed` + safe payload guard defined |

## Totals (S1)

|                               |                                               |
| ----------------------------- | --------------------------------------------- |
| Live import permissions       | 12                                            |
| Unit permission catalog cases | 12                                            |
| Failed                        | 0                                             |
| Skipped API route matrix      | yes (no Nest import routes in S1 — by design) |
