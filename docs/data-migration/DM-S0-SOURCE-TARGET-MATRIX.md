# DM-S0 Source → Target Matrix (Preliminary)

**Source:** Firebase `forge-industrial-safety`  
**Target platform:** Forge AWS Aurora (production schema tip includes through `0038_mk_s21_security_hardening`)  
**Status:** Analysis only — no transforms implemented

## Important schema note

On the current monorepo tip, Drizzle SQL migrations through `0038` cover platform SaaS foundations (tenants, users, auth, onboarding, billing, notifications, documents branding, jobs, analytics, security hardening). **Industrial domain tables used in prior ind-11 development loads are not present as first-class drizzle migrations in this tip.**

Therefore many industrial mappings are classified **UNKNOWN / TARGET ONLY (program evidence)** until DM-S1 confirms the production industrial schema package to apply.

## Classification legend

| Code        | Meaning                               |
| ----------- | ------------------------------------- |
| DIRECT      | Near 1:1 field/entity mapping         |
| TRANSFORM   | Needs reshaping / type coercion       |
| SPLIT       | One source → many targets             |
| MERGE       | Many sources → one target             |
| NO TARGET   | Intentionally not migrated            |
| TARGET ONLY | Exists in AWS without Firebase source |
| UNKNOWN     | Insufficient schema certainty         |

## Matrix (high level)

| SOURCE FIREBASE                                    | TARGET AWS (intended)                    | Class                         | Notes                                                  |
| -------------------------------------------------- | ---------------------------------------- | ----------------------------- | ------------------------------------------------------ |
| `organizations` / `platformBusinesses`             | `tenants` (+ org records)                | TRANSFORM                     | businessId → tenant_key/id mapping table               |
| `organization_users` / `platformUsers`             | `users` + `persons` + memberships        | SPLIT                         | Auth UID linkage separate                              |
| Firebase Auth users                                | Cognito + `authentication_identities`    | TRANSFORM                     | Prior ind-11 used email join; hash export not in DM-S0 |
| `sites`                                            | facilities / industrial sites            | TRANSFORM                     | Scoped by organizationId                               |
| `departments`                                      | areas / org units                        | TRANSFORM                     |                                                        |
| `personnelRecords`                                 | industrial personnel / persons           | TRANSFORM                     |                                                        |
| `assetRecords`                                     | industrial equipment                     | TRANSFORM                     |                                                        |
| `lotoProcedures` / `lotoLibraries` / `lotoRecords` | LOTO procedures/revisions/records        | TRANSFORM / SPLIT             |                                                        |
| `incidents`                                        | industrial incidents                     | TRANSFORM                     |                                                        |
| `inspectionTemplates` / `inspectionRecords`        | inspections                              | TRANSFORM                     |                                                        |
| `formTemplates` / `formSubmissions`                | forms                                    | TRANSFORM                     |                                                        |
| `training_courses` / `training_enrollments`        | training                                 | TRANSFORM                     |                                                        |
| `*SafetyRecords` module family                     | module-specific industrial tables        | TRANSFORM / UNKNOWN           | Confirm target DDL                                     |
| `workersComp*` family                              | WC domain tables                         | TRANSFORM / UNKNOWN           | Medical satellites sensitive                           |
| `dotComplianceRecords` / `companyVehicleDrivers*`  | DOT / drivers                            | TRANSFORM                     | Storage-heavy                                          |
| `qr_links` / versions / audit / scan_*             | QR / scan domain                         | TRANSFORM / PARTIAL NO TARGET | Audit volume large                                     |
| `controlledDocuments` / `equipmentDocuments`       | `platform_documents` + versions          | TRANSFORM                     | + Storage copy                                         |
| Storage objects                                    | documents bucket keys                    | TRANSFORM                     | Path→tenant map                                        |
| `activityLogs` / `*_audit_*`                       | `audit_events` or archive                | MERGE / NO TARGET             | Decide retention                                       |
| `platformInvoices` / billing outbox/templates      | billing domain                           | TRANSFORM / NO TARGET         | SaaS billing vs customer                               |
| `super_admins` / `platformSettings`                | platform config                          | TRANSFORM / TARGET ONLY mix   | Not customer tenants                                   |
| `content_overrides`                                | UNKNOWN                                  | UNKNOWN                       | Unscoped                                               |
| `equipmentMigrationBatches/rows`                   | import jobs / discard                    | NO TARGET / TRANSFORM         | Migration tooling residue                              |
| —                                                  | Cognito pool, entitlements, RLS policies | TARGET ONLY                   |                                                        |
| —                                                  | Platform catalog permissions/templates   | TARGET ONLY                   |                                                        |

## Unknown mappings requiring DM-S1 decisions

1. Exact production industrial DDL to apply before load
2. Whether QR/scan/audit high-volume streams migrate or archive offline
3. Handling of `GLOBAL` EHS templates
4. Whether `business-forge-default` migrates to a platform tenant or is skipped
5. Workers Comp medical attachments retention/redaction policy

## Target-only entities (examples)

- Cognito user pool / app clients
- Aurora RLS session GUCs / bypass patterns
- Platform entitlement catalog
- Synthetic UAT tenants from PROD-S1C (must not collide with customer business ids)
