# Import API (human reference)

**Contract status:** SPECIFIED — Nest module begins in S2 (not S1).  
**Architecture:** `docs/architecture/import-platform/IMPORT_API_SPECIFICATION.md`  
**OpenAPI:** `docs/api/import-openapi.yaml`

## Permissions (S1 canonical)

| Code                     | Use                                     |
| ------------------------ | --------------------------------------- |
| `import.view`            | List/get jobs, status, results (masked) |
| `import.upload`          | Create job / upload                     |
| `import.map`             | Column mapping                          |
| `import.validate`        | Validate                                |
| `import.preview`         | Preview                                 |
| `import.approve`         | Approve                                 |
| `import.execute`         | Execute / queue                         |
| `import.rollback`        | Rollback                                |
| `import.profile.manage`  | Profiles                                |
| `import.template.manage` | Templates                               |
| `import.error.reprocess` | Reprocess errors                        |
| `import.sensitive`       | Unmask sensitive fields                 |

Do not use `platform.import.*` / `tenant.import.*` names.

## Job status values

Canonical list in `IMPORT_WORKFLOW.md` (e.g. `UPLOADED`, `SCANNING`, `SCAN_FAILED`, … `CANCELLED`).

## Endpoints (S2+)

| Method | Path                                |
| ------ | ----------------------------------- |
| POST   | `/api/v1/import/jobs`               |
| GET    | `/api/v1/import/jobs`               |
| GET    | `/api/v1/import/jobs/{id}`          |
| POST   | `/api/v1/import/jobs/{id}/validate` |
| POST   | `/api/v1/import/jobs/{id}/preview`  |
| POST   | `/api/v1/import/jobs/{id}/approve`  |
| POST   | `/api/v1/import/jobs/{id}/execute`  |
| POST   | `/api/v1/import/jobs/{id}/rollback` |
| GET    | `/api/v1/import/jobs/{id}/status`   |
| GET    | `/api/v1/import/jobs/{id}/results`  |
| GET    | `/api/v1/import/templates`          |
| GET    | `/api/v1/import/profiles`           |
| POST   | `/api/v1/import/profiles`           |

## Idempotency

`Idempotency-Key` on create / approve / execute / rollback. Job/batch/row keys enforced in DB (S1).
