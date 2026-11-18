# Sensitive Data Handling

**Sprint:** 1D  
**Related ADR:** [ADR-018](../decisions/ADR-018-sensitive-data-encryption.md)

## Decision summary

Sensitive attributes (SSN, bank details, government ids, etc.) are:

1. Stored in `person_sensitive_data`, not inline on `persons` ([ADR-018](../decisions/ADR-018-sensitive-data-encryption.md)).
2. Encrypted with envelope encryption using the dedicated **sensitive-data** KMS key in non-local environments.
3. Never written as plaintext to logs, traces, metrics, or domain event payloads.
4. Readable only on intentional, permissioned decrypt paths (`platform.sensitive_data.read`).

## Application path

`SensitiveDataService` (`apps/platform-api/src/common/sensitive-data.service.ts`):

| Environment                         | Encryption                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local` / `development` / `testing` | AES-256-GCM with `SENSITIVE_DATA_LOCAL_KEY` (base64 32 bytes) or fixed local fallback                                                                               |
| Other                               | AWS KMS `Encrypt`/`Decrypt` with `KMS_SENSITIVE_DATA_KEY_ARN` and encryption context (`tenantId`, `personId`, `dataType`); AES-GCM fallback only if KMS unavailable |

Ciphertext JSON (algorithm, key version, ciphertext) is persisted in `encrypted_value`.

## API

Under `api/v1/tenants/:tenantId/persons/:personId`:

| Method | Path                           | Notes                          |
| ------ | ------------------------------ | ------------------------------ |
| POST   | `/sensitive-identifiers`       | Encrypt + upsert by type       |
| GET    | `/sensitive-identifiers/:type` | Decrypt for authorized callers |

List/search person APIs return non-sensitive fields only by default.

## Redaction helpers

`@forge/security` provides `isSensitiveKey` / `redactSensitive` for log and error serialization. `@forge/events` `assertSafeEventPayload` blocks obvious sensitive keys in outbox payloads. `@forge/observability` and `@forge/audit` apply redaction on snapshots where configured.

## Operational rules

- Do not `SELECT` sensitive rows into general Person DTOs or admin exports without explicit scope.
- Prefer references (`personId` + `dataType`) in events and audit metadata; avoid ciphertext in EventBridge if not required.
- Key policy / IAM for `KMS_SENSITIVE_DATA_KEY_ARN` must be narrower than the general CMK.
- Local fallback keys are **not** production secrets; never reuse them outside local-like envs.

## Related

- Encryption design (infra): [encryption-design.md](./encryption-design.md)
- Bootstrap env notes: [platform-bootstrap.md](../development/platform-bootstrap.md)
