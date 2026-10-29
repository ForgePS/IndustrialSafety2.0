# PRODUCERS — AWS UAT (CAI-S1R-UAT-CLOSEOUT)

**Status:** CLOSEOUT EXECUTED  
**Tenant:** `019ff7d0-c20f-7659-81e4-c0cd68e23262` (`Producers Rice Mill`)  
**Date (UTC):** 2026-08-14  
**Remediation run:** `cai-s1r-apply2-20260814T110922Z`  
**Schema:** `0040_industrial_domain_s1` present (tip may include later migrations)

## Session / health

| Gate                                              | Result                                       |
| ------------------------------------------------- | -------------------------------------------- |
| AWS_SESSION (account `511343547817`, `us-east-1`) | **PASS**                                     |
| API_HEALTH (`/health` via CloudFront)             | **PASS**                                     |
| DATABASE_HEALTH                                   | **PASS**                                     |
| PRODUCERS_CONTEXT                                 | **PASS** (displayName `Producers Rice Mill`) |
| PLATFORM_ADMIN_CONTEXT                            | **PASS** (`PLATFORM_ADMIN_SUPPORT`)          |

## Interactive API module matrix

Authenticated Platform Admin support context against CloudFront API. Read-only preferred.

| Module                  | Result           | Notes                                                                                           |
| ----------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| Dashboard / bootstrap   | **PASS***        | Counts via sites/personnel/related APIs; dedicated bootstrap route not on industrial controller |
| Personnel list          | **PASS**         | 1058                                                                                            |
| Personnel relationships | **PASS***        | DB + list payload includes site/department source fields                                        |
| Training                | **PASS***        | 17 rows in DB (no dedicated list route on industrial controller yet)                            |
| Certifications          | **PASS***        | template row present                                                                            |
| Incidents               | **PASS***        | 12 rows DB                                                                                      |
| Inspections             | **PASS***        | 6 rows DB                                                                                       |
| Observations            | **PASS (empty)** | 0 source package rows / 0 DB                                                                    |
| JSA                     | **PASS (empty)** | 0 source package rows / 0 DB                                                                    |
| Forms                   | **PASS***        | 48 defs / 34 submissions                                                                        |
| LOTO procedures         | **PASS**         | API 2539                                                                                        |
| LOTO records            | **PASS**         | API 59                                                                                          |
| DOT                     | **PASS***        | 48 rows DB                                                                                      |
| Fleet drivers / MVR     | **PASS**         | API 201                                                                                         |
| Fleet vehicles          | **PASS**         | 0 (not fabricated)                                                                              |
| Corrective actions      | **PASS**         | API 12                                                                                          |
| QR / scan               | **PASS***        | 2524 links / 2524 versions; active parents intact                                               |
| EHS templates           | **PASS***        | 34 platform-global templates/versions; GLOBAL_TEMPLATE_LEAKAGE 0 under Producers tenant_id      |
| Documents / attachments | **PASS**         | After storage_key remap; S3 HEAD 13/13; public access blocked                                   |
| Workers Comp claims     | **PASS***        | 27 cases DB + RLS medical gates                                                                 |

\*Data-plane and/or partial API surface; browser pixel UI not required where API/DB proves tenant-scoped data.

## Count / duplicate / mapping

| Gate                     | Result                                                    |
| ------------------------ | --------------------------------------------------------- |
| COUNT_SANITY             | **PASS**                                                  |
| IMPORT_DUPLICATE_SANITY  | **PASS** (0 dup source_document_id samples; id-map clean) |
| MIGRATION_MAPPING_SAMPLE | **PASS**                                                  |
| FABRICATED_VEHICLES      | **0**                                                     |
| PACKAGE_TWIN_TENANT_ROWS | **0**                                                     |

## Client / observability (closeout window)

| Gate                                        | Result                                                             |
| ------------------------------------------- | ------------------------------------------------------------------ |
| NEW_CRITICAL_ERRORS                         | **0** unexplained (no production CRITICAL spike attributed to UAT) |
| NEW_SECURITY_ERRORS                         | **0**                                                              |
| DOCUMENT_ACCESS_ERRORS                      | **0** unexplained after key remap                                  |
| UNHANDLED_5XX (probed routes)               | **0**                                                              |
| FAILED_TO_FETCH_PRIMARY_UX                  | **0** on probed API routes                                         |
| CloudWatch ALARM (production API scale-low) | Informational only — not treated as security/import failure        |

## Cutover controls

| Gate                     | Result      |
| ------------------------ | ----------- |
| FIREBASE_ACTIVE          | **YES**     |
| DELTA_SYNC               | **NOT RUN** |
| FIREBASE_WRITE_FREEZE    | **NOT RUN** |
| CUSTOMER_TRAFFIC_CHANGED | **NO**      |
| CUSTOMER_DNS_CHANGED     | **NO**      |
| CUSTOMER_CUTOVER         | **NOT RUN** |

## Attachment key remediation (this closeout)

Importer stored Firebase-relative `storage_key` values; file promotion wrote `tenants/{liveTenantId}/…` with business-id→UUID substitution. Closeout remapped **13** `industrial_attachments.storage_key` rows to match promoted objects (`headOk=13`).
