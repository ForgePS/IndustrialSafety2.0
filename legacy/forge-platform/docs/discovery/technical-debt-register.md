# Technical Debt Register

**Sprint:** 1A  
**Date:** 2026-07-25

| ID    | Area               | Debt                                                           | Impact                           | Suggested disposition                     |
| ----- | ------------------ | -------------------------------------------------------------- | -------------------------------- | ----------------------------------------- |
| TD-01 | RMS data model     | Many modules store arrays inside `lists/{listKey}` documents   | Scale, querying, migration pain  | Normalize in Aurora                       |
| TD-02 | RMS tenancy        | Legacy `hlfd-rms-*` list key prefixes                          | Confusing multi-tenant semantics | New keys + alias map                      |
| TD-03 | RMS security       | Open Storage rules                                             | Data exposure                    | Pre-signed + authz                        |
| TD-04 | RMS / firebase-app | Dual codebases, divergent rules                                | Weaker rules may overwrite       | Single deploy source                      |
| TD-05 | RMS UI             | Hard-coded dashboard KPI mock stats                            | Misleading production UI         | Live metrics only                         |
| TD-06 | RMS rules          | Email/domain hard-codes                                        | Brittle privilege                | Seeded creators                           |
| TD-07 | RMS schema         | SSN/DL/DOB on personnel objects                                | Compliance risk                  | Restricted store                          |
| TD-08 | Academy rules      | Duplicate `invoiceSettings`; Storage `isSuperAdmin` bug        | Incorrect authz                  | Fix before freeze                         |
| TD-09 | Academy UX         | Placeholder catch-all routes                                   | Incomplete product surface       | Remove or implement                       |
| TD-10 | Academy tenancy    | Hard-coded `afta` / Camden defaults                            | Blocks true multi-tenant         | Tenant settings                           |
| TD-11 | Academy students   | Sensitive fields co-located; broad reads                       | Oversharing                      | Split collections + permissions           |
| TD-12 | Academy env docs   | SMTP/Hub secrets missing from `.env.example`                   | Ops footguns                     | Document + Secrets Manager                |
| TD-13 | Integrations       | Secrets in Firestore `integrationSettings`                     | Leakage risk                     | Secrets Manager                           |
| TD-14 | Architecture       | Separate Firebase projects + Hub glue                          | Sync complexity                  | Shared platform APIs                      |
| TD-15 | Frontend           | Large monolithic `App.jsx` (RMS)                               | Maintainability                  | Modular apps in monorepo                  |
| TD-16 | Testing            | Mixed smoke JSON with account artifacts                        | Secret hygiene                   | Sanitize fixtures                         |
| TD-17 | RMS nav            | “Future / Later” placeholder modules                           | Scope ambiguity                  | Product decision                          |
| TD-18 | Identity           | Possible synthetic FEMA SID / DOB from imports                 | Bad matches                      | Validation + quarantine                   |
| TD-19 | Observability      | No unified structured logging/correlation                      | Hard ops                         | Observability package                     |
| TD-20 | IaC                | Manual Firebase resources                                      | Drift                            | CDK everything                            |
| TD-21 | Local tooling      | Docker CLI missing on some Windows hosts                       | Blocks local migrate             | Install Docker Desktop / PATH             |
| TD-22 | Workspace          | Parent `~/package-lock.json` confuses Next tracing             | Wrong root warning               | Remove stray lockfile or keep tracingRoot |
| TD-23 | IaC deploy         | Docker + AWS CLI missing on PATH blocks `cdk deploy` assets    | Cannot publish ECS images        | Install Docker Desktop + AWS CLI v2       |
| TD-24 | Aurora secrets     | DB secret rotation not enabled in 1C                           | Longer credential lifetime       | Enable tested rotation path               |
| TD-25 | App runtime env    | ECS tasks still rely on placeholder merge for Cognito/KMS URLs | Incomplete cloud config          | Wire Identity/Security outputs in 1D      |
| TD-26 | ALB TLS            | HTTP-only listener until ACM/DNS                               | Not production-secure            | Add certificate + HTTPS redirect          |

## Intentionally retained near-term

- Soft-delete/archive lifecycle helpers in RMS
- Managed dropdowns pattern
- Academy migration workflow concepts
- Integration Hub identity resolution concepts (`forgePersonId`)
