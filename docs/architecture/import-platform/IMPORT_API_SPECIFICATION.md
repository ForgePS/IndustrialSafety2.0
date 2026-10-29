# Universal Import Platform — API Specification

**Status:** CONTRACT (Nest in S2+)  
**Base path:** `/api/v1/import`  
**Date:** 2026-07-28

## Permissions (canonical)

Unscoped: `import.view`, `import.upload`, `import.map`, `import.validate`, `import.preview`, `import.approve`, `import.execute`, `import.rollback`, `import.profile.manage`, `import.template.manage`, `import.error.reprocess`, `import.sensitive`.

## Job statuses

Canonical enum — see `IMPORT_WORKFLOW.md`. Do not invent alternate names without ADR.

## Endpoints

| Method | Path                                | Permission              |
| ------ | ----------------------------------- | ----------------------- |
| POST   | `/api/v1/import/jobs`               | `import.upload`         |
| GET    | `/api/v1/import/jobs`               | `import.view`           |
| GET    | `/api/v1/import/jobs/{id}`          | `import.view`           |
| POST   | `/api/v1/import/jobs/{id}/validate` | `import.validate`       |
| POST   | `/api/v1/import/jobs/{id}/preview`  | `import.preview`        |
| POST   | `/api/v1/import/jobs/{id}/approve`  | `import.approve`        |
| POST   | `/api/v1/import/jobs/{id}/execute`  | `import.execute`        |
| POST   | `/api/v1/import/jobs/{id}/rollback` | `import.rollback`       |
| GET    | `/api/v1/import/jobs/{id}/status`   | `import.view`           |
| GET    | `/api/v1/import/jobs/{id}/results`  | `import.view`           |
| GET    | `/api/v1/import/templates`          | `import.view`           |
| GET    | `/api/v1/import/profiles`           | `import.view`           |
| POST   | `/api/v1/import/profiles`           | `import.profile.manage` |

Idempotency-Key on create/approve/execute/rollback. Sensitive fields masked unless `import.sensitive`.

See also `docs/api/import-api.md` and `docs/api/import-openapi.yaml`.
