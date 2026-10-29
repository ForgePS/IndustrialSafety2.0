# In-Scope Services and Components

**Document ID:** SOC2-SCOPE-002  
**Version:** 0.1 (draft)  
**Date:** 2026-07-26

Maps the Forge system boundary to concrete services. Preserve existing controls; do not rename infrastructure solely for SOC 2.

---

## 1. AWS account and region

| Item           | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| Account        | `511343547817` (Forge development / current operating account) |
| Primary region | `us-east-1`                                                    |
| IaC            | AWS CDK (`packages/infra`)                                     |

Production isolation into a separate AWS account may become a future scope refinement; until then, this account is the operating system of record for readiness work.

---

## 2. Compute and application runtime

| Component        | Technology                        | Control themes                                        |
| ---------------- | --------------------------------- | ----------------------------------------------------- |
| API / workers    | Amazon ECS on Fargate             | Least privilege task roles, secret injection, logging |
| Container images | ECR (as used by deploy path)      | Image provenance via CI                               |
| Task networking  | Private subnets + security groups | Network isolation                                     |

---

## 3. Data stores

| Component        | Technology          | Control themes                                      |
| ---------------- | ------------------- | --------------------------------------------------- |
| Primary database | Aurora PostgreSQL   | Encryption, FORCE RLS, `forge_app` runtime role     |
| Object storage   | Amazon S3           | Encryption, bucket policies, static site hosting    |
| Secrets          | AWS Secrets Manager | Credential separation (admin vs app), rotation path |
| Keys             | AWS KMS             | Encryption at rest for in-scope data stores         |

---

## 4. Identity and access

| Component         | Technology                      | Control themes                           |
| ----------------- | ------------------------------- | ---------------------------------------- |
| End-user auth     | Amazon Cognito                  | MFA-capable user pools, JWT validation   |
| Tenant membership | Application + DB                | Membership resolution before data access |
| App permissions   | Application authorization layer | Permission checks beyond tenancy         |
| AWS console / CLI | IAM Identity Center / IAM       | Privileged access to cloud environment   |

---

## 5. Edge and networking

| Component   | Technology                       | Control themes                                          |
| ----------- | -------------------------------- | ------------------------------------------------------- |
| CDN / HTTPS | Amazon CloudFront                | TLS termination, security headers (verified in Phase 2) |
| Origins     | S3 + API origins                 | Origin access controls                                  |
| VPC         | Private subnets, NAT as designed | Limit public attack surface                             |
| WAF         | Config-flagged / optional        | Evaluate enablement as control gap if not active        |

---

## 6. Messaging and async

| Component | Technology         | Control themes           |
| --------- | ------------------ | ------------------------ |
| Events    | Amazon EventBridge | Controlled event routing |
| Queues    | Amazon SQS         | Durable async processing |

---

## 7. Observability and audit

| Component                | Technology                      | Control themes                      | Operating status (initial)                  |
| ------------------------ | ------------------------------- | ----------------------------------- | ------------------------------------------- |
| Metrics / logs / alarms  | Amazon CloudWatch               | Availability + security monitoring  | In use                                      |
| Application audit events | Forge audit logging             | Who did what, when, tenant-scoped   | In use                                      |
| AWS API audit            | AWS CloudTrail                  | Account-level change evidence       | **Gap — construct not implemented (OD-21)** |
| Threat detection         | GuardDuty / Security Hub / etc. | Config flags exist; largely unwired | **Gap — evaluate**                          |

---

## 8. CI/CD and repository controls

| Component      | Technology                      | Control themes                               |
| -------------- | ------------------------------- | -------------------------------------------- |
| Source control | GitHub                          | Branch protection, PR review                 |
| CI workflows   | GitHub Actions                  | Builds, tests, RLS checks, gitleaks, cdk-nag |
| Deploy path    | Existing Forge deploy workflows | Change management evidence                   |

---

## 9. Application surfaces in scope

| Surface                             | Notes                                                    |
| ----------------------------------- | -------------------------------------------------------- |
| RMS Web                             | `https://d3ud5uzwd9js2z.cloudfront.net` (current distro) |
| Secure API                          | CloudFront-fronted API distribution                      |
| Creator Console                     | Administrative / creator UI path                         |
| NERIS Phase 1–2 APIs/UI as deployed | Within shared platform controls                          |

---

## 10. People and process (in-scope control activities)

- Access provisioning / deprovisioning for Cognito and AWS
- Change management via PR + CI + deploy
- Incident response and escalation
- Risk assessment and exception handling
- Vendor / subservice review (AWS)
- Security awareness training (program to be stood up)
- Backup / restore verification (Backup construct flagged — verify operation)

---

## Cross-references

- Out of scope: [`out-of-scope-services.md`](out-of-scope-services.md)
- Environments: [`environments.md`](environments.md)
- Subservices: [`subservice-organizations.md`](subservice-organizations.md)
