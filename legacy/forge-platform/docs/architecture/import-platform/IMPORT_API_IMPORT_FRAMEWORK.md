# External API Import Framework (S4)

Shared configuration and request-building helpers for API-sourced imports.

## Capabilities

- Auth abstraction: none / bearer / API key / OAuth2 client credentials (secret **refs** only)
- Pagination: none / offset / cursor
- Retry + rate-limit policy validation
- Response record path extraction
- HTTPS-only base/token URLs

## Non-goals (S4)

No product-specific connectors, no credential materialization into logs, no commit pipeline.
