# Import Platform — Sprint S3 Summary

**Date:** 2026-07-29  
**Status:** **READY_FOR_REVIEW**  
**Do not start S4 until S3 is ACCEPTED.**

## Objectives

Production-ready upload orchestration for the shared Universal Import Platform:
direct-to-S3 presigned and multipart uploads, completion, CSV/XLSX/JSON structure
detection, file metadata + content hashing, mapping/profile snapshot persistence,
audit events, worker enqueue, tests, and documentation.

## Scope boundaries (this sprint)

| In scope                                  | Out of scope (later sprints) |
| ----------------------------------------- | ---------------------------- |
| Presigned PUT + multipart upload          | Malware vendor scanning (S6) |
| Upload complete / abort / cancel          | ZIP migration bundles (S4)   |
| CSV / XLSX / JSON **structure** detection | Duplicate engine (S4)        |
| File metadata + SHA-256 hashing           | Row import / execution (S5)  |
| Config profile snapshot on upload         | Import Center UI (S7)        |
| Import SQS detect consumer                | Product adapters             |

## Completed work

- Migration `0024_import_platform_s3_upload.sql` (upload/validation columns on `import_files`)
- Drizzle `importFiles` table + API repository methods
- `@forge/imports`: upload DTOs, S3 state machine, structure detectors, SQS message type
- Nest: `ImportStorageService`, `ImportQueueService`, `ImportUploadService`, routes under `/api/v1/imports/upload*` and `/{jobId}`
- Worker: `ImportUploadSqsConsumer` + format-detection processor
- Worker ECS env: `S3_IMPORT_BUCKET` (CDK)
- OpenAPI `docs/api/import-openapi.yaml` v0.3.0-s3
- Unit tests in `@forge/imports` (S3 detection + upload state)

## Upload lifecycle

1. `POST /upload` → job `UPLOADED`, file `INITIALIZED`, SSE-KMS presign or multipart
2. Client uploads bytes to S3
3. `POST /upload/{jobId}/complete` → verify HeadObject, persist hash, enqueue `import.upload.detect.v1`
4. Worker → `SCANNING` → structure detect → `READY_FOR_MAPPING` or `VALIDATION_FAILED`
5. Raw byte download denied until scan `CLEAN` (**S6**)

## Database changes

Additive only: `stored_file_name`, `upload_status`, `validation_status`, `encryption_status`,
`multipart_upload_id`, `upload_progress_percent`, `client_checksum_sha256`, `validation_detail`,
content-hash uniqueness for completed files, expanded `scan_status` check.

## Limitations explicitly documented

- Malware scanning remains `PENDING` with `NOT_AVAILABLE_UNTIL_S6`
- Row validation / preview requests return `NOT_AVAILABLE_UNTIL_S5`
- ZIP / API import sources not accepted for upload in S3
- No product-specific adapters

## Local verification

- `@forge/imports` unit tests: **20 passed**
- platform-api + worker-service typecheck: **pass**
- Docker images: `import-s3-20260729092615`

## Deployment (COMPLETE)

| Item                   | Value                                             |
| ---------------------- | ------------------------------------------------- |
| API TD                 | `:34`                                             |
| Worker TD              | `:20`                                             |
| Migrate `0024`         | exit **0** (`…/de1a4227562045d1855848411d3df22b`) |
| Health / upload unauth | `200` / `401`                                     |
| App DB secret          | unchanged                                         |

Evidence: `docs/testing/evidence/import-platform/s3-*.json`  
Deployment report: `docs/deployment/import-platform-s3-deployment.md`

## Acceptance gate

**Status: READY_FOR_REVIEW**  
Await formal ACCEPTED before any S4 work.
