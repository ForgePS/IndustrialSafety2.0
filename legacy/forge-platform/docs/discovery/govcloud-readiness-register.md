# GovCloud Readiness Register

**Sprint:** 1A (updated 1C)  
**Date:** 2026-07-25  
**Status:** Partition helpers + GovCloud config templates exist; **no GovCloud deploy** in Sprint 1C

Commercial AWS and GovCloud must remain separate. Same source code; separate pipeline, accounts, secrets, data.

| Service                                      | Commercial | GovCloud              | Feature differences / notes                  | Abstraction required        | Approved |
| -------------------------------------------- | ---------- | --------------------- | -------------------------------------------- | --------------------------- | -------- |
| IAM / Organizations                          | Yes        | Yes                   | Account topology differs                     | Env/account config          | Pending  |
| VPC / ALB / ECS Fargate                      | Yes        | Yes                   | Verify region SKUs                           | CDK constructs              | Pending  |
| ECR                                          | Yes        | Yes                   | Separate registries                          | Partition DNS helper        | Pending  |
| Aurora PostgreSQL                            | Yes        | Yes                   | Snapshot copy commercial→Gov **not** assumed | Export/import bundles       | Pending  |
| RDS Proxy                                    | Yes        | Verify                | Confirm in target Gov region                 | Optional feature flag       | Pending  |
| S3                                           | Yes        | Yes                   | Same patterns                                | Partition-neutral endpoints | Pending  |
| CloudFront                                   | Yes        | Limited/differ        | May need alternate edge strategy             | Delivery abstraction        | Pending  |
| Route 53                                     | Yes        | Yes                   | Separate zones                               | Config                      | Pending  |
| ACM                                          | Yes        | Yes                   | Separate certs                               | Config                      | Pending  |
| Cognito                                      | Yes        | Verify feature parity | SAML/OIDC/MFA differences possible           | Auth package                | Pending  |
| API Gateway                                  | Yes        | Yes                   |                                              |                             | Pending  |
| Lambda                                       | Yes        | Yes                   |                                              |                             | Pending  |
| SQS / SNS / EventBridge / Step Functions     | Yes        | Yes                   | Confirm Scheduler parity                     |                             | Pending  |
| SES                                          | Yes        | Verify                | Sandbox/region limits                        | Email provider interface    | Pending  |
| KMS / Secrets Manager                        | Yes        | Yes                   | Separate keys; no cross-partition use        |                             | Pending  |
| CloudWatch / CloudTrail / Config             | Yes        | Yes                   | Separate log archive account                 |                             | Pending  |
| WAF / Shield                                 | Yes        | Verify                |                                              |                             | Pending  |
| GuardDuty / Security Hub / Inspector / Macie | Yes        | Verify each           |                                              |                             | Pending  |
| AWS Backup                                   | Yes        | Verify                | Cross-account within partition only          |                             | Pending  |
| Google Maps / Active911 / Twilio / Jotform   | External   | External              | May be restricted in Gov workloads           | Provider adapters + policy  | Pending  |
| Firebase (current)                           | N/A        | N/A                   | Not used in target                           | Migrate off                 | N/A      |

## Partition utility requirement

Implemented in `infrastructure/cdk/lib/utils/partition.ts` as `AwsPartitionConfiguration` (`aws` | `aws-us-gov`) with `dnsSuffix`, `arnPrefix`. Compliance tests assert commercial vs GovCloud ARN prefixes. No GovCloud stacks are synthesized for deploy in 1C.

## Data transfer

GovCloud must not depend on commercial runtime. Future transfer uses encrypted migration bundles (manifest, schema version, counts, hashes, batch IDs) — design in later phases.

## Open GovCloud questions

- Target Gov regions
- Whether CloudFront is acceptable or alternate delivery required
- Cognito feature parity for required IdPs
- Which third-party SaaS are banned in Gov deployments
