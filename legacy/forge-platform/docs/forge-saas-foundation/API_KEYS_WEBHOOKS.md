# API Keys & Outbound Webhooks (MK-S15)

## Scope

Tenant product surface for:

1. **API keys** — server-generated `forge_live_` secrets, hash-at-rest, show-once, revoke
2. **Outbound webhooks** — HTTPS endpoints, HMAC signatures, delivery history, replay, disable

This is **not** CAD inbound webhooks, billing PSP inbound webhooks, or import connector `api_key` auth.

## Permissions

| Code                    | Use                               |
| ----------------------- | --------------------------------- |
| `tenant.api_key.read`   | List key metadata                 |
| `tenant.api_key.manage` | Create / revoke                   |
| `tenant.webhook.read`   | List endpoints + deliveries       |
| `tenant.webhook.manage` | Create / patch / deliver / replay |

Owner and Admin personas include all four via `TENANT_OWNER_PERMISSIONS`.

## API

### API keys

- `GET /api/v1/tenants/:tenantId/api-keys`
- `POST /api/v1/tenants/:tenantId/api-keys` → `{ …metadata, apiKey }` once
- `POST /api/v1/tenants/:tenantId/api-keys/:keyId/revoke`

Raw keys are never logged (`redactSensitive` covers `apiKey` / `rawKey`). Only SHA-256 hashes are stored.

### Webhooks

- `GET/POST /api/v1/tenants/:tenantId/webhooks`
- `PATCH /api/v1/tenants/:tenantId/webhooks/:endpointId` (`enabled`, `rotateSecret`, …)
- `GET/POST …/webhooks/:endpointId/deliveries`
- `POST …/deliveries/:deliveryId/replay`

Delivery posts JSON with headers:

- `X-Forge-Signature: sha256=<hex>`
- `X-Forge-Event: <eventType>`

Signing secret is returned only on create or `rotateSecret: true`. Disabled endpoints refuse new deliveries and replays.

## Storage

Migration `packages/database/drizzle/0034_mk_s15_api_keys_webhooks.sql` (not applied to production in this sprint):

- `tenant_api_keys`
- `tenant_webhook_endpoints`
- `tenant_webhook_deliveries`

All RLS-isolated on `app.current_tenant_id`.

## Admin UI

Tenant Admin:

- `/api-access` — create/list/revoke keys
- `/integrations` — endpoints, enable/disable, test delivery, replay

## Follow-ons (not this sprint)

- API-key bearer auth middleware (Cognito still primary)
- Async delivery worker / backoff queue
- KMS encryption for webhook signing secrets at rest
- Production migrate/deploy
