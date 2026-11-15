# Data Migration Inventory

**Sprint:** 1A  
**Date:** 2026-07-25  
**Volumes:** UNKNOWN (no production export executed in this sprint)

Preserve source identifiers per directive: `source_system`, `source_project`, `source_collection`, `source_document_id`, `source_path`, `migration_batch_id`.

## 1. Source systems

| source_system               | source_project                               | Primary repo         |
| --------------------------- | -------------------------------------------- | -------------------- |
| `forge-academy-firebase`    | `forge-academy-95f84`                        | forge-academy-backup |
| `forge-rms-firebase`        | `rms-dashboard-7562e`                        | forge-rms            |
| `forge-rms-firebase-legacy` | `rms-dashboard-7562e` / `horn-lake-fire-app` | firebase-app shapes  |

## 2. Academy → target entity map (high level)

| Firestore collection / path                                    | Likely AWS target                          | Notes                                           |
| -------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| `users`                                                        | `users`, `user_identities`, Cognito import | Map roles → assignments                         |
| `students`                                                     | `persons` + academy student record         | FEMA SID → protected identifier; DOB restricted |
| `departments`                                                  | `organizations`                            | Partner agencies                                |
| `courses` / `classes` / `registrations`                        | academy course/class/enrollment            | Preserve IDs                                    |
| `attendanceDays`                                               | attendance sessions                        |                                                 |
| `instructors` (+ related)                                      | instructor records + memberships           |                                                 |
| `certificates*` / `studentCertifications`                      | certificates + certifications              | Templates → documents                           |
| `skill*`                                                       | skills evaluations                         |                                                 |
| testing collections                                            | exam/question domain                       | Large graph; migrate with version snapshots     |
| `invoices*`                                                    | finance invoices                           | No card data observed                           |
| `rooms` / `roomAssignments` / `housing*`                       | dormitory domain                           |                                                 |
| `hubIdentities` / merges / FEMA corrections                    | ForgePersonId + merge history              | Critical for cross-product                      |
| `platformAcademies` / subscriptions                            | tenants + subscriptions                    |                                                 |
| Digital Dashboard collections                                  | optional product module                    | May phase after core                            |
| `migrationProjects/**`                                         | tooling history                            | Decide archive vs skip                          |
| Storage: student-profiles, certificates, skills, DD, migration | S3 `tenants/{id}/…`                        | Hash + content-type inventory needed            |

## 3. RMS → target entity map (high level)

### List documents (`departments/{deptId}/lists/{listKey}`)

These often store **arrays of records in a single document** — transformation must explode to rows.

| List key                                                 | Target domain                                     |
| -------------------------------------------------------- | ------------------------------------------------- |
| `hlfd-rms-personnel`                                     | persons + RMS personnel (+ sensitive identifiers) |
| `hlfd-rms-certifications`                                | certifications                                    |
| `hlfd-rms-training`                                      | training events / attendance                      |
| `hlfd-rms-apparatus` / assets / work-orders              | fleet                                             |
| `hlfd-rms-documents`                                     | documents                                         |
| `hlfd-rms-occupancies` / inspections / preplans          | prevention                                        |
| `hlfd-rms-hose-tests`                                    | hose testing                                      |
| scheduling/roster/leave/OT/trades/call-shifts/time-cards | scheduling                                        |
| `hlfd-rms-daily-logs`                                    | daily log                                         |
| digital dashboard lists                                  | signage                                           |
| Active911 / alert lists                                  | alerts / integrations                             |
| `hlfd-rms-neris-fire-reports`                            | incident/NERIS                                    |

### Normalized department subcollections

Fleet (`fleet*`), inspections (`inspection*`, `occupancies`, `violations`, …), preplans (`preplan*`), hydrant damage (`hydrantDamage*`, water companies/districts), academy hub (`people`, `academy*`) — migrate as first-class tables with `tenant_id`.

### Legacy root collections (firebase-app / shared project)

`hydrants`, `hydrantInspections`, `hydrantFlowTests`, `dailyActivity`, `hoseTests`, `preFirePlans`, `rmsData/{doc}`, `appData/{doc}` — **reconcile against department-scoped copies** before cutover; risk of duplicates.

### Platform

`platformDepartments` → tenants; `platformCreators` → creator users; `platformSubscriptions` / plans → subscriptions; `rmsGateways` → tenant routing; code library publications → shared content.

### Storage

All `departments/{id}/…` and legacy root objects → versioned S3 with tenant prefix. Current rules are open — migrate with access audit.

## 4. Identity / crosswalk requirements

| Identifier                                 | Handling                                                           |
| ------------------------------------------ | ------------------------------------------------------------------ |
| Firebase Auth UID                          | Map to Cognito / `user_identities`                                 |
| `forgePersonId`                            | Preserve as immutable ForgePersonId                                |
| FEMA SID                                   | Protected identifier; correction history                           |
| `socialSecurityNumber` (RMS personnel)     | Encrypt to `person_sensitive_identifiers`; never plain column      |
| Badge / payroll / firefighter / agency IDs | External identifiers                                               |
| List-item `id` fields inside array docs    | Become primary business keys + `source_document_id` of parent list |

## 5. Attachment migration

| Source                                                 | Destination pattern                    |
| ------------------------------------------------------ | -------------------------------------- |
| Academy Storage namespaces                             | `tenants/{tenantId}/documents/…` etc.  |
| RMS Storage department trees                           | Same                                   |
| Jotform PDFs / email attachments                       | Import via hydrant damage records      |
| Base64 / inline photo fields (if any in hydrant flows) | Extract to objects; UNKNOWN prevalence |

## 6. Migration pipeline notes (from existing Academy tooling)

Academy already models: export → map → stage → dry-run → approve → import → reconcile → rollback. Reuse concepts in AWS Universal Import Center; do not discard Academy migration UX without mapping.

## 7. Risks

- Dual storage of personnel/hydrants (list docs vs subcollections vs root collections).
- Array-in-document size limits may already force partial data patterns — need export scripts, not only rules inventory.
- Synthetic FEMA SID / DOB placeholders from RMS import paths may pollute identity matching.
- Open Storage may contain unexpected objects outside documented prefixes.

## 8. Unknowns requiring measurement sprint

- Document counts per collection/list
- Max list-document payload sizes
- Orphan Storage objects
- Active vs archived department IDs in production
