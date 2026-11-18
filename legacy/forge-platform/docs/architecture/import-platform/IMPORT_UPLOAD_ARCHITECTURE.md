# Import Platform S3 — Upload Architecture

Direct-to-S3 upload orchestration for the shared Universal Import Platform.

## Flow

1. API `POST /api/v1/imports/upload` creates `import_jobs` (`UPLOADED`) + `import_files` (`INITIALIZED`).
2. Client uploads via short-lived SSE-KMS presigned PUT or multipart part URLs.
3. `POST .../complete` verifies object presence (HeadObject), persists checksum metadata, enqueues `import.upload.detect.v1`.
4. Worker consumes SQS, sets job `SCANNING`, runs structure-only CSV/XLSX/JSON detection, then `READY_FOR_MAPPING` or `VALIDATION_FAILED`.

## Keys

`tenants/{tenantId}/imports/{jobId}/{storedFilename}`

## Security notes

- Bucket remains private; no public ACL.
- Malware scan runs after upload complete via `IMPORT_MALWARE_SCAN` (Sprint S6).
  Format detection runs only after an acceptable CLEAN (or reserved OVERRIDE_APPROVED) verdict.
- `GET .../file` returns metadata only; raw bytes denied until scan `CLEAN`.
- Profile snapshot may include Configuration Platform effective payload (non-sensitive keys only in audit).

## Out of scope

ZIP migration, duplicates, row commit, UI — later sprints.
