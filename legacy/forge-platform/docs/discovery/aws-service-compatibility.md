# AWS Service Compatibility

**Sprint:** 1A  
**Date:** 2026-07-25  
**Scope:** Map current Firebase capabilities to commercial AWS services required by the rebuild directive.

| Current capability            | Firebase / today                       | Target AWS (commercial)              | Notes                                      |
| ----------------------------- | -------------------------------------- | ------------------------------------ | ------------------------------------------ |
| SPA hosting                   | Firebase Hosting                       | CloudFront + S3                      | Academy + RMS + portals                    |
| DNS / TLS                     | Firebase Hosting / custom domain       | Route 53 + ACM                       | `rms.forgepublicsafety.com`, academy hosts |
| Auth                          | Firebase Auth                          | Amazon Cognito                       | MFA, SAML, OIDC later                      |
| Primary database              | Cloud Firestore                        | Aurora PostgreSQL                    | + RDS Proxy if justified                   |
| File storage                  | Firebase Storage                       | S3 (+ versioning, lifecycle)         | Pre-signed URLs                            |
| Server logic                  | Cloud Functions v2                     | ECS Fargate (APIs) + Lambda (events) | NestJS/TS services                         |
| HTTP APIs                     | Callable/HTTPS functions               | API Gateway and/or ALB               | Versioned `/api/v1`                        |
| Background jobs               | Function triggers / queues (Hub Tasks) | SQS + Step Functions + EventBridge   | Tenant job context required                |
| Email                         | Firestore `mail` + SMTP / SendGrid     | Amazon SES                           | Template service                           |
| SMS                           | Twilio (RMS)                           | SNS or Twilio via abstraction        | Keep provider interface                    |
| Push                          | UNKNOWN / limited                      | SNS / provider abstraction           |                                            |
| Secrets                       | Env / integrationSettings              | Secrets Manager + KMS                |                                            |
| Encryption keys               | Google-managed                         | KMS (general + sensitive)            | SSN key separation                         |
| Scheduling                    | Cloud Scheduler (Functions)            | EventBridge Scheduler                | Report exports, sync                       |
| Object CDN                    | Firebase / Storage URLs                | CloudFront                           |                                            |
| WAF                           | Limited                                | AWS WAF + Shield                     |                                            |
| Logging / metrics             | Cloud Logging / local                  | CloudWatch (+ traces)                | Structured JSON                            |
| Audit trail                   | Partial Firestore auditLogs            | `audit_events` + S3 audit bucket     |                                            |
| Identity federation workforce | N/A                                    | IAM Identity Center                  | AWS admin only                             |
| Maps / geocode                | Google APIs                            | Keep Google or abstract              | Partition-neutral config                   |
| Alerts CAD                    | Active911                              | Adapter pattern                      |                                            |
| Forms intake                  | Jotform webhook                        | Adapter / native forms               |                                            |
| IaC                           | firebase.json / manual                 | AWS CDK (TypeScript)                 | Sprint 1C                                  |
| CI/CD                         | Mixed / GitLab CI remnants             | GitHub Actions                       | Sprint 1B+                                 |
| Multi-tenant isolation        | Department docs + rules                | API + RLS + S3 prefixes              |                                            |
| Feature flags                 | Ad hoc settings                        | Feature flag provider env            |                                            |
| Caching                       | Client / none clear                    | ElastiCache only if justified        |                                            |

## Service introduction rule

Do not introduce a commercial AWS service unless GovCloud availability is checked or an abstraction exists (see [govcloud-readiness-register.md](./govcloud-readiness-register.md)).

## Partition-neutral configuration (preview)

Centralize: `APP_ENV`, `AWS_PARTITION`, `AWS_REGION`, `AWS_ACCOUNT_ID`, Cognito IDs, KMS ARNs, S3 buckets, SQS URLs, SES from-address, `PUBLIC_APP_URL`, `API_BASE_URL` — no hard-coded `arn:aws` in packages.
