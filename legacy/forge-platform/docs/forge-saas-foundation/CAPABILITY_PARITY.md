# Capability Parity Matrix — FORGE-SAAS-CORE

**Closeout:** MK-S24  
**Status vocabulary:** COMPLETE | PARTIAL | NOT APPLICABLE | DEFERRED

| Capability                    | Status         | Implementation                                | Tests                                    | Notes                                    |
| ----------------------------- | -------------- | --------------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| Tenant domain / lifecycle     | COMPLETE       | `tenants`, TenantsService, contracts statuses | Unit + e2e scenarios                     | TENANCY.md                               |
| Facilities / sites            | COMPLETE       | `facilities` API (Industrial product gate)    | Contract + e2e lifecycle                 |                                          |
| Organizations / departments   | COMPLETE       | Organizations module                          | API tests                                |                                          |
| Cognito auth / sessions       | COMPLETE       | Cognito + AuthContext                         | Security + e2e invite accept             | Dev principal local-only                 |
| Memberships                   | COMPLETE       | Memberships module                            | e2e suspend/roles                        | MEMBERSHIPS.md                           |
| RBAC / permissions            | COMPLETE       | `@forge/authorization` + guards               | Escalation unit (MK-S21)                 | Creator-only hardened                    |
| Custom role UI                | DEFERRED       | Service APIs exist                            | —                                        | BACKLOG                                  |
| Invitations                   | COMPLETE       | Invitations module                            | e2e + security                           | Email delivery GAP (SES)                 |
| Entitlements products/modules | COMPLETE       | Entitlements module                           | e2e + unit                               | Creator-only manage (MK-S21)             |
| Feature flags                 | PARTIAL        | Platform feature APIs                         | —                                        | Provider config                          |
| Onboarding sessions           | COMPLETE       | Onboarding module                             | Service tests                            | ONBOARDING.md                            |
| Billing domain                | PARTIAL        | Billing module + UI                           | Service + UX tests                       | Provider NONE/stub; live Stripe DEFERRED |
| Creator Console shell         | COMPLETE       | `apps/creator-console`                        | Build                                    | SHELL.md                                 |
| Tenant Admin shell            | COMPLETE       | `apps/tenant-admin`                           | Build                                    |                                          |
| Notifications in-app          | COMPLETE       | Notifications module                          | API                                      | NOTIFICATIONS.md                         |
| Notifications email (SES)     | DEFERRED       | Noop/stub provider                            | —                                        | MK-S23 blocker                           |
| Storage / branding            | COMPLETE       | Branding + S3 signed access                   | —                                        | STORAGE_BRANDING.md                      |
| API keys / webhooks           | PARTIAL        | Module present                                | —                                        | Residual security MEDIUM                 |
| Audit / observability         | COMPLETE       | Audit APIs + CW/alarms IaC                    | —                                        | SNS subscribers CONDITION                |
| Platform analytics            | COMPLETE       | Overview API + Creator UI                     | Unit                                     | Creator-only                             |
| Search / command palette      | COMPLETE       | Search API + UI trigger                       | —                                        | SEARCH_COMMAND_PALETTE.md                |
| Import / export / jobs        | PARTIAL        | Jobs + import control plane                   | Imports e2e (separate)                   | Deep adapters product-scoped             |
| Performance / navigation      | PARTIAL        | Hardening notes                               | —                                        | PERFORMANCE_NAVIGATION.md                |
| Security red team             | COMPLETE       | MK-S21 review + remediations                  | Escalation units                         | MEDIUM residuals remain                  |
| Lifecycle UAT harness         | PARTIAL        | `mk-s22-lifecycle.e2e.test.ts`                | Scenario unit PASS; HTTP e2e OUTSTANDING | MK-S22 condition                         |
| Production readiness          | PARTIAL        | MK-S23 doc                                    | —                                        | Verdict NOT READY                        |
| Production deploy / cutover   | DEFERRED       | Sequence documented only                      | —                                        | Requires separate auth                   |
| Firebase customer migration   | DEFERRED       | Program docs only                             | —                                        | Not in SaaS core sprint                  |
| Academy AWS product           | NOT APPLICABLE | Scaffold / Firebase live                      | —                                        | Product track                            |
| Industrial product depth      | NOT APPLICABLE | Separate IND program                          | —                                        | Shared platform only                     |

## Makerkit-class parity (qualitative)

| Makerkit-class theme         | Forge status                                |
| ---------------------------- | ------------------------------------------- |
| Multi-tenant accounts        | COMPLETE (`tenants`)                        |
| Team invitations             | COMPLETE (email send PARTIAL/DEFERRED)      |
| Roles & permissions          | COMPLETE                                    |
| Billing subscriptions        | PARTIAL (manual/enterprise + stub provider) |
| Admin personal accounts      | COMPLETE (memberships + Cognito)            |
| Super-admin / creator        | COMPLETE                                    |
| Audit trail                  | COMPLETE                                    |
| Feature flags / entitlements | COMPLETE / PARTIAL                          |
