# FORGE-SAAS-CORE — Foundation Index

**Program:** FORGE-SAAS-CORE  
**Closeout sprint:** MK-S24  
**Production authorized:** NO  
**Production readiness:** NOT READY ([MK-S23](./MK-S23-production-readiness.md))  
**MK-S22 E2E condition:** OUTSTANDING ([MK-S22-UAT](./MK-S22-UAT.md))

Clean-room Makerkit-class SaaS foundation on the existing Forge AWS monorepo. Prefer **REUSE → EXTEND → HARDEN → REFACTOR → NEW**. No parallel `*_v2` domains.

## Canonical documents (MK-S24 set)

| Doc                                            | Purpose                               |
| ---------------------------------------------- | ------------------------------------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md)           | System shape, apps, packages, AWS     |
| [AUTHORIZATION.md](./AUTHORIZATION.md)         | Permissions, guards, isolation        |
| [TENANCY.md](./TENANCY.md)                     | Tenant / facility / org model         |
| [BILLING.md](./BILLING.md)                     | Commercial billing (entitlements SoT) |
| [OPERATIONS.md](./OPERATIONS.md)               | Runbooks, health, alarms, support     |
| [DEPLOYMENT.md](./DEPLOYMENT.md)               | Deploy sequence, rollback pointers    |
| [CAPABILITY_PARITY.md](./CAPABILITY_PARITY.md) | Final capability matrix               |

## Domain docs by sprint

| Area                   | Doc                                                                |
| ---------------------- | ------------------------------------------------------------------ |
| Baseline               | [MK-S0-baseline.md](./MK-S0-baseline.md)                           |
| Auth / sessions        | [AUTH_SESSIONS.md](./AUTH_SESSIONS.md)                             |
| Memberships            | [MEMBERSHIPS.md](./MEMBERSHIPS.md)                                 |
| RBAC                   | [RBAC.md](./RBAC.md)                                               |
| Entitlements           | [ENTITLEMENTS.md](./ENTITLEMENTS.md)                               |
| Invitations            | [INVITATIONS.md](./INVITATIONS.md)                                 |
| Onboarding             | [ONBOARDING.md](./ONBOARDING.md)                                   |
| Shell / UX             | [SHELL.md](./SHELL.md)                                             |
| Notifications          | [NOTIFICATIONS.md](./NOTIFICATIONS.md)                             |
| Storage / branding     | [STORAGE_BRANDING.md](./STORAGE_BRANDING.md)                       |
| API keys / webhooks    | [API_KEYS_WEBHOOKS.md](./API_KEYS_WEBHOOKS.md)                     |
| Audit / observability  | [AUDIT_OBSERVABILITY.md](./AUDIT_OBSERVABILITY.md)                 |
| Performance / nav      | [PERFORMANCE_NAVIGATION.md](./PERFORMANCE_NAVIGATION.md)           |
| Search                 | [SEARCH_COMMAND_PALETTE.md](./SEARCH_COMMAND_PALETTE.md)           |
| Import / export / jobs | [IMPORT_EXPORT_JOBS.md](./IMPORT_EXPORT_JOBS.md)                   |
| Platform analytics     | [PLATFORM_ANALYTICS.md](./PLATFORM_ANALYTICS.md)                   |
| Security review        | [MK-S21-security-review.md](./MK-S21-security-review.md)           |
| UAT                    | [MK-S22-UAT.md](./MK-S22-UAT.md)                                   |
| Production readiness   | [MK-S23-production-readiness.md](./MK-S23-production-readiness.md) |
| Backlog                | [BACKLOG.md](./BACKLOG.md)                                         |

## Program control

| File                                       | Role                       |
| ------------------------------------------ | -------------------------- |
| [ACTIVE_SPRINT.md](./ACTIVE_SPRINT.md)     | Authorized sprint lock     |
| [PROGRAM_STATE.json](./PROGRAM_STATE.json) | Machine-readable state     |
| [sprints/](./sprints/)                     | Per-sprint PLAN / COMPLETE |

## Primary implementation locations

| Layer           | Path                     |
| --------------- | ------------------------ |
| API             | `apps/platform-api`      |
| Worker          | `apps/worker-service`    |
| Creator Console | `apps/creator-console`   |
| Tenant Admin    | `apps/tenant-admin`      |
| Contracts       | `packages/contracts`     |
| AuthZ           | `packages/authorization` |
| Database / RLS  | `packages/database`      |
| Environment     | `packages/environment`   |
| Infrastructure  | `infrastructure/cdk`     |

## Outstanding program conditions (not cleared by MK-S24)

1. MK-S22 full HTTP e2e against isolated test DB
2. MK-S23 production readiness = NOT READY (SES, prod config, APP_ENV, deploy guard, etc.)
3. Firebase → AWS customer-data cutover requires separate authorization

## Capability parity (summary)

See [CAPABILITY_PARITY.md](./CAPABILITY_PARITY.md) for the full matrix. Status vocabulary: **COMPLETE | PARTIAL | NOT APPLICABLE | DEFERRED**.
