# Import Platform — Storage Architecture (S8)

**Document:** `docs/architecture/import-storage.md`

## Components

| Store             | Role                                                       |
| ----------------- | ---------------------------------------------------------- |
| Aurora PostgreSQL | Authoritative job/row/journal/security metadata; FORCE RLS |
| S3 imports bucket | Binary uploads + generated artifacts                       |
| SQS imports + DLQ | Transient work items (not durable archive)                 |

## Aurora

- Migrations through **`0027_import_platform_s6_security`**.
- App path uses application DB secret only (never migration credentials in API/worker).
- PITR via platform Aurora continuous backup — see `docs/operations/import-backup-restore.md`.
- Batch commits sized default 50 / max 500 to limit transaction duration.

## S3 imports bucket

| Property             | Value (development pattern)                                                 |
| -------------------- | --------------------------------------------------------------------------- |
| Name pattern         | `forge-{env}-imports-{account}-{region}`                                    |
| Encryption           | SSE-KMS                                                                     |
| Versioning           | **Enabled**                                                                 |
| Lifecycle            | `importFilesDays` (dev profile **14 days**); abort incomplete MPU ~3d       |
| AWS Backup selection | **Not** included in CDK `ForgeBackups` selection — versioning + DB metadata |

### Object lifecycle (logical)

1. Client obtains short-lived presigned PUT (initialize).
2. Complete verifies HeadObject + checksum metadata.
3. Malware scan may quarantine (copy/tags per security design) — no silent release.
4. Artifacts (results/errors/security report) issued via short-lived GET; classification MASKED vs privileged.

### Presign rules

- TTL short-lived.
- **Forbidden** in SQS message bodies.
- Clients must not persist URLs in logs, localStorage, or long-lived state (evidence gap: LIM-IMP-014).

## Queue durability

| Queue                     | Visibility | Retention | DLQ |
| ------------------------- | ---------- | --------- | --- |
| `forge-*-sqs-imports`     | 300 s      | 4 days    | yes |
| `forge-*-sqs-imports-dlq` | —          | 14 days   | —   |
| `maxReceiveCount`         | 3          |           |     |

KMS encryption on queue pairs. Ops: `scripts/import-dlq-ops.mjs`.

## Backup implications

- Job recoverability = Aurora PITR + S3 version restore + checksum reconciliation.
- Cross-region DR **not claimed** without controlled test evidence.
- Expired lifecycle objects are gone unless versions retained within policy.

## Related

- Upload architecture: `docs/architecture/import-platform/IMPORT_UPLOAD_ARCHITECTURE.md`
- Backup runbook: `docs/operations/import-backup-restore.md`
- Security: `docs/architecture/import-security.md`
