# IND-11B — Producers development data load COMPLETE (authorized scope)

**Date:** 2026-08-05  
**Tenant:** Producers Rice Mill → acceptance A (`019faa15-e558-70b6-adcd-a510c3c995f4`)  
**Environment:** development Aurora NONPRODUCTION_LOAD  
**Firebase SoT:** unchanged (no production cutover)

Authorized scope: **all remaining domain loads into development** (metadata-only for docs; **no** Cognito import; **no** Storage blob copy; **no** production SoT flip).

## Load summary (tenant A sample counts)

| Domain                                | Count (verify) |
| ------------------------------------- | -------------: |
| Sites                                 |             27 |
| Equipment                             |           2490 |
| LOTO procedures                       |           2524 |
| Personnel                             |           1009 |
| Training records                      |             18 |
| Form definitions / submissions        |        49 / 34 |
| Inspections                           |              6 |
| Incidents                             |             13 |
| High-risk (sample: CS / hot work)     |        27 / 26 |
| Chemical safety                       |             53 |
| Tasks / emergency                     |         3 / 31 |
| QR links (tokens **rotated**)         |           2505 |
| Platform documents (PENDING_UPLOAD)   |              8 |
| Equipment document links (paths only) |             12 |
| **Sample totals**                     |      **~8835** |

Wave-3 workbooks also loaded: WAH, electrical, crane/rigging, machine, DOT, forklift, WC cases, OSHA, warehouse/mfg/contractor/process/environmental (all `errorCount: 0`).

## Explicitly still out of scope / blocked

| Item                                                   | Why                                                 |
| ------------------------------------------------------ | --------------------------------------------------- |
| Cognito Firebase Auth → user import                    | Fail-closed (not authorized)                        |
| Storage → S3 blob copy                                 | Fail-closed; docs use `PENDING_UPLOAD` placeholders |
| Production Aurora SoT / IND-13 cutover                 | Fail-closed                                         |
| `correctiveActionRecords`                              | No Aurora table                                     |
| `scan_*` family                                        | No applied scan tables / mapping gap                |
| `lotoRecords` / `lotoLibraries`                        | Execution/library targets not in 0031               |
| WC satellites (medical/restrictions/carriers)          | Unmapped                                            |
| `companyVehicleDrivers*`, certificates, `activityLogs` | Unmapped / policy                                   |
| Document access events                                 | 0 loaded (orphaned FKs to pre-import docs)          |

## Evidence

- Wave-2: `evidence/wave2/`
- Wave-3: `evidence/wave3/workbooks-load-result.json`, `coord-load-result.json`, `qr-docs-load-result.json`, `completion-counts-result.json`

## What “working in AWS” still needs beyond data

Module flags for tenant A already ON. Remaining product work for parity:

1. UI modules / API wiring for every domain against Aurora (not Firebase clients).
2. Cognito linking for real operators (separate authorization).
3. Document blob copy when authorized.
4. QR public resolver using rotated tokens (old Firebase URLs will not match).
