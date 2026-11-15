# System Boundary — Forge Public Safety Platform

**Document ID:** SOC2-SCOPE-001  
**Version:** 0.1 (draft)  
**Date:** 2026-07-26  
**Status:** Draft — pending management approval

---

## 1. System name

**Forge Public Safety Platform** (“Forge”) — a multi-tenant SaaS platform for public-safety agencies, delivered on AWS.

---

## 2. Boundary statement

The in-scope system comprises the people, processes, and technology that:

1. Authenticate users (Amazon Cognito).
2. Authorize tenant membership and application permissions.
3. Store and process tenant operational data in Aurora PostgreSQL with FORCE RLS.
4. Serve Creator Console, RMS Web, and NERIS Phase 1–2 capabilities via CloudFront, S3, and ECS Fargate APIs.
5. Emit and retain application audit events and AWS-native telemetry used for security monitoring.
6. Protect data with KMS encryption, Secrets Manager, network isolation, and CI security gates.

Anything outside this statement is **out of scope** unless listed in an approved scope change.

---

## 3. In-scope products and modules

| Product / module         | Boundary notes                                             |
| ------------------------ | ---------------------------------------------------------- |
| Creator Console          | Tenant/user administration UI (static hosting + API)       |
| RMS Web                  | Records Management System UI and related API surfaces      |
| NERIS Phase 1            | Ingestion / schema foundation already in production path   |
| NERIS Phase 2            | Accepted incident / RMS integration surfaces               |
| Shared platform services | AuthN/Z, tenancy, audit, messaging, storage, compute, data |

**Explicitly deferred (not in this readiness sprint as delivery work):** NERIS Phase 3 and later product expansions. Future modules must inherit this control foundation when brought in-scope.

---

## 4. In-scope infrastructure (summary)

See [`in-scope-services.md`](in-scope-services.md) for the full inventory. Summary:

- AWS account used for Forge development / current operating environment (`511343547817`, `us-east-1`)
- VPC / networking, ECS Fargate, Aurora PostgreSQL, S3, CloudFront, Cognito
- EventBridge, SQS, CloudWatch, KMS, Secrets Manager
- CI/CD workflows that build, scan, and deploy Forge
- Application roles: Cognito users, tenant membership, `forge_app` DB role with RLS

---

## 5. Trust boundary diagrams (logical)

```text
                    ┌─────────────────────────────────────┐
                    │         External users              │
                    │  (agency personnel / operators)     │
                    └───────────────┬─────────────────────┘
                                    │ HTTPS
                    ┌───────────────▼─────────────────────┐
                    │  CloudFront (RMS / Console / API)   │
                    └───────────────┬─────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
     ┌────────▼────────┐   ┌────────▼────────┐   ┌───────▼────────┐
     │ S3 static sites │   │ ECS Fargate API │   │ Cognito IdP    │
     └─────────────────┘   └────────┬────────┘   └────────────────┘
                                    │
                           ┌────────▼────────┐
                           │ Aurora Postgres │
                           │ FORCE RLS       │
                           │ forge_app role  │
                           └─────────────────┘
```

---

## 6. Organizational boundary

| Role                       | Responsibility relative to system                             |
| -------------------------- | ------------------------------------------------------------- |
| Forge engineering          | Design, implement, operate in-scope controls                  |
| Forge product / leadership | Scope approval, risk acceptance, customer commitments         |
| AWS (subservice)           | Underlying IaaS/PaaS controls per AWS SOC reports             |
| Agency customers           | Endpoint security, user provisioning requests, acceptable use |

Customer on-premises systems, agency CAD integrations not hosted by Forge, and end-user devices are **outside** the Forge system boundary.

---

## 7. Period of interest (for future examination)

- **Readiness period (this sprint):** begins 2026-07-26
- **Type 1 / Type 2 examination period:** not yet defined — set only when engaging a CPA firm

---

## 8. Approval

| Approver | Role                        | Date | Signature |
| -------- | --------------------------- | ---- | --------- |
| _TBD_    | Engineering lead            |      |           |
| _TBD_    | Product / executive sponsor |      |           |
| _TBD_    | Compliance / security owner |      |           |
