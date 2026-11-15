# MK-S15 Complete — API Keys / Webhooks / Integrations

**Program:** FORGE-SAAS-CORE  
**Sprint:** MK-S15  
**Completed:** 2026-08-10  
**Verdict:** PASS  
**Repair passes used:** 0

## Objective achieved

Tenant API keys (`forge_live_`, hash-at-rest, show-once, revoke) and outbound HTTPS webhooks (signed deliveries, history, replay, disable) with Tenant Admin UI. No production ops. Distinct from CAD/billing inbound webhooks.

## Scope completed

- Contracts + RBAC permissions `tenant.api_key.*` / `tenant.webhook.*`
- `@forge/security` key generation/hashing/signing + `apiKey` redaction
- Schema + migration `0034_mk_s15_api_keys_webhooks.sql` (not applied prod)
- Nest modules `api-keys` and `webhooks`
- Tenant Admin `/api-access` and `/integrations`
- Docs: `API_KEYS_WEBHOOKS.md`

## Out of scope honored

- Production migrate/deploy
- Cognito replacement via API-key auth middleware
- CAD/billing inbound webhook changes
- Parallel v2 systems

## Verification

| Check                                 | Result    |
| ------------------------------------- | --------- |
| contracts / security / database build | PASS      |
| platform-api typecheck                | PASS      |
| tenant-admin typecheck                | PASS      |
| contracts unit                        | 37 passed |
| security unit                         | 6 passed  |
| api-keys + webhooks unit              | 7 passed  |
| Production operations                 | NONE      |

## Next sprint

NOT AUTHORIZED.
