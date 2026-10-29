# Universal Import Platform — Architecture

**Phase:** Master Directive Phase 5 / Roadmap Phase 12 Import Engine  
**Status:** APPROVED_WITH_CONDITIONS (conditions resolved in S1)  
**Date:** 2026-07-28  
**Depends on:** Configuration Platform v1.0 baseline (feature-frozen)

## Goals

Build **one** enterprise Import Platform shared by every Forge product. Products supply **record-type adapters**; they do not fork import engines.

## Canonical job state machine

Single status vocabulary across DB, APIs, events, workers, and Step Functions. Alternate names require an ADR.

```
UPLOADED → SCANNING → SCAN_FAILED | READY_FOR_MAPPING
READY_FOR_MAPPING → MAPPED → VALIDATING → VALIDATION_FAILED | READY_FOR_PREVIEW
READY_FOR_PREVIEW → PREVIEW_READY → AWAITING_APPROVAL → APPROVED
APPROVED → QUEUED → PROCESSING → COMPLETED | COMPLETED_WITH_ERRORS | FAILED
COMPLETED|COMPLETED_WITH_ERRORS → ROLLBACK_PENDING → ROLLED_BACK | ROLLBACK_REFUSED
* → CANCELLED (where allowed)
```

Full list: see `IMPORT_WORKFLOW.md`.

## Permissions (explicit, unscoped names)

| Code                     | Capability                                     |
| ------------------------ | ---------------------------------------------- |
| `import.view`            | Read jobs, status, results (non-sensitive)     |
| `import.upload`          | Create job / register file / obtain upload URL |
| `import.map`             | Edit column mappings                           |
| `import.validate`        | Run validation                                 |
| `import.preview`         | Generate preview                               |
| `import.approve`         | Approve for execution                          |
| `import.execute`         | Queue / run commit                             |
| `import.rollback`        | Request rollback                               |
| `import.profile.manage`  | Manage import profile snapshots                |
| `import.template.manage` | Manage downloadable templates                  |
| `import.error.reprocess` | Reprocess rejected rows                        |
| `import.sensitive`       | View unmasked sensitive field values           |

Tenant administrators **cannot** grant Platform Creator-only permissions (`isCreatorOnlyPermission`). Scope (platform vs tenant principal) is resolved by membership/role assignment, **not** by encoding `platform.` / `tenant.` into import permission names.

## Product adapter interface

Adapters live **outside** `@forge/imports` and implement:

```ts
interface ProductImportAdapter {
  ref: ProductModuleRef; // productCode, moduleCode, recordType
  loadTargetSchema(tenantId: string): Promise<TargetSchema>;
  resolveForeignKeys(tenantId: string, rows: StagedRow[]): Promise<...>;
  commitBatch(input: ExecuteBatchInput): Promise<ExecuteBatchResult>;
  rollbackBatch(input: RollbackBatchInput): Promise<RollbackResult>;
  classifyRollbackSafety(job: ImportJobSnapshot): RollbackSafetyClass;
}
```

No Academy / RMS / Industrial adapter implementations in S1.

## Rollback safety classifications

| Class         | Meaning                                                                                | Allowed                             |
| ------------- | -------------------------------------------------------------------------------------- | ----------------------------------- |
| `SAFE`        | All committed entities still exclusively owned by this job; no downstream side effects | Auto / API rollback                 |
| `CONDITIONAL` | Some entities mutated after import or referenced                                       | Manual review; may partial-rollback |
| `UNSAFE`      | External side effects, merges, or irreversible publishes                               | `ROLLBACK_REFUSED`                  |
| `EXPIRED`     | Past retention / legal hold window                                                     | `ROLLBACK_REFUSED`                  |

## Sensitive row storage and retention

- Source files: private S3 (`S3_IMPORT_BUCKET`), SSE-KMS, short-lived URLs only.
- Staging rows store **normalized** `mapped_json` with size cap; full raw optional via `raw_s3_key` or truncated `raw_json`.
- `contains_sensitive` + `retention_delete_at` drive cleanup eligibility.
- Routine API/logs/metrics/error exports **mask** sensitive identifiers unless actor has `import.sensitive`.
- See `IMPORT_SECURITY_MODEL.md`.

## Malware scan fail-closed

- Job enters `SCANNING` after `UPLOADED`.
- Any non-`CLEAN` result (infected, scanner error, timeout) → `SCAN_FAILED` (terminal for that file/job path).
- Parse / header detection **must not** run until `CLEAN`.

## Idempotency

| Layer  | Key                              | Constraint                                    |
| ------ | -------------------------------- | --------------------------------------------- |
| API    | `Idempotency-Key` header         | Platform idempotency records                  |
| Job    | `import_jobs.idempotency_key`    | UNIQUE `(tenant_id, idempotency_key)`         |
| Batch  | `import_batches.idempotency_key` | UNIQUE `(tenant_id, job_id, idempotency_key)` |
| Row op | `import_rows.operation_key`      | UNIQUE `(tenant_id, job_id, operation_key)`   |

Retries return the original result; they must not double-commit.

## Configuration Platform integration

Consume published effective config (`import_config`, dropdowns, custom fields, terminology, forms, workflows, roles, permissions, branding). Do not redesign Studio.

## Related documents

See package README and sibling `IMPORT_*.md` files.
