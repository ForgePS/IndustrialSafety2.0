# Data Flows

**Document ID:** SOC2-SCOPE-005  
**Version:** 0.1 (draft)  
**Date:** 2026-07-26

High-level data flows within the Forge system boundary. Used for Confidentiality, Security, and (if included) Privacy criteria mapping.

---

## 1. Data categories (logical)

| Category                   | Examples                                                    | Sensitivity                              |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| Identity                   | Cognito username/email, subject (`sub`), MFA factors        | Confidential                             |
| Tenancy                    | Tenant IDs, memberships, roles                              | Confidential                             |
| Operational RMS / incident | Incident records, narratives, unit/status fields            | Confidential — public-safety operational |
| NERIS-related              | Schema / payload fields processed by Phase 1–2              | Confidential                             |
| Audit                      | Application audit events (actor, action, tenant, timestamp) | Confidential / integrity-critical        |
| Secrets                    | DB credentials, API keys in Secrets Manager                 | Restricted                               |
| Telemetry                  | CloudWatch logs/metrics (may contain identifiers)           | Confidential — minimize PII in logs      |

---

## 2. Primary interactive flow (authenticated user)

```text
User browser
  → CloudFront (TLS)
    → Cognito (authenticate / refresh tokens)
    → Static app (S3 via CloudFront)
    → API (ECS Fargate via CloudFront)
         → Validate JWT
         → Resolve tenant membership + permissions
         → Set DB session context for RLS
         → Query/mutate Aurora as forge_app (FORCE RLS)
         → Emit application audit event
         → Optional: EventBridge / SQS for async work
```

**Control anchors:** Cognito auth, app authorization, FORCE RLS + `forge_app`, TLS at edge, KMS/Secrets for credentials, audit logging.

---

## 3. Administrative / creator flow

```text
Operator (Creator Console)
  → CloudFront / Cognito
  → Admin APIs (ECS)
       → Privileged application permissions
       → Tenant/user administration
       → Audit events
```

Privileged paths require stricter access reviews and logging (see access-review and control matrix).

---

## 4. Async / messaging flow

```text
API or scheduled producer
  → EventBridge and/or SQS
  → Consumer on ECS (or future workers)
       → Same tenancy/RLS rules for data access
       → CloudWatch logs
```

---

## 5. CI/CD and secrets flow

```text
Developer → GitHub PR
  → CI (tests, RLS checks, gitleaks, cdk-nag)
  → Deploy credentials (OIDC / IAM as configured)
  → ECS task definition / CDK deploy
  → Runtime secrets from Secrets Manager (app secret, not admin BYPASSRLS role)
```

**Critical control:** Runtime must use `forge_app` / app database secret — not admin BYPASSRLS credentials (Phase 2 finding closed).

---

## 6. Backup and restore flow (to verify)

```text
Aurora / S3
  → Backup mechanism (AWS Backup or native snapshots — verify operating)
  → Restore test (periodic)
  → Evidence in evidence/backups/
```

Mark availability controls as **partial** until restore testing is evidenced.

---

## 7. Data egress

| Egress path           | Destination  | Notes                            |
| --------------------- | ------------ | -------------------------------- |
| Browser responses     | End user     | TLS; authorization required      |
| Logs                  | CloudWatch   | Retention and access controls    |
| AWS support / tooling | AWS          | Covered by AWS agreements / SOC  |
| Third-party analytics | None claimed | Do not add without vendor review |

---

## 8. Open data-flow items

| ID    | Item                                          | Owner action        |
| ----- | --------------------------------------------- | ------------------- |
| DF-01 | Inventory exact log fields for PII            | Observability owner |
| DF-02 | Confirm backup path is live                   | Infra owner         |
| DF-03 | Document any email/SMS notification providers | Product + security  |
