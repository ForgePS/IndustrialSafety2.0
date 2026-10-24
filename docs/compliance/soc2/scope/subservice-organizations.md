# Subservice Organizations

**Document ID:** SOC2-SCOPE-006  
**Version:** 0.1 (draft)  
**Date:** 2026-07-26

---

## 1. Purpose

Identify organizations that perform controls relevant to Forge’s TSC description (carve-out or inclusive method to be decided with the CPA firm).

---

## 2. Primary subservice: Amazon Web Services

| Field           | Value                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Organization    | Amazon Web Services, Inc.                                                                                                                                                            |
| Services used   | Cognito, ECS Fargate, Aurora PostgreSQL, S3, CloudFront, EventBridge, SQS, CloudWatch, KMS, Secrets Manager, IAM, VPC networking; (planned) CloudTrail and related security services |
| Relevance       | Physical security, hypervisor, managed service availability, encryption service integrity, identity service underpinnings                                                            |
| Report reliance | AWS SOC 1 / SOC 2 / ISO reports via AWS Artifact                                                                                                                                     |
| Monitoring      | Review AWS Artifact reports at least annually; track AWS security bulletins affecting in-scope services                                                                              |

### Complementary user entity controls (CUECs) — Forge responsibilities

Forge remains responsible for:

- Configuring IAM least privilege and reviewing privileged access
- Enabling and monitoring logging (CloudTrail gap is Forge’s gap)
- Application-layer tenancy (RLS), authorization, and audit events
- Secret handling and encryption configuration
- Patching/deploying application code
- Incident detection using CloudWatch / app signals
- Customer data classification and retention policies

---

## 3. Other potential subservices (evaluate)

| Vendor                  | Candidate use                  | Status                                                     |
| ----------------------- | ------------------------------ | ---------------------------------------------------------- |
| GitHub                  | Source control + Actions CI    | **Likely subservice** for change/SDLC — add to vendor pack |
| Domain / DNS provider   | DNS for custom domains if used | Evaluate when custom domains are customer-facing           |
| Email / SMS (if any)    | Notifications                  | Not yet inventoried — do not claim                         |
| Error tracking (if any) | Sentry-like tools              | Not yet inventoried — do not claim                         |

---

## 4. Inclusive vs carve-out method

**Decision:** Deferred to CPA engagement.

- Readiness work documents Forge controls and AWS reliance explicitly.
- Do not draft a customer-facing system description asserting a method until the auditor agrees.

---

## 5. Vendor file location

Diligence artifacts: `../vendors/`  
Evidence of AWS report reviews: `../evidence/vendors/`
