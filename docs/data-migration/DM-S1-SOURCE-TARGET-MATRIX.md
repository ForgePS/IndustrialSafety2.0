# DM-S1 Source → Target Matrix v2

**Source:** `forge-industrial-safety`  
**Companion:** `DM-S1-TARGET-SCHEMA-CONTRACT.md`  
**Rule:** Extraction preserves raw source. Transform/import is later.

## Disposition legend

| Code                  | Meaning                                                |
| --------------------- | ------------------------------------------------------ |
| DIRECT                | Near 1:1                                               |
| TRANSFORM             | Field/type reshape                                     |
| SPLIT                 | One source → many targets                              |
| MERGE                 | Many sources → one target                              |
| PLATFORM_GLOBAL       | Platform-owned; not customer tenant copy               |
| ARCHIVE_ONLY          | Keep in package / offline archive; not live SoT        |
| EXCLUDE_WITH_APPROVAL | Skip unless explicitly approved                        |
| TARGET_MISSING        | TARGET_SCHEMA_GAP — AWS import blocked for this domain |
| UNKNOWN               | Insufficient certainty (drive toward zero)             |

## Matrix

| SOURCE                                           | DISPOSITION                             | TARGET (intent)                       | Notes                       |
| ------------------------------------------------ | --------------------------------------- | ------------------------------------- | --------------------------- |
| organizations                                    | TRANSFORM                               | tenants                               | businessId → tenant map     |
| platformBusinesses                               | TRANSFORM / MERGE                       | tenants                               |                             |
| organization_users                               | SPLIT                                   | users + memberships                   |                             |
| platformUsers                                    | TRANSFORM                               | users                                 |                             |
| Firebase Auth                                    | TRANSFORM                               | Cognito + identity link               | metadata only in DM-S1      |
| sites                                            | TRANSFORM                               | industrial_sites                      | not tip `facilities`        |
| departments                                      | TRANSFORM                               | areas (AMBIGUOUS table)               |                             |
| personnelRecords                                 | TRANSFORM                               | industrial_personnel                  |                             |
| assetRecords                                     | TRANSFORM                               | industrial_equipment                  |                             |
| lotoProcedures                                   | TRANSFORM                               | industrial_loto_procedures            |                             |
| lotoLibraries                                    | TARGET_MISSING                          | —                                     | schema sprint required      |
| lotoRecords                                      | TARGET_MISSING                          | —                                     |                             |
| incidents                                        | TRANSFORM                               | industrial_incidents                  |                             |
| inspectionTemplates                              | TRANSFORM / MERGE                       | industrial_inspections                |                             |
| inspectionRecords                                | TRANSFORM                               | industrial_inspections                |                             |
| formTemplates                                    | TRANSFORM                               | industrial_form_definitions           |                             |
| formSubmissions                                  | TRANSFORM                               | industrial_form_submissions           |                             |
| training_courses                                 | MERGE                                   | industrial_training_records           |                             |
| training_enrollments                             | MERGE                                   | industrial_training_records           |                             |
| chemicalSafetyRecords                            | TRANSFORM                               | industrial_chemical_safety_records    |                             |
| confinedSpaceRecords                             | TRANSFORM                               | industrial_confined_space_records     |                             |
| hotWorkRecords                                   | TRANSFORM                               | industrial_hot_work_records           |                             |
| *SafetyRecords workbook family                   | TRANSFORM                               | industrial_*                          | AMBIGUOUS exact tables      |
| dotComplianceRecords                             | TRANSFORM                               | industrial_* DOT                      | Storage-heavy               |
| companyVehicleDrivers*                           | TARGET_MISSING                          | —                                     | drift + gap                 |
| workersCompCases                                 | TRANSFORM                               | industrial_* WC                       | AMBIGUOUS                   |
| workersComp medical satellites                   | TARGET_MISSING                          | —                                     | policy + schema             |
| correctiveActionRecords                          | TARGET_MISSING                          | —                                     |                             |
| taskRecords                                      | TRANSFORM                               | industrial_tasks                      |                             |
| emergencyResponseRecords                         | TRANSFORM                               | industrial_emergency_response_records |                             |
| qr_links                                         | TRANSFORM                               | qr_links                              | token rotation policy later |
| qr_link_versions                                 | TRANSFORM                               | QR versions                           | AMBIGUOUS SQL name          |
| qr_link_audit_events                             | ARCHIVE_ONLY / MIGRATE_RETENTION_WINDOW | audit                                 | see retention doc           |
| qr_link_scan_events                              | TARGET_MISSING / ARCHIVE_ONLY           | —                                     | DELTA_UNSAFE                |
| scan_*                                           | TARGET_MISSING                          | —                                     |                             |
| controlledDocuments                              | TRANSFORM                               | platform_documents + versions         | + S3                        |
| equipmentDocuments                               | TRANSFORM                               | industrial_equipment_document_links   |                             |
| documentAccessEvents                             | ARCHIVE_ONLY / EXCLUDE_WITH_APPROVAL    | —                                     |                             |
| activityLogs                                     | ARCHIVE_ONLY                            | —                                     | volume                      |
| auth_audit_logs                                  | TRANSFORM / ARCHIVE_ONLY                | audit                                 | LEGACY_ALIAS keys           |
| ehsAuditTemplates (+ versions)                   | PLATFORM_GLOBAL                         | platform template store               | GLOBAL businessId           |
| content_overrides                                | EXCLUDE_WITH_APPROVAL                   | —                                     | unscoped / DELTA_UNSAFE     |
| platform billing / invoices / outbox / templates | EXCLUDE_WITH_APPROVAL                   | billing_*                             | not industrial customer SoT |
| super_admins / platformSettings                  | PLATFORM_GLOBAL / EXCLUDE_WITH_APPROVAL | platform                              |                             |
| equipmentMigrationBatches + rows                 | ARCHIVE_ONLY                            | —                                     | tooling residue             |
| Storage objects                                  | TRANSFORM                               | S3 keys                               | manifest in DM-S1           |

## UNKNOWN → reduced

Remaining UNKNOWN should be empty for named operational collections above. Residual UNKNOWN only where live collection appears in extract but is not listed here — extractor reports must flag those for matrix amendment.

## GLOBAL record policy (summary)

| Collection               | Disposition                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| ehsAuditTemplates        | PLATFORM_GLOBAL                                                    |
| ehsAuditTemplateVersions | PLATFORM_GLOBAL (REFERENCE_GLOBAL for tenant copies created later) |

GLOBAL records **must not** be copied into an arbitrary customer tenant.

## Workers Comp / medical

| Aspect             | Classification                                                             |
| ------------------ | -------------------------------------------------------------------------- |
| Source collections | `workersComp*` family (cases + satellites)                                 |
| Target mapping     | AMBIGUOUS for cases; MISSING_TARGET for medical satellites                 |
| Policy             | REQUIRES_POLICY_DECISION — no raw medical values in committed docs         |
| Retention          | Follow Forge higher-sensitivity handling; do not land in unrestricted logs |

## QR / audit retention dispositions

| Stream                                 | Disposition                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| qr_link_scan_events                    | UNKNOWN → prefer ARCHIVE_ONLY or DO_NOT_MIGRATE until scan schema exists; do not discard package yet |
| qr_link_audit_events                   | MIGRATE_RETENTION_WINDOW or ARCHIVE_ONLY                                                             |
| documentAccessEvents                   | ARCHIVE_ONLY / DO_NOT_MIGRATE                                                                        |
| auth_audit_logs                        | MIGRATE_RETENTION_WINDOW                                                                             |
| activityLogs                           | ARCHIVE_ONLY                                                                                         |
| platform audit / billing notifications | EXCLUDE_WITH_APPROVAL or ARCHIVE_ONLY                                                                |
