# PRODUCERS — Workers Comp security UAT (CAI-S1R-UAT-CLOSEOUT)

**Date (UTC):** 2026-08-14  
**Tenant:** `019ff7d0-c20f-7659-81e4-c0cd68e23262`  
**Mechanism:** `app.industrial_wc_medical_access` (RLS on `industrial_workers_comp_medical_encounters`)

## Results

| Gate                                                     | Result                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| WC_CLAIM_UAT (claim rows visible under tenant, count=27) | **PASS**                                                                                                           |
| WC_MEDICAL_STANDARD_ROLE                                 | **DENIED** (0 rows with GUC off)                                                                                   |
| WC_MEDICAL_ELEVATED_ROLE                                 | **ALLOWED** (16 rows with GUC on)                                                                                  |
| WC_DOCUMENT_STANDARD_ROLE                                | **DENIED** (medical encounter / restricted payload gated by same GUC; claim-level attachments use tenant RLS only) |
| WC_DOCUMENT_ELEVATED_ROLE                                | **ALLOWED** (elevated GUC reveals medical encounters)                                                              |
| WC_GUC_LEAKAGE                                           | **0**                                                                                                              |
| WC_CONNECTION_POOL_SECURITY                              | **PASS**                                                                                                           |

## Connection pool / SET LOCAL

Production `withTenantTransaction` uses `set_config(..., true)` (transaction-local). Verified:

1. Transaction A: medical GUC `on` → encounters visible
2. Transaction B on same app connection: medical GUC unset → encounters **denied** (0)

Session-level reset test also returned 0 leakage.

## Notes

- No medical payload contents logged.
- Platform Admin API support context: `accessMode=PLATFORM_ADMIN_SUPPORT` (see cross-tenant / AWS UAT docs).
- Attachment `storage_key` values for WC case files remapped to promoted `tenants/{liveTenantId}/…` keys during this closeout (`cai-s1r-uat-remap-apply-*`, 13 rows).
