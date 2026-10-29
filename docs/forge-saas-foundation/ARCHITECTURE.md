# Architecture — FORGE-SAAS-CORE

**Closeout:** MK-S24  
**Related:** [MK-S0-baseline.md](./MK-S0-baseline.md), [DEPLOYMENT.md](./DEPLOYMENT.md)

## System overview

Forge SaaS core is a multi-tenant NestJS API on ECS Fargate, Aurora PostgreSQL with FORCE RLS, Cognito authentication, SQS workers, and static Next.js exports (Creator Console, Tenant Admin) behind CloudFront + private S3.

```mermaid
flowchart TB
  subgraph clients [Clients]
    CC[Creator Console]
    TA[Tenant Admin]
    RMS[RMS / Industrial / Academy]
  end
  subgraph edge [Edge]
    CFSPA[CloudFront SPA]
    CFAPI[CloudFront API]
    WAF[WAF on ALB]
  end
  subgraph compute [Compute]
    ALB[ALB]
    API[platform-api ECS]
    WRK[worker-service ECS]
  end
  subgraph data [Data]
    AUR[(Aurora PostgreSQL + RLS)]
    S3[(S3 docs/imports/exports/audit)]
    Q[SQS queues]
    SEC[Secrets Manager / KMS]
  end
  subgraph id [Identity]
    COG[Cognito User Pool]
  end
  CC --> CFSPA
  TA --> CFSPA
  RMS --> CFSPA
  CC --> CFAPI
  TA --> CFAPI
  CFAPI --> ALB
  WAF --> ALB
  ALB --> API
  API --> AUR
  API --> S3
  API --> SEC
  API --> COG
  API --> Q
  WRK --> Q
  WRK --> AUR
  CFSPA --> S3
```

## Frontend architecture

| App             | Stack                                       | Hosting                        |
| --------------- | ------------------------------------------- | ------------------------------ |
| Creator Console | Next.js 15 static export + Sneat            | S3 + CloudFront OAC            |
| Tenant Admin    | Next.js 15 static export + Config Studio    | S3 + CloudFront OAC            |
| Product UIs     | RMS / Industrial / Academy (product tracks) | Separate hosting / shared APIs |

Shared UI kits live under `packages/web-kit`, `packages/fx-*` where applicable. Auth client uses Cognito; API calls carry tenant context; capability UI is advisory only.

## Backend architecture

| Layer         | Implementation                                                                |
| ------------- | ----------------------------------------------------------------------------- |
| HTTP API      | NestJS `apps/platform-api`                                                    |
| Auth context  | Cognito JWT + optional local `x-forge-dev-principal` (local/dev/testing only) |
| Authorization | `@forge/authorization` + `PermissionGuard`                                    |
| Persistence   | Drizzle + `packages/database`                                                 |
| Isolation     | Postgres FORCE RLS + application AuthZ                                        |
| Side effects  | Outbox + audit + SQS workers                                                  |

## Authentication diagram

```mermaid
sequenceDiagram
  participant U as User
  participant UI as SPA
  participant C as Cognito
  participant API as platform-api
  participant DB as Aurora
  U->>UI: Login
  UI->>C: Hosted UI / SRP
  C-->>UI: Tokens
  UI->>API: API + Bearer
  API->>C: Validate JWT
  API->>DB: Resolve membership + permissions + entitlements
  API-->>UI: Principal + data (RLS enforced)
```

## AWS map (SaaS platform CDK)

Stack order (`infrastructure/cdk/bin/forge-platform.ts`): Network → Security → Identity → Messaging → Data → Observability → Compute → Frontend / Backup / Audit.

| Concern      | Construct / stack            |
| ------------ | ---------------------------- |
| Cognito      | `forge-cognito` / Identity   |
| Aurora       | `forge-database` / Data      |
| Buckets      | `forge-buckets` / Data       |
| ECS/ALB/WAF  | `forge-ecs` / Compute        |
| Static sites | `forge-*-hosting` / Frontend |
| API CF       | `forge-api-cloudfront`       |
| Alarms       | `forge-monitoring`           |
| Backups      | `forge-backups`              |

## ERD (core SaaS entities)

Logical ERD — not every column. Product tables (RMS/Industrial) omitted.

```mermaid
erDiagram
  TENANTS ||--o{ ORGANIZATIONS : owns
  TENANTS ||--o{ FACILITIES : owns
  TENANTS ||--o{ USERS : scopes
  TENANTS ||--o{ USER_TENANT_MEMBERSHIPS : has
  TENANTS ||--o{ ROLES : has
  TENANTS ||--o{ TENANT_PRODUCTS : entitles
  TENANTS ||--o{ TENANT_MODULE_ENTITLEMENTS : entitles
  TENANTS ||--o{ SUBSCRIPTIONS : commercial
  TENANTS ||--o| BILLING_CUSTOMERS : billing
  USERS ||--o{ USER_TENANT_MEMBERSHIPS : joins
  USER_TENANT_MEMBERSHIPS ||--o{ MEMBERSHIP_ROLE_ASSIGNMENTS : grants
  ROLES ||--o{ MEMBERSHIP_ROLE_ASSIGNMENTS : assigned
  ROLES ||--o{ ROLE_PERMISSIONS : defines
  PERMISSIONS ||--o{ ROLE_PERMISSIONS : catalog
  USER_TENANT_MEMBERSHIPS ||--o{ MEMBERSHIP_PRODUCT_ACCESS : products
  USER_TENANT_MEMBERSHIPS ||--o{ MEMBERSHIP_MODULE_ACCESS : modules
  ORGANIZATIONS ||--o{ FACILITIES : optional
  TENANTS ||--o{ USER_INVITATIONS : invites
  TENANTS ||--o{ AUDIT_EVENTS : audits
```

## Design principles

1. One tenant root (`tenants`) — no parallel accounts schema
2. Entitlements gate product/module access; billing does not write entitlements from webhooks
3. Server AuthZ is authoritative; UI `Can` helpers are UX only
4. Migrations forward-only; production cutover separately authorized
5. REUSE existing surfaces before NEW
