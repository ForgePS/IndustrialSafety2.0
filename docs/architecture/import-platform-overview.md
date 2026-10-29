# Import Platform — Architecture Overview (S8)

**Document:** `docs/architecture/import-platform-overview.md`  
**Status:** Operational architecture (S1–S8)  
**OpenAPI:** `0.6.0-s6` (`docs/api/import-openapi.yaml`)

## Purpose

Forge Universal Import Platform provides tenant-scoped upload, mapping, validation, preview, approval, queued execution, malware gating, and result artifacts for multi-product imports. **No product adapters** ship in S8; the reference adapter and generic product/module/record keys remain the only commit path.

## High-level flow

```text
Import Center UI (@forge/import-center)
        │  HTTPS + forgeAuth permissions
        ▼
Platform API (ECS) — imports modules
        │  enqueue (no presigned URLs in messages)
        ▼
SQS forge-*-sqs-imports  ──maxReceiveCount 3──▶  DLQ
        │
        ▼
Worker service (ECS) — detect / malware / execute processors
        │
        ├── Aurora (FORCE RLS on import_* tables)
        └── S3 imports bucket (SSE-KMS, versioning)
```

**Step Functions:** Definition complete / not active (**Option B**). Operational path is API → SQS → ECS worker only.

## Packages

| Package                | Role                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `@forge/imports`       | Domain types, DTOs, queue contracts, scanners, gates, batch constants, production guards |
| `@forge/import-center` | Shared Creator Console + Tenant Admin UI                                                 |
| `@forge/database`      | Schema + migrations `0022`–`0027`                                                        |
| `apps/platform-api`    | HTTP API                                                                                 |
| `apps/worker-service`  | SQS consumers / processors                                                               |

## Migrations

Import platform schema lives in:

| Migration | Focus                                      |
| --------- | ------------------------------------------ |
| `0022`    | Core tables + FORCE RLS                    |
| `0023`    | Control plane                              |
| `0024`    | Upload                                     |
| `0025`    | Duplicates                                 |
| `0026`    | Execution journal                          |
| `0027`    | Security (scan events, security artifacts) |

S7/S8: no additional migration required for UI / hardening-only work.

## Job lifecycle (summary)

Statuses include: `UPLOADED` → `SCANNING` → (`QUARANTINED` / `SCAN_FAILED` | `READY_FOR_MAPPING`) → mapping → validation → preview → approval → `QUEUED` → `PROCESSING` → terminal (`COMPLETED`, `COMPLETED_WITH_ERRORS`, `FAILED`, `CANCELLED`, rollback classification states).

Canonical enum: `IMPORT_JOB_STATUSES` / Import Center `ImportJobStatus`.

## Security posture (S8)

| Control             | Status                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------- |
| FORCE RLS           | Enforced on import tables (0022–0027)                                                     |
| Malware provider    | `reference-malware@1` — **Outcome B** production block                                    |
| `APP_ENV` guard     | `assertScannerAllowedForEnvironment`                                                      |
| Overrides           | Reserved verdicts only; no HTTP override                                                  |
| Sensitive downloads | Masked by default; `import.sensitive` for privileged request (credentials never returned) |

## UI surfaces

| App             | Route       |
| --------------- | ----------- |
| Creator Console | `/imports/` |
| Tenant Admin    | `/imports/` |

Query-param workspace for static export compatibility. See `docs/architecture/import-ui.md`.

## Explicit non-goals (S8)

- Product adapters / QR / destination commits beyond reference adapter
- Activating Step Functions
- Replacing Outcome B without separate authorization
- Claiming Aurora-scale performance without controlled-run evidence

## Related docs

| Topic                  | Path                                        |
| ---------------------- | ------------------------------------------- |
| Execution              | `docs/architecture/import-execution.md`     |
| Security               | `docs/architecture/import-security.md`      |
| UI                     | `docs/architecture/import-ui.md`            |
| Storage                | `docs/architecture/import-storage.md`       |
| Observability          | `docs/architecture/import-observability.md` |
| Freeze                 | `docs/imports/import-platform-freeze.md`    |
| Detailed design folder | `docs/architecture/import-platform/`        |
