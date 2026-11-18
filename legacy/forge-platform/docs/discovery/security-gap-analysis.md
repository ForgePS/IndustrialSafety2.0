# Security Gap Analysis

**Sprint:** 1A  
**Date:** 2026-07-25  
**Classification lens:** PUBLIC / INTERNAL / CONFIDENTIAL / RESTRICTED

## 1. Sensitive fields inventory

### Academy

| Field / data                                    | Location                  | Classification          | Current controls                                                                        |
| ----------------------------------------------- | ------------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| FEMA SID                                        | `students`, profiles, Hub | RESTRICTED              | Required in student model; visible to authorized roles; not field-redacted in Firestore |
| DOB                                             | students                  | RESTRICTED              | Same document as general profile                                                        |
| Emergency contacts                              | students                  | CONFIDENTIAL/RESTRICTED | Same document                                                                           |
| `specialConsiderations` (medical/accessibility) | students / forms          | RESTRICTED              | Co-located; instructors may have broad student reads                                    |
| Test answers / results / accommodations         | testing collections       | RESTRICTED              | Role-gated in app; review rules depth                                                   |
| Housing assignments                             | housing*                  | CONFIDENTIAL            | Role portals                                                                            |
| Invoice/payment records                         | invoices                  | CONFIDENTIAL            | No card PANs observed                                                                   |
| Migration uploads (may contain SSN columns)     | Storage `migration/…`     | RESTRICTED              | Parser detects SSN/password headers                                                     |

**SSN:** Not a first-class student column; migration tooling detects SSN-like headers. Treat as RESTRICTED if present in imports.

### RMS

| Field / data                                      | Location                                | Classification        | Current controls                                                                |
| ------------------------------------------------- | --------------------------------------- | --------------------- | ------------------------------------------------------------------------------- |
| `socialSecurityNumber`                            | personnel schema / list docs            | RESTRICTED            | Permission `canViewPersonnelPrivateInfo`; **stored in ordinary personnel data** |
| `birthDate`                                       | personnel                               | RESTRICTED            | Same                                                                            |
| `driversLicenseNumber` (+ state/class/exp)        | personnel                               | RESTRICTED            | Same                                                                            |
| Emergency contacts / home address / phone / email | personnel                               | CONFIDENTIAL          | Same document                                                                   |
| `femaId` / `forgePersonId`                        | personnel                               | RESTRICTED / INTERNAL | Identity                                                                        |
| Immunizations / consultations                     | personnel arrays                        | RESTRICTED            | Same document                                                                   |
| Pay rates / accruals / payrollId                  | personnel                               | CONFIDENTIAL          | Permission-sensitive                                                            |
| Hydrant damage tokens                             | `hydrantDamageAckTokens`                | CONFIDENTIAL          | Admin SDK only in rules                                                         |
| Integration secrets                               | `integrationSettings`, functions config | RESTRICTED            | Auth required on settings doc; validate secret storage                          |
| Active911 / Twilio / Google / Jotform credentials | functions / settings                    | RESTRICTED            | Must move to Secrets Manager                                                    |

## 2. Critical security gaps

| ID    | Gap                                                                                                                                                | Severity        | Evidence                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------- |
| SG-01 | RMS Storage rules allow world read/write                                                                                                           | Critical        | `forge-rms/storage.rules`, `firebase-app/storage.rules` |
| SG-02 | firebase-app (and shared project legacy) allows unauthenticated write to hydrants, inspections, flow tests, dailyActivity, hoseTests, preFirePlans | Critical        | `firebase-app/firestore.rules`                          |
| SG-03 | RMS SSN stored in plain personnel fields / list documents                                                                                          | Critical        | `personnelSchema.js` `socialSecurityNumber`             |
| SG-04 | Hard-coded platform owner emails in Firestore rules                                                                                                | High            | `forge-rms/firestore.rules` bootstrap list              |
| SG-05 | Horn Lake email domain grants department access without membership doc                                                                             | High            | `isHornLakeOrgEmail` + `horn-lake-fd`                   |
| SG-06 | Public read on `platformDepartments`, `rmsGateways`, portions of `appData`/`rmsData`/`preFirePlans`                                                | Medium–High     | rules                                                   |
| SG-07 | Academy instructors may read full student documents (medical + FEMA SID)                                                                           | High            | rules + student profile fields                          |
| SG-08 | Academy Storage migration delete references undefined `isSuperAdmin()`                                                                             | Medium          | `storage.rules` defect                                  |
| SG-09 | Unauthenticated Academy digital display / pairing / proof callables                                                                                | Medium          | intentional but need rate-limit/abuse review            |
| SG-10 | Public RMS hydrant ack + Jotform webhook + training webhooks                                                                                       | Medium          | invoker public; secret verification varies              |
| SG-11 | Client-trusted tenant/department resolution patterns risk                                                                                          | High            | Frontend must never be sole authority on AWS            |
| SG-12 | Dashboard KPIs use hard-coded demo statistics                                                                                                      | Low (integrity) | `App.jsx` `kpis` array                                  |
| SG-13 | Sensitive data may appear in logs if not scrubbed                                                                                                  | Medium          | Need log redaction standard                             |
| SG-14 | Dual RMS codebases may redeploy weaker rules                                                                                                       | High            | firebase-app vs forge-rms                               |

## 3. AuthN / AuthZ gaps vs target platform

| Target control                            | Current state                            |
| ----------------------------------------- | ---------------------------------------- |
| Cognito MFA / SAML / OIDC                 | Not present                              |
| Application RBAC with resource conditions | Partial (RMS permissions; Academy roles) |
| Step-up auth for SSN reveal               | Not present                              |
| Reason + audit for restricted reveal      | Not present                              |
| PostgreSQL RLS                            | N/A (Firestore rules only)               |
| Pre-signed S3 with tenant checks          | Not present                              |
| Tenant job context on queues              | Partial (Hub/events); not standardized   |

## 4. Hard-coded security-relevant configuration

- Creator emails and Horn Lake domain in RMS rules
- Demo department `forge-demo`
- Department ID `horn-lake-fd`
- Academy defaults `afta` / `afta-pilot`, support email `training@uafs.edu`
- Firebase project IDs and hosting URLs in source
- Functions service account references (Academy)

## 5. Recommended remediation order (post–1A)

1. Lock Storage and legacy public-write Firestore paths (or freeze firebase-app deploys).
2. Stop writing new SSNs in cleartext; plan field extraction migration.
3. Remove email/domain hard-codes from rules in favor of seeded creator docs.
4. Narrow student/personnel document reads; split restricted collections.
5. Inventory and rotate integration secrets into Secrets Manager on AWS cutover.

## 6. Unknowns

- Whether production still has firebase-app rules deployed over forge-rms rules.
- Presence of real SSNs in production personnel lists (assume yes until proven otherwise).
- Penetration test history — UNKNOWN.
