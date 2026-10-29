# Asset Register

**Document ID:** SOC2-RISK-002  
**Version:** 0.1 (draft)  
**Date:** 2026-07-26

| Asset ID | Asset                            | Type              | Owner (interim) | Classification          | Notes                          |
| -------- | -------------------------------- | ----------------- | --------------- | ----------------------- | ------------------------------ |
| A-001    | Aurora PostgreSQL (Forge DB)     | Data store        | Eng / Infra     | Confidential            | FORCE RLS; `forge_app` runtime |
| A-002    | S3 static assets (RMS / Console) | Storage           | Eng / Infra     | Internal / Confidential | Served via CloudFront          |
| A-003    | S3 application / data buckets    | Storage           | Eng / Infra     | Confidential            | Per CDK inventory              |
| A-004    | ECS Fargate API services         | Compute           | Eng             | Confidential processing | Task roles + secrets           |
| A-005    | Cognito user pools               | Identity          | Eng             | Confidential            | AuthN source of truth          |
| A-006    | CloudFront distributions         | Edge              | Eng / Infra     | Availability-critical   | RMS + API                      |
| A-007    | KMS keys                         | Crypto            | Eng / Infra     | Restricted              | Encryption at rest             |
| A-008    | Secrets Manager secrets          | Secrets           | Eng / Infra     | Restricted              | DB app vs admin separation     |
| A-009    | EventBridge / SQS                | Messaging         | Eng             | Confidential            | Async paths                    |
| A-010    | CloudWatch logs & metrics        | Telemetry         | Eng / Ops       | Confidential            | May contain identifiers        |
| A-011    | GitHub repository                | Source            | Eng             | Confidential IP         | CI/CD evidence source          |
| A-012    | GitHub Actions workflows         | CI/CD             | Eng             | Integrity-critical      | Gitleaks, RLS, cdk-nag         |
| A-013    | Application audit event store    | Audit             | Eng             | Integrity-critical      | Security monitoring            |
| A-014    | IAM / SSO admin access           | Privileged access | Eng lead        | Restricted              | AWS account control plane      |
| A-015    | CDK infrastructure definitions   | IaC               | Eng / Infra     | Integrity-critical      | `packages/infra`               |
| A-016    | NERIS Phase 1–2 processing paths | Application       | Product / Eng   | Confidential            | In scope; Phase 3 not          |
| A-017    | Creator Console                  | Application       | Product / Eng   | Confidential            | Admin capabilities             |
| A-018    | RMS Web                          | Application       | Product / Eng   | Confidential            | Customer-facing ops            |

**Update rule:** New modules (including future NERIS phases) get an asset row before production exposure.
