# MK-S19 Plan — Import / Export / Jobs

## Objective

Establish a shared SaaS background-job model and authorized export foundation; REUSE the existing Universal Import platform and harden validation/preview orchestration stubs. No production ops. No parallel import v2.

## Changes

1. Contracts `jobs-domain` + `exports-domain`; permissions `platform.jobs.read`, `tenant.export.read|create`
2. Table `platform_jobs` + migration `0036` (not applied prod)
3. Nest Jobs + Exports modules (list/get, create export, expiring download)
4. Export kinds: `memberships.csv`, `audit.json` — authorized, tenant-scoped, progress fields, S3-presign when available with secure API download fallback
5. HARDEN import `requestValidation` / `requestPreview` to real status transitions (foundation pass)
6. Thin Jobs / Data Export pages in Creator Console + Tenant Admin
7. Docs `IMPORT_EXPORT_JOBS.md`

## Out of scope

- New export SQS queue / CDK queue wiring
- Elasticsearch / full Export Center product
- Product import adapters (LIM-IMP-006)
- Industrial redesign
- Production migrate/deploy
