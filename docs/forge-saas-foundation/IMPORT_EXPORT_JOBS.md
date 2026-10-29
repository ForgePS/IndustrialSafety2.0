# Import / Export / Jobs (MK-S19)

## Principles

- **REUSE** Universal Import (`import_jobs`, Import Center, SQS workers) — do not invent a parallel importer
- Shared SaaS jobs live in `platform_jobs` (exports and future non-import work)
- Exports are **authorized**, **tenant-scoped**, **secure**, **expiring**, and **async/queued when large**
- No production migrate/deploy in this sprint

## Shared job model (`platform_jobs`)

| Field                         | Column                                                                  |
| ----------------------------- | ----------------------------------------------------------------------- |
| jobId                         | `id`                                                                    |
| tenantId                      | `tenant_id` (+ RLS)                                                     |
| type                          | `type` (e.g. `export.memberships.csv`)                                  |
| status                        | `PENDING` / `QUEUED` / `RUNNING` / `SUCCEEDED` / `FAILED` / `CANCELLED` |
| progress                      | `progress` 0–100                                                        |
| attempt                       | `attempt`                                                               |
| created / started / completed | timestamps                                                              |
| failure                       | `failure`                                                               |
| correlationId                 | `correlation_id`                                                        |

API: `GET /api/v1/tenants/:tenantId/jobs` (+ `/:jobId`) — permission `platform.jobs.read`.

## Imports (reuse + harden)

- Import Center remains the UI (`/imports`)
- MK-S19 HARDEN: `requestValidation` → `READY_FOR_PREVIEW`, `requestPreview` → `PREVIEW_READY` when mappings exist (foundation gate)
- Product row-rule workers / adapters remain deferred (LIM-IMP-006)

## Exports

| Kind              | Resource permission        | Job type                 |
| ----------------- | -------------------------- | ------------------------ |
| `memberships.csv` | `platform.membership.read` | `export.memberships.csv` |
| `audit.json`      | `platform.audit.export`    | `export.audit.json`      |

- Create: `POST /api/v1/tenants/:tenantId/exports` — `tenant.export.create`
- Download ticket: `POST …/exports/:jobId/download` — `tenant.export.read`
- Inline stream fallback: `GET …/exports/:jobId/content`
- Storage: S3 export bucket when available; otherwise capped inline artifact
- Sync limit: `EXPORT_SYNC_ROW_LIMIT` (5000). Larger / `asyncPreferred` → `QUEUED` (export worker wiring deferred)
- Artifacts expire (`EXPORT_DOWNLOAD_TTL_SECONDS` = 15 minutes)
- Audit: `export.job.created`, `export.download.requested`

## UI

- Creator Console / Tenant Admin: `/jobs`, `/exports` (nav under Import Center group)

## Migration

- `0036_mk_s19_platform_jobs_exports.sql` — **not applied to production**

## Explicit non-goals

- Export SQS / CDK queue productization
- Industrial redesign
- Replacing Import Center
- Production ops
