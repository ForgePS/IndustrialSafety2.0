# PRODUCERS — Cross-tenant UAT (CAI-S1R-UAT-CLOSEOUT)

**Date (UTC):** 2026-08-14  
**Producers tenant:** `019ff7d0-c20f-7659-81e4-c0cd68e23262`  
**Isolation tenant:** `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`

## Application / API (Platform Admin support context)

| Gate                      | Result                      | Evidence                                                                                                                                        |
| ------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| PLATFORM_ADMIN_CONTEXT    | **EXPLICIT**                | `/api/v1/auth/me` → `isPlatformAdmin=true`, `accessMode=PLATFORM_ADMIN_SUPPORT`                                                                 |
| AUDITED                   | **YES**                     | Support actions require platform admin principal; admin path is explicit support mode (not ordinary membership of every tenant)                 |
| GLOBAL_ENTITLEMENT_BYPASS | **NO**                      | Industrial routes still require product entitlement checks; support mode is not silent entitlement grant for all tenants as members             |
| CROSS_TENANT_LIST         | **DENIED**                  | `GET /tenants/{OTHER}/industrial/personnel` → 200 with **0** rows                                                                               |
| CROSS_TENANT_DETAIL       | **DENIED**                  | `GET /tenants/{OTHER}/industrial/sites/{producersSiteId}` → **404 NOT_FOUND**                                                                   |
| CROSS_TENANT_DOCUMENT     | **DENIED**                  | RLS app-role: attachments count 0 under OTHER tenant GUC                                                                                        |
| CROSS_TENANT_QR           | **DENIED**                  | RLS app-role: `qr_links` count 0 under OTHER                                                                                                    |
| CROSS_TENANT_WC           | **DENIED**                  | RLS app-role: WC cases count 0 under OTHER                                                                                                      |
| CROSS_TENANT_WRITE        | **DENIED** (Producers rows) | Cannot read/update Producers site under OTHER path (404). Writes under OTHER path create OTHER-tenant rows only (synthetic probe rows removed). |

## Database RLS (forge_app)

| Check                                              | Result     |
| -------------------------------------------------- | ---------- |
| OTHER tenant GUC → Producers personnel             | 0          |
| OTHER tenant GUC → Producers QR                    | 0          |
| OTHER tenant GUC → Producers WC                    | 0          |
| OTHER tenant GUC → Producers attachments           | 0          |
| OTHER tenant GUC → INSERT into Producers personnel | **DENIED** |

## Cleanup

Synthetic OTHER-tenant probe titles (`__uat_%`) deleted when present after probes.
