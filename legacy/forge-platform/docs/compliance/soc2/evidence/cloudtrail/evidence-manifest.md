# CloudTrail evidence manifest

**Date:** 2026-07-26  
**Environment:** development  
**Control:** CC-LOG-01  
**Risk:** R-002  
**Stack:** `Forge-Development-Audit`  
**Trail:** `forge-development-cloudtrail-management`

## Deployment reference

| Field          | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| CDK app        | `infrastructure/cdk/bin/forge-platform.ts`                     |
| Construct      | `lib/constructs/forge-cloudtrail.ts`                           |
| Stack          | `lib/stacks/audit-stack.ts`                                    |
| Deploy command | `cdk deploy ForgeAudit --exclusively` (after OD-21 inspection) |
| Synth          | `cdk synth ForgeAudit` succeeded prior to deploy               |
| Feature flag   | `features.enableCloudTrail`                                    |

## Artifacts (sanitized)

| Artifact            | Path                                         | SHA-256 file                    |
| ------------------- | -------------------------------------------- | ------------------------------- |
| Trail configuration | `trail-configuration.json`                   | `trail-configuration.sha256`    |
| Trail status        | `trail-status.json`                          | `trail-status.sha256`           |
| S3 security         | `s3-security-settings.json`                  | `s3-security-settings.sha256`   |
| KMS status          | `kms-key-status.json`                        | `kms-key-status.sha256`         |
| Controlled tests    | `controlled-test-events.json`                | `controlled-test-events.sha256` |
| Events summary      | `trail-events-summary.json`                  | `trail-events-summary.sha256`   |
| CW alarms           | `../logging/cloudwatch-security-alarms.json` | sibling `.sha256`               |

## Verification checklist (engineering)

- [x] Trail exists
- [x] Trail is logging (`IsLogging: true`)
- [x] Multi-region
- [x] Global service events
- [x] Log file validation
- [x] CloudWatch Logs integration
- [x] S3 encryption (KMS)
- [x] KMS key enabled
- [x] Public access blocked
- [x] Restrictive bucket policy
- [x] Lifecycle rules
- [x] Metric filters + alarms
- [x] Controlled test events executed
- [x] Evidence ACCEPTED by Jeremy Powell (2026-07-26)

## Object Lock

Not enabled — evaluation in `risk/gap-register.md` GAP-007.
