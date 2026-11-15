# MK-S15 Plan — API Keys / Webhooks / Integrations

## Objective

Productize tenant API keys (`forge_live_`) and outbound HTTPS webhooks with signed deliveries, history, replay, and disable controls. Do not confuse with CAD/billing inbound webhooks. No production ops.

## Changes

1. Contracts + permissions `tenant.api_key.*` / `tenant.webhook.*`
2. `@forge/security` key generation/hashing/signing + redaction of `apiKey`
3. Tables + migration `0034` (not applied prod)
4. API modules for keys and webhooks (create once secret, revoke, deliveries, replay)
5. Tenant Admin `/api-access` and `/integrations` pages
6. Docs `API_KEYS_WEBHOOKS.md`

## Out of scope

- API key auth middleware replacing Cognito (optional follow-on)
- CAD/billing inbound webhook changes
- Production migrate/deploy
- Parallel v2 systems
