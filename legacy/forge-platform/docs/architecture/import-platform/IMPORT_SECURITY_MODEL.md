# Universal Import Platform — Security Model

**Status:** S1 conditions resolved  
**Date:** 2026-07-28

## Permissions

Unscoped codes (assignment decides platform vs tenant principal):

`import.view`, `import.upload`, `import.map`, `import.validate`, `import.preview`, `import.approve`, `import.execute`, `import.rollback`, `import.profile.manage`, `import.template.manage`, `import.error.reprocess`, `import.sensitive`

Creator-only platform permissions remain blocked from tenant-admin grants via `isCreatorOnlyPermission` (unchanged mechanism). Import permission `import.sensitive` is high-risk; seed only to trusted roles.

## FORCE RLS

All `import_*` tables: ENABLE + FORCE RLS; USING + WITH CHECK on `tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid`. Application role `forge_app` cannot bypass. Missing tenant GUC → deny-by-default.

## Malware fail-closed

Non-CLEAN → `SCAN_FAILED`; no parse.

## Sensitive row policy

| Control                | Rule                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Source                 | S3 only; no long-term unrestricted DB blob of full PII file                         |
| `mapped_json`          | Normalized; max 64 KiB per row                                                      |
| `raw_json`             | Optional truncated; prefer `raw_s3_key`                                             |
| Masking                | Default API masks identifiers; `import.sensitive` required to unmask                |
| Retention              | `retention_delete_at` set at commit/fail; cleanup job deletes eligible rows/objects |
| Logs / metrics / audit | Never include full SSN/password/token; use `assertSafeEventPayload` patterns        |
| Audit                  | `ImportSensitiveFieldAccessed` when unmask path used                                |

## Rollback safety

Classes: `SAFE` | `CONDITIONAL` | `UNSAFE` | `EXPIRED` → may yield `ROLLED_BACK` or `ROLLBACK_REFUSED`.

## Cross-tenant

Validation rule `cross_tenant`; FK resolution must stay in job tenant; RLS is last line of defense.
