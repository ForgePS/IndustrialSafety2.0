# Producers P2 Phase 4 — Staging UAT checklist (S1)

**Tenant:** `producers-rice-mill-staging` · `0882c865-59c2-49a6-ab88-ce6ca89be30c`  
**Host:** `https://producers-rice-mill.forgepublicsafety.com/` (pre-announce; dark/staging dress)  
**Status:** DRAFT — awaiting Producers lead execution + S2 sign-off  
**API smoke baseline:** `api-smoke-staging.json` (2026-08-06) PASS

## Personas

| Persona | Account | Focus |
| --- | --- | --- |
| Admin | `safetyadmin@producersrice.com` | Modules on, CRUD sample, roster |
| Operator | `jlackie@producersrice.com` | Day-1 view + limited write |

## Day-1 checks

| # | Module | Pass? | Notes |
| --- | --- | --- | --- |
| 1 | Login + tenant context = staging | | |
| 2 | Personnel list (~1008) | | |
| 3 | Sites / areas (~26 sites) | | |
| 4 | Equipment (~2489) | | |
| 5 | LOTO (~2523) | | |
| 6 | Training / forms / inspections / incidents | | Thin volumes OK |
| 7 | Confined space / hot work | | |
| 8 | Documents list / open (S3 AVAILABLE) | | API route may 404 on tip — UI path |
| 9 | QR open with **rotated** token | | Remint policy before Phase 5 |
| 10 | No Tenant A / twin bleed in UI | | |

## Defects

| ID | Sev | Summary | Blocks twin? |
| --- | --- | --- | --- |
| | | | |

## S2 sign-off

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Producers lead (UAT owner) | | | |
