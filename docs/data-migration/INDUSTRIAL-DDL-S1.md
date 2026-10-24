# INDUSTRIAL-DDL-S1 — Target Schema Completion

**Checkpoint:** FORGE-DATA-MIGRATION INDUSTRIAL-DDL-S1  
**DM-S2 commit:** `3e6690a`  
**Migration:** `0040_industrial_domain_s1.sql` (after `0039_module_catalog_s2`)

## INDUSTRIAL_DDL_SOURCE

| Finding                        | Status                                               |
| ------------------------------ | ---------------------------------------------------- |
| Tip Drizzle before this sprint | **genuinely missing** industrial domain DDL          |
| Live IND-11 Aurora             | attested tables (evidence/loaders) not tip-committed |
| Other branch thin ops          | `industrial_ops_records` only (not used)             |
| This sprint                    | **created tip DDL** `0040_industrial_domain_s1`      |

## Gap resolution (former 14 MISSING)

| Domain                                                        | Classification                                        | Target                                                |
| ------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| LOTO libraries / records (+ steps/energy/isolation/revisions) | LIVE_OPERATIONAL                                      | `industrial_loto_*`                                   |
| scan_* + QR scan events                                       | LIVE_OPERATIONAL / AURORA_HISTORY                     | `industrial_scan_*`, `industrial_qr_link_scan_events` |
| Corrective actions                                            | LIVE_OPERATIONAL                                      | `industrial_corrective_actions`                       |
| WC medical / restrictions / carriers / work status            | LIVE_OPERATIONAL (+ restricted medical RLS)           | `industrial_workers_comp_*`                           |
| Fleet drivers/settings                                        | LIVE_OPERATIONAL                                      | `industrial_fleet_drivers`, `*_settings`              |
| Fleet vehicles                                                | CREATE_SCHEMA (no Firebase vehicle corpus; API-ready) | `industrial_fleet_vehicles`                           |

## Controlled Aurora import plan (NOT EXECUTED)

See `DM-S2-CONTROLLED-AURORA-IMPORT-PLAN.md`.

## Safety

- PRODUCTION_SCHEMA_DEPLOYED: NO
- AWS_CUSTOMER_DATA_IMPORTED: NO
- FIREBASE_CHANGED: NO
- CUSTOMER_TRAFFIC/DNS: NO
