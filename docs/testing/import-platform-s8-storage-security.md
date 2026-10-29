# Import Platform S8 — Storage Security

**Document:** `docs/testing/import-platform-s8-storage-security.md`  
**Date:** 2026-07-30  
**Status:** Imports bucket controls **VERIFIED** (inspected development)

## Imports bucket (development)

Bucket naming pattern: `forge-development-imports-*` (account/region suffix). Do not publish full KMS key ARNs in user-facing docs.

| Control                                 | Status              |
| --------------------------------------- | ------------------- |
| Block Public Access (all four settings) | **true**            |
| Default encryption                      | **SSE-KMS enabled** |
| Versioning                              | **Enabled**         |
| Lifecycle — expire current objects      | **14 days**         |
| Lifecycle — abort incomplete MPU        | **3 days**          |

## Related controls

| Control                                  | Status                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Presigned upload/download short TTL      | Design **VERIFIED**; browser disposal evidence **NOT_VERIFIED**                                  |
| Queue messages must not carry URLs       | Contract **VERIFIED**                                                                            |
| AWS Backup selection for imports objects | Imports bucket **not** in backup selection (rely on lifecycle + DB backups) — see backup runbook |

## Related

- Gap GAP-035
- `docs/operations/import-backup-restore.md`
