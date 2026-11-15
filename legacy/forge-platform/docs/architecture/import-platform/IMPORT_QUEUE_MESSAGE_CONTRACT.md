# Import Queue Message Contract (S5)

## IMPORT_EXECUTE schemaVersion "1"

```json
{
  "schemaVersion": "1",
  "messageType": "IMPORT_EXECUTE",
  "jobId": "uuid",
  "tenantId": "uuid",
  "requestedBy": "uuid|null",
  "correlationId": "string",
  "idempotencyKey": "string",
  "attempt": 1,
  "requestedAt": "ISO-8601"
}
```

Forbidden in messages: raw rows, secrets, credentials, presigned URLs, full mappings, tenant secrets.

Malformed / unsupported versions are rejected; message deleted after operational evidence is logged.
