# Import Platform — Data Classification (S8)

**Document:** `docs/security/import-data-classification.md`

## Classification levels

| Level                  | Meaning                           | Examples                                             |
| ---------------------- | --------------------------------- | ---------------------------------------------------- |
| Public                 | Non-sensitive product docs        | This architecture summary (no tenant data)           |
| Internal               | Ops metadata without payloads     | Alarm names, queue depths, digests                   |
| Tenant Confidential    | Tenant-owned import content       | Files, rows, mappings, previews, errors              |
| Restricted / Sensitive | Heightened harm if disclosed      | PII fields, credentials, auth tokens in source files |
| Security Evidence      | Tamper-resistant security history | Scan events, verdicts, quarantine tags               |

## Data stores

| Store                      | Typical class                    | Notes                                          |
| -------------------------- | -------------------------------- | ---------------------------------------------- |
| S3 imports objects         | Tenant Confidential → Restricted | Versioned; lifecycle expiry                    |
| `import_rows` / batches    | Tenant Confidential              | FORCE RLS                                      |
| `import_column_mappings`   | Tenant Confidential              | May mark `isSensitive`                         |
| Preview / result artifacts | Masked by default                | Privileged path needs `import.sensitive`       |
| Credentials inside imports | Restricted                       | Never returned via download APIs               |
| `import_file_scan_events`  | Security Evidence                | No raw malware bytes in API                    |
| SQS body                   | Internal + identifiers           | Treat ids as confidential; do not paste bodies |
| CloudWatch logs            | Internal                         | Redact payloads/URLs                           |
| UI in-memory cache         | Tenant Confidential              | Clear on tenant switch                         |

## Handling rules

1. **Least privilege** — grant only needed `import.*` permissions.
2. **Mask by default** — unmask only with `import.sensitive` and still never return secrets.
3. **Short-lived capability URLs** — do not archive presigns in tickets or chat.
4. **DLQ ops** — attributes + MessageId only (`scripts/import-dlq-ops.mjs`).
5. **Backups** — restored copies inherit classification; scratch restore targets must be access-controlled.
6. **Synthetic malware signals** — development/testing only; production-like blocked (Outcome B).

## Retention (development pattern)

| Artifact          | Retention cue                                              |
| ----------------- | ---------------------------------------------------------- |
| S3 import objects | Lifecycle `importFilesDays` (dev **14 days**) + versioning |
| DLQ messages      | 14 days                                                    |
| Main queue        | 4 days                                                     |
| Aurora            | Platform backup / PITR policy                              |
| Scan events       | Retained with job/file metadata (DB)                       |

Exact production retention must be set per environment policy — do not assume dev 14-day values.

## Cross-border / GovCloud

GovCloud production-like envs are included in Outcome B scanner block. Provider/GovCloud compatibility assessment is deferred to the Outcome A provider sprint.
