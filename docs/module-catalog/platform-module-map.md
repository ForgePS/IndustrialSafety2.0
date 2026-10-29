# Platform module map (MODULE-CATALOG-S2)

Authoritative mapping of current Forge catalog modules. Source of truth:
`packages/contracts/src/module-catalog.ts` (+ Industrial registry).

Canonical identity is `(productCode, moduleCode)`. Record IDs are environment-specific
and appear only after seed/migration; this document uses logical keys.

| PLATFORM   | MODULE                 | KEY                  | CATEGORY           | CURRENT RECORD IDS | CANONICAL ID                          | STATUS      | CUSTOMER ASSIGNABLE | NOTES                                     |
| ---------- | ---------------------- | -------------------- | ------------------ | ------------------ | ------------------------------------- | ----------- | ------------------- | ----------------------------------------- |
| INDUSTRIAL | Industrial Core        | CORE                 | Platform           | per-env UUID       | FORGE_INDUSTRIAL:CORE                 | READY       | no                  | PLATFORM_CORE; auto-entitled with product |
| INDUSTRIAL | Analytics              | ANALYTICS            | Analytics          | per-env UUID       | FORGE_INDUSTRIAL:ANALYTICS            | UNAVAILABLE | no                  | LEGACY_ONLY in industrial registry        |
| INDUSTRIAL | Personnel              | PERSONNEL            | People & Workforce | per-env UUID       | FORGE_INDUSTRIAL:PERSONNEL            | READY       | yes                 | Distinct from RMS Personnel               |
| INDUSTRIAL | Training               | TRAINING             | People & Workforce | per-env UUID       | FORGE_INDUSTRIAL:TRAINING             | READY       | yes                 | Distinct from RMS Training                |
| INDUSTRIAL | JSAs                   | JSAS                 | People & Workforce | per-env UUID       | FORGE_INDUSTRIAL:JSAS                 | READY       | yes                 |                                           |
| INDUSTRIAL | Incidents              | INCIDENTS            | Safety Management  | per-env UUID       | FORGE_INDUSTRIAL:INCIDENTS            | READY       | yes                 |                                           |
| INDUSTRIAL | OSHA Recordkeeping     | OSHA                 | Safety Management  | per-env UUID       | FORGE_INDUSTRIAL:OSHA                 | READY       | yes                 |                                           |
| INDUSTRIAL | Workers' Compensation  | WORKERS_COMP         | Safety Management  | per-env UUID       | FORGE_INDUSTRIAL:WORKERS_COMP         | READY       | yes                 |                                           |
| INDUSTRIAL | Inspections            | INSPECTIONS          | Safety Management  | per-env UUID       | FORGE_INDUSTRIAL:INSPECTIONS          | READY       | yes                 |                                           |
| INDUSTRIAL | Forms                  | FORMS                | Tools              | per-env UUID       | FORGE_INDUSTRIAL:FORMS                | READY       | yes                 |                                           |
| INDUSTRIAL | Observations           | OBSERVATIONS         | Safety Management  | per-env UUID       | FORGE_INDUSTRIAL:OBSERVATIONS         | READY       | yes                 |                                           |
| INDUSTRIAL | Risk Register          | RISK                 | Safety Management  | per-env UUID       | FORGE_INDUSTRIAL:RISK                 | READY       | yes                 |                                           |
| INDUSTRIAL | Scan                   | SCAN                 | Tools              | per-env UUID       | FORGE_INDUSTRIAL:SCAN                 | UNAVAILABLE | no                  | LEGACY_ONLY                               |
| INDUSTRIAL | DOT Compliance         | DOT_COMPLIANCE       | Compliance         | per-env UUID       | FORGE_INDUSTRIAL:DOT_COMPLIANCE       | READY       | yes                 |                                           |
| INDUSTRIAL | Contractor Safety      | CONTRACTOR_SAFETY    | Operations         | per-env UUID       | FORGE_INDUSTRIAL:CONTRACTOR_SAFETY    | READY       | yes                 |                                           |
| INDUSTRIAL | Process Safety         | PROCESS_SAFETY       | Operations         | per-env UUID       | FORGE_INDUSTRIAL:PROCESS_SAFETY       | READY       | yes                 |                                           |
| INDUSTRIAL | Environmental Safety   | ENVIRONMENTAL_SAFETY | Compliance         | per-env UUID       | FORGE_INDUSTRIAL:ENVIRONMENTAL_SAFETY | READY       | yes                 |                                           |
| INDUSTRIAL | Assets & Equipment     | EQUIPMENT            | Operations         | per-env UUID       | FORGE_INDUSTRIAL:EQUIPMENT            | READY       | yes                 |                                           |
| INDUSTRIAL | Forklifts              | FORKLIFTS            | Operations         | per-env UUID       | FORGE_INDUSTRIAL:FORKLIFTS            | READY       | yes                 |                                           |
| INDUSTRIAL | Cranes & Rigging       | CRANES_RIGGING       | Operations         | per-env UUID       | FORGE_INDUSTRIAL:CRANES_RIGGING       | READY       | yes                 |                                           |
| INDUSTRIAL | Machine Safety         | MACHINE_SAFETY       | Operations         | per-env UUID       | FORGE_INDUSTRIAL:MACHINE_SAFETY       | READY       | yes                 |                                           |
| INDUSTRIAL | Electrical Safety      | ELECTRICAL_SAFETY    | Compliance         | per-env UUID       | FORGE_INDUSTRIAL:ELECTRICAL_SAFETY    | READY       | yes                 |                                           |
| INDUSTRIAL | Lockout/Tagout         | LOCKOUT_TAGOUT       | Compliance         | per-env UUID       | FORGE_INDUSTRIAL:LOCKOUT_TAGOUT       | READY       | yes                 |                                           |
| INDUSTRIAL | Confined Space         | CONFINED_SPACE       | Compliance         | per-env UUID       | FORGE_INDUSTRIAL:CONFINED_SPACE       | READY       | yes                 |                                           |
| INDUSTRIAL | Hot Work               | HOT_WORK             | Compliance         | per-env UUID       | FORGE_INDUSTRIAL:HOT_WORK             | READY       | yes                 |                                           |
| INDUSTRIAL | Working at Heights     | WORKING_AT_HEIGHTS   | Compliance         | per-env UUID       | FORGE_INDUSTRIAL:WORKING_AT_HEIGHTS   | READY       | yes                 |                                           |
| INDUSTRIAL | Chemical Safety        | CHEMICAL_SAFETY      | Compliance         | per-env UUID       | FORGE_INDUSTRIAL:CHEMICAL_SAFETY      | READY       | yes                 |                                           |
| INDUSTRIAL | Warehouse Safety       | WAREHOUSE_SAFETY     | Operations         | per-env UUID       | FORGE_INDUSTRIAL:WAREHOUSE_SAFETY     | READY       | yes                 |                                           |
| INDUSTRIAL | Manufacturing Safety   | MANUFACTURING_SAFETY | Operations         | per-env UUID       | FORGE_INDUSTRIAL:MANUFACTURING_SAFETY | READY       | yes                 |                                           |
| INDUSTRIAL | Emergency Response     | EMERGENCY_RESPONSE   | Operations         | per-env UUID       | FORGE_INDUSTRIAL:EMERGENCY_RESPONSE   | READY       | yes                 |                                           |
| INDUSTRIAL | Tasks                  | TASKS                | Tools              | per-env UUID       | FORGE_INDUSTRIAL:TASKS                | READY       | yes                 |                                           |
| INDUSTRIAL | Messaging              | MESSAGING            | Tools              | per-env UUID       | FORGE_INDUSTRIAL:MESSAGING            | READY       | yes                 |                                           |
| INDUSTRIAL | Document Control       | DOCUMENTS            | Tools              | per-env UUID       | FORGE_INDUSTRIAL:DOCUMENTS            | READY       | yes                 | Distinct from RMS Documents               |
| INDUSTRIAL | QR Links               | QR_LINKS             | Tools              | per-env UUID       | FORGE_INDUSTRIAL:QR_LINKS             | READY       | yes                 |                                           |
| INDUSTRIAL | Reporting              | REPORTING            | Analytics          | per-env UUID       | FORGE_INDUSTRIAL:REPORTING            | READY       | yes                 | Distinct from RMS Reports                 |
| INDUSTRIAL | Import Center          | IMPORT               | Tools              | per-env UUID       | FORGE_INDUSTRIAL:IMPORT               | READY       | yes                 |                                           |
| INDUSTRIAL | AI Narrative Assistant | AI_NARRATIVE         | Tools              | per-env UUID       | FORGE_INDUSTRIAL:AI_NARRATIVE         | READY       | yes                 | SHARED_SERVICE variant                    |
| RMS        | RMS Core               | CORE                 | Platform           | per-env UUID       | FORGE_RMS:CORE                        | READY       | no                  | PLATFORM_CORE                             |
| RMS        | Personnel              | PERSONNEL            | Workforce          | per-env UUID       | FORGE_RMS:PERSONNEL                   | READY       | yes                 | Platform-specific variant                 |
| RMS        | Training               | TRAINING             | Workforce          | per-env UUID       | FORGE_RMS:TRAINING                    | READY       | yes                 | Platform-specific variant                 |
| RMS        | Apparatus              | APPARATUS            | Assets             | per-env UUID       | FORGE_RMS:APPARATUS                   | READY       | yes                 |                                           |
| RMS        | Inventory              | INVENTORY            | Assets             | per-env UUID       | FORGE_RMS:INVENTORY                   | READY       | yes                 |                                           |
| RMS        | Documents              | DOCUMENTS            | Tools              | per-env UUID       | FORGE_RMS:DOCUMENTS                   | READY       | yes                 |                                           |
| RMS        | Reports                | REPORTS              | Analytics          | per-env UUID       | FORGE_RMS:REPORTS                     | READY       | yes                 |                                           |
| RMS        | NERIS Reporting        | NERIS                | Incidents          | per-env UUID       | FORGE_RMS:NERIS                       | READY       | yes                 |                                           |
| RMS        | AI Narrative Assistant | AI_NARRATIVE         | Tools              | per-env UUID       | FORGE_RMS:AI_NARRATIVE                | READY       | yes                 | SHARED_SERVICE variant                    |
| ACADEMY    | Academy Core           | CORE                 | Platform           | per-env UUID       | FORGE_ACADEMY:CORE                    | READY       | no                  | PLATFORM_CORE                             |
| ACADEMY    | Academy Administration | ADMINISTRATION       | Administration     | per-env UUID       | FORGE_ACADEMY:ADMINISTRATION          | READY       | yes                 |                                           |
| ACADEMY    | Students               | STUDENTS             | People             | per-env UUID       | FORGE_ACADEMY:STUDENTS                | READY       | yes                 |                                           |
| ACADEMY    | Instructors            | INSTRUCTORS          | People             | per-env UUID       | FORGE_ACADEMY:INSTRUCTORS             | READY       | yes                 |                                           |
| ACADEMY    | Courses                | COURSES              | Curriculum         | per-env UUID       | FORGE_ACADEMY:COURSES                 | READY       | yes                 |                                           |
| ACADEMY    | Classes                | CLASSES              | Curriculum         | per-env UUID       | FORGE_ACADEMY:CLASSES                 | READY       | yes                 |                                           |
| ACADEMY    | Enrollment             | ENROLLMENT           | Curriculum         | per-env UUID       | FORGE_ACADEMY:ENROLLMENT              | READY       | yes                 |                                           |
| ACADEMY    | Attendance             | ATTENDANCE           | Operations         | per-env UUID       | FORGE_ACADEMY:ATTENDANCE              | READY       | yes                 |                                           |
| ACADEMY    | Certifications         | CERTIFICATIONS       | Operations         | per-env UUID       | FORGE_ACADEMY:CERTIFICATIONS          | READY       | yes                 |                                           |
| ACADEMY    | Department Portal      | DEPARTMENT_PORTAL    | Portals            | per-env UUID       | FORGE_ACADEMY:DEPARTMENT_PORTAL       | READY       | yes                 |                                           |
| ACADEMY    | AI Narrative Assistant | AI_NARRATIVE         | Tools              | per-env UUID       | FORGE_ACADEMY:AI_NARRATIVE            | READY       | yes                 | SHARED_SERVICE variant                    |
| CREATOR    | Creator Core           | CORE                 | Platform           | per-env UUID       | FORGE_CREATOR:CORE                    | READY       | no                  | INTERNAL; not customer-selectable         |
| CREATOR    | Tenant Administration  | TENANT_ADMIN         | Internal           | per-env UUID       | FORGE_CREATOR:TENANT_ADMIN            | READY       | no                  | INTERNAL_TOOL                             |

## Reconciliation notes

- Unique constraint remains `(product_id, code)` — duplicate _names_ across platforms are intentional platform-specific variants.
- Seed upsert updates metadata without deleting existing `tenant_module_entitlements`.
- Migration `0039_module_catalog_s2.sql` adds catalog columns; seed fills full Industrial registry rows.
