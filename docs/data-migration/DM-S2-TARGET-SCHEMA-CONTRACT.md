# DM-S2 Target Schema Contract

**Program:** FORGE-DATA-MIGRATION  
**Sprint:** DM-S2A / DM-S2B  
**Companion code:** `tools/data-migration/transformer/src/source-target-matrix.ts`

## Resolution status

| Gate                                           | Status                                              |
| ---------------------------------------------- | --------------------------------------------------- |
| TARGET_SCHEMA                                  | **CONDITIONS**                                      |
| Tip `packages/database/drizzle` industrial DDL | **MISSING** through `0039`                          |
| Live IND-11 Aurora industrial tables           | **CONFIRMED** for READY modules                     |
| AWS import of customer records                 | **NOT RUN** (blocked by CONDITIONS + separate auth) |

## Persistence map (operational domains)

| MODULE                          | TARGET_SERVICE               | TARGET_TABLE_OR_ENTITY                                    | TENANT_KEY          | FACILITY_KEY | IMPLEMENTATION_STATUS                                  |
| ------------------------------- | ---------------------------- | --------------------------------------------------------- | ------------------- | ------------ | ------------------------------------------------------ |
| Facilities (sites)              | Aurora                       | industrial_sites                                          | aws tenant UUID     | self         | READY                                                  |
| Departments                     | Aurora                       | industrial_departments                                    | aws tenant UUID     | siteId       | PARTIAL                                                |
| Personnel                       | Aurora                       | industrial_personnel                                      | aws tenant UUID     | siteId       | READY                                                  |
| Training                        | Aurora                       | industrial_training_records                               | aws tenant UUID     | —            | READY                                                  |
| Certifications                  | Aurora + S3                  | industrial_certificate_templates / attachments            | aws tenant UUID     | —            | PARTIAL                                                |
| Incidents                       | Aurora                       | industrial_incidents                                      | aws tenant UUID     | siteId       | READY                                                  |
| Inspections                     | Aurora                       | industrial_inspections                                    | aws tenant UUID     | siteId       | READY                                                  |
| Observations                    | —                            | —                                                         | —                   | —            | MISSING (no dedicated source collection; not invented) |
| JSAs                            | —                            | —                                                         | —                   | —            | MISSING (no dedicated source collection; not invented) |
| Forms                           | Aurora                       | industrial_form_definitions / industrial_form_submissions | aws tenant UUID     | —            | READY                                                  |
| LOTO procedures                 | Aurora                       | industrial_loto_procedures                                | aws tenant UUID     | siteId       | READY                                                  |
| LOTO libraries/records          | archive                      | archive/loto_*                                            | —                   | —            | MISSING                                                |
| DOT                             | Aurora                       | industrial_dot_compliance_records                         | aws tenant UUID     | —            | PARTIAL                                                |
| Fleet / company vehicles        | archive                      | archive/company_vehicle_*                                 | —                   | —            | MISSING                                                |
| Workers Comp cases              | Aurora                       | industrial_workers_comp_cases                             | aws tenant UUID     | —            | PARTIAL                                                |
| Workers Comp medical satellites | archive                      | archive/workers_comp_*                                    | —                   | —            | MISSING                                                |
| Attachments                     | S3 staging + Aurora metadata | storage/source + document links                           | path / businessId   | —            | READY (staged)                                         |
| QR / Scan links                 | Aurora                       | qr_links (+ versions PARTIAL)                             | aws tenant UUID     | —            | READY / PARTIAL                                        |
| QR scan events / scan_*         | archive                      | archive/scan_*                                            | —                   | —            | MISSING                                                |
| Analytics                       | —                            | —                                                         | —                   | —            | ARCHIVE_ONLY / not industrial SoT                      |
| Settings / Branding             | platform / tenants           | platform_settings + tenant branding fields                | platform / customer | —            | READY (platform) / PARTIAL                             |
| Audit                           | archive                      | archive/_*audit*_                                         | —                   | —            | ARCHIVE_ONLY                                           |

## TARGET_SCHEMA_GAPS

1. `lotoLibraries` / `lotoRecords`
2. `scan_*` + `qr_link_scan_events`
3. `correctiveActionRecords`
4. Workers Comp medical / restrictions / carriers / work-status satellites
5. `companyVehicleDrivers` / `companyVehicleDriverSettings`
6. Industrial DDL **re-commit to tip Drizzle migrations** before production Aurora apply
7. Observations / JSAs — no Firebase root collection; do not invent targets

## Schema sprint policy (this workstream)

- Transformer **does not invent** Aurora mappings for MISSING domains — they land in `archive/*` NDJSON.
- Tip DDL authoring from live Aurora `pg_dump` is required in a dedicated schema sprint (credentials + change control). Not applied here.
- Do **not** deploy industrial DDL or import customer data in DM-S2.

## Authoritative customer AWS tenant

| Source                                      | AWS                                                            |
| ------------------------------------------- | -------------------------------------------------------------- |
| `business-1782553339499`                    | `5da680d3-50f5-46ac-8b85-6cf454b6a0da` (`producers-rice-mill`) |
| Approved legacy alias `Producers Rice Mill` | same AWS tenant (explicit DM-S2 approval)                      |
