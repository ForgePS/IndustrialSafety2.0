# Logging Standard

Use `@forge/observability` `createLogger`. Emit JSON with service, environment, correlationId, tenantId, userId when known.

Never log SSN, passwords, tokens, secrets, or full restricted identifiers. Redaction is automatic for sensitive keys via `@forge/security`.
