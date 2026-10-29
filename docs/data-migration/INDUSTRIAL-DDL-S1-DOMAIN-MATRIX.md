# INDUSTRIAL-DDL-S1 Domain Matrix

Final statuses: READY | CREATE_SCHEMA | AURORA_HISTORY | S3_ARCHIVE | PLATFORM_GLOBAL | EXCLUDE_APPROVED

Code SoT: `tools/data-migration/transformer/src/source-target-matrix.ts`

| DOMAIN             | CUSTOMER_MODULE    | SOURCE_COLLECTIONS                    | TARGET                                      | STATUS           | DISPOSITION            |
| ------------------ | ------------------ | ------------------------------------- | ------------------------------------------- | ---------------- | ---------------------- |
| Facilities         | CORE               | sites                                 | industrial_sites                            | READY            | AURORA operational     |
| Departments        | CORE               | departments                           | industrial_departments                      | READY            | AURORA operational     |
| Personnel          | PERSONNEL          | personnelRecords                      | industrial_personnel                        | READY            | AURORA operational     |
| Equipment          | EQUIPMENT          | assetRecords                          | industrial_equipment                        | READY            | AURORA operational     |
| Training           | TRAINING           | training_*                            | industrial_training_records                 | READY            | AURORA operational     |
| Certifications     | TRAINING           | certificate_*                         | templates + attachments                     | READY            | AURORA + S3 meta       |
| Incidents          | INCIDENTS          | incidents                             | industrial_incidents                        | READY            | AURORA operational     |
| Inspections        | INSPECTIONS        | inspection*                           | industrial_inspections                      | READY            | AURORA operational     |
| Observations       | OBSERVATIONS       | (none in Firebase)                    | industrial_observations                     | CREATE_SCHEMA    | API-ready empty        |
| JSAs               | JSAS               | (none in Firebase)                    | industrial_jsas                             | CREATE_SCHEMA    | API-ready empty        |
| Forms              | FORMS              | form*                                 | industrial_form_*                           | READY            | AURORA operational     |
| LOTO               | LOCKOUT_TAGOUT     | loto*                                 | industrial_loto_*                           | READY            | AURORA operational     |
| DOT                | DOT_COMPLIANCE     | dotComplianceRecords                  | industrial_dot_compliance_records           | READY            | AURORA operational     |
| Fleet              | FLEET              | companyVehicleDrivers*                | industrial_fleet_*                          | READY            | vehicles CREATE_SCHEMA |
| Workers Comp       | WORKERS_COMP       | workersComp*                          | industrial_workers_comp_*                   | READY            | medical restricted RLS |
| Corrective Actions | CORRECTIVE_ACTIONS | correctiveActionRecords               | industrial_corrective_actions               | READY            | AURORA operational     |
| QR definitions     | QR_LINKS           | qr_links, versions                    | qr_links, qr_link_versions                  | READY            | AURORA operational     |
| Scan definitions   | SCAN               | scan_qr_codes, assignments, schedules | industrial_scan_*                           | READY            | AURORA operational     |
| Scan/QR events     | SCAN               | qr_link_scan_events, scan_audit_logs  | industrial___scan__ / audit                 | READY            | AURORA_HISTORY         |
| Attachments        | DOCUMENTS          | controlledDocuments, *Documents, libs | platform_documents + industrial_attachments | READY            | meta Aurora / blobs S3 |
| Settings/Branding  | CORE               | platformSettings / tenant branding    | existing tip tables                         | READY            | PLATFORM / tenant      |
| Audit/history      | —                  | activityLogs, auth_audit_logs, …      | industrial_history_records                  | AURORA_HISTORY   | history                |
| Platform global    | —                  | ehsAuditTemplates*                    | platform_ehs_audit_*                        | PLATFORM_GLOBAL  | no Producers ownership |
| Exclusions         | —                  | billing, messaging, …                 | excluded/*                                  | EXCLUDE_APPROVED | approved skip          |

UNKNOWN_SOURCE_TARGET: 0  
TARGET_MISSING: 0  
TARGET_SCHEMA_GAPS: 0
