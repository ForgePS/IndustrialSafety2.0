# Import Platform S6 — Security Ops Guide

## Rescan runbook

1. Confirm job status is `SCAN_FAILED` or `QUARANTINED`.
2. `POST /api/v1/imports/jobs/{jobId}/files/{fileId}/rescan` with `import.validate`.
3. Provide `reason` (≥8 chars) when prior verdict was INFECTED/SUSPICIOUS or quarantined.
4. Provide `Idempotency-Key` / body `idempotencyKey` for safe retries.
5. Rescan does **not** auto-release quarantine; a CLEAN verdict is required before format detect.

## Scanner outage

- Fail closed: jobs remain SCANNING / move to SCAN_FAILED after exhaustion.
- Do not mark CLEAN on provider errors.
- Reference provider is in-process; replace via `ImportMalwareScanner` for production scanners.

## Malware incident

1. Confirm quarantine status and security hold on file/job.
2. Download security report only: `POST .../security-report/download`.
3. Preserve scan events and quarantine objects (retention/hold).
4. Do not delete infected evidence during investigation or rollback.

## Secure download

- Authenticated, tenant-scoped, permission-checked.
- Short-lived presigned URLs (`PRESIGN_EXPIRES_SECONDS`).
- Masked by default; privileged requires `import.sensitive`.
- Cache-Control: no-store. No raw S3 keys returned to clients beyond internal contracts.

## Retention

| Kind                 | Default days |
| -------------------- | ------------ |
| Clean source         | 30           |
| Quarantine           | 90           |
| Scan events          | 365          |
| Masked artifacts     | 30           |
| Privileged artifacts | 7            |
| Security reports     | 180          |

Cleanup must skip security holds, active jobs, and pending rollback.

## Rollback (ops)

- Revert API TD to S5 accepted `:38`, worker to `:23`.
- Leave additive schema `0027` in place.
- Preserve scan events, quarantine evidence, audit, security holds.
- Do not release quarantined files on rollback.
