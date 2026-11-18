# Feature Preservation Matrix

**Sprint:** 1A  
**Date:** 2026-07-25  
**Statuses:** `PRESERVE` | `PRESERVE_AND_ENHANCE` | `REBUILD` | `CONSOLIDATE` | `DEPRECATE` | `REMOVE_AFTER_APPROVAL` | `UNKNOWN`

Do not delete Firebase features until AWS replacement is implemented, tested, and accepted.

## Academy

| Feature / area                                              | Status               | Rationale                                                    |
| ----------------------------------------------------------- | -------------------- | ------------------------------------------------------------ |
| Student information (profile, FEMA SID, emergency contacts) | PRESERVE_AND_ENHANCE | Core; move SSN/medical to restricted model; field-level auth |
| Department portal (roster, bulk register, approvals)        | PRESERVE             | Required partner workflow                                    |
| Courses / classes / scheduling / registration / attendance  | PRESERVE             | Core academy operations                                      |
| Instructors / qualifications / assignments                  | PRESERVE             | Core                                                         |
| Certificates / templates / public verify                    | PRESERVE_AND_ENHANCE | Keep workflows; improve template engine / QR                 |
| Certifications / renewals / officer queue                   | PRESERVE             | Core compliance                                              |
| Skills evaluations                                          | PRESERVE             | Core practical testing                                       |
| Enterprise testing module                                   | PRESERVE_AND_ENHANCE | Large valuable surface; harden exam security                 |
| LMS integration (generic webhooks)                          | PRESERVE_AND_ENHANCE | Keep contracts; replace vendor-agnostic adapters             |
| Housing / dorms                                             | PRESERVE             | Operationally used                                           |
| Invoices / PDF / email                                      | PRESERVE_AND_ENHANCE | Keep; add payment processor abstraction later                |
| Digital Dashboard / campus signage                          | PRESERVE_AND_ENHANCE | Substantial investment; evaluate vs ForgePS/Dashboard later  |
| Creator console / platform academies / subscriptions        | REBUILD              | Must become Creator Console on shared platform               |
| Portal roles (student/dept/instructor/admin/cert/creator)   | PRESERVE_AND_ENHANCE | Map to Cognito + app RBAC                                    |
| Data migration center                                       | PRESERVE_AND_ENHANCE | Becomes Universal Import Center patterns                     |
| Integration Hub identity / FEMA SID corrections             | PRESERVE_AND_ENHANCE | Foundation for shared ForgePersonId                          |
| Catch-all “Coming in a future sprint” routes                | DEPRECATE            | Placeholders — do not migrate as features                    |
| Hard-coded AFTA / Camden defaults                           | REBUILD              | Replace with tenant configuration                            |
| Direct SMTP + Firestore `mail` queue                        | CONSOLIDATE          | Move to SES + notification service                           |
| Firebase Auth email/password only                           | REBUILD              | Cognito + MFA/SAML/OIDC                                      |

## RMS

| Feature / area                                                | Status                | Rationale                                                     |
| ------------------------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| Personnel roster + private fields                             | PRESERVE_AND_ENHANCE  | Core; isolate SSN/DL/DOB; stop storing SSN in plain list docs |
| Certifications / expiration tracking                          | PRESERVE              | Core                                                          |
| Training events / attendance / compliance                     | PRESERVE              | Core                                                          |
| Scheduling (shifts, roster, leave, OT, trades, call shifts)   | PRESERVE_AND_ENHANCE  | Complex; keep business rules                                  |
| Time sheets / pay rules                                       | PRESERVE              | Keep; payroll export abstraction                              |
| Daily log                                                     | PRESERVE              | Operational                                                   |
| Employee portal                                               | PRESERVE              | Separate experience                                           |
| Fleet (assets, checks, defects, WO, PM, fuel, warranty, etc.) | PRESERVE_AND_ENHANCE  | Large mature module set                                       |
| Hose testing                                                  | PRESERVE              | Keep (also legacy root collections)                           |
| Inspections / occupancies / FPS / offline                     | PRESERVE_AND_ENHANCE  | Core prevention                                               |
| Violations / notices / enforcement / fees                     | PRESERVE              | Core                                                          |
| Code library / IFC publications                               | PRESERVE_AND_ENHANCE  | Creator-managed publications                                  |
| Preplans (templates, versions, offline, QR)                   | PRESERVE_AND_ENHANCE  | Core; offline sync redesign                                   |
| Hydrants / flow tests / damage reports / water cos            | PRESERVE_AND_ENHANCE  | Core; Jotform may become optional adapter                     |
| NERIS fire reports / analytics                                | PRESERVE_AND_ENHANCE  | Align to NERIS model on AWS                                   |
| Documents / SOGs / EMS protocols                              | PRESERVE              | Keep library                                                  |
| Internal messages / digital dashboard                         | PRESERVE_AND_ENHANCE  | Evaluate consolidation with Academy signage                   |
| Active911 / Twilio / Google Maps integrations                 | PRESERVE_AND_ENHANCE  | Provider abstractions                                         |
| Academy connection / person link / training sync              | PRESERVE_AND_ENHANCE  | Shared platform boundary                                      |
| Creator Console / subscriptions / gateways                    | REBUILD               | Platform Creator Console                                      |
| Department-scoped multi-tenancy                               | PRESERVE_AND_ENHANCE  | Evolve to tenants + RLS                                       |
| Demo department `forge-demo`                                  | PRESERVE              | Synthetic demo path                                           |
| Hard-coded Horn Lake emails/domain in rules                   | REBUILD               | Replace with bootstrap + config                               |
| KPI mock numbers on dashboard                                 | REBUILD               | Must use live metrics                                         |
| Future nav: Incidents / EMS Reports / Compliance Export       | UNKNOWN               | Placeholders — confirm product intent                         |
| firebase-app standalone hydrant UI                            | CONSOLIDATE           | Fold into forge-rms hydrant module; do not dual-maintain      |
| Open Storage rules                                            | REMOVE_AFTER_APPROVAL | After pre-signed URL + authz replacement                      |

## Cross-cutting

| Feature                                       | Status               | Rationale                                              |
| --------------------------------------------- | -------------------- | ------------------------------------------------------ |
| Firestore as system of record                 | REBUILD              | Aurora PostgreSQL                                      |
| Client-side security rules as primary authz   | REBUILD              | API + RLS                                              |
| Document-array “list” storage (`lists/{key}`) | REBUILD              | Normalize to relational tables                         |
| Soft delete / archive object lifecycle (RMS)  | PRESERVE             | Good pattern to keep                                   |
| Dropdown manager (RMS ManagedSelect)          | PRESERVE_AND_ENHANCE | Becomes Configuration Studio dropdowns                 |
| Audit logs (partial)                          | PRESERVE_AND_ENHANCE | Universal audit_events                                 |
| GovCloud readiness                            | UNKNOWN              | Not present in Firebase apps — design in later sprints |
