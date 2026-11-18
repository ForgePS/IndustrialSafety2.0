# cdk-nag findings (development)

`pnpm --filter @forge/infrastructure-cdk nag` runs AwsSolutionsChecks.

Documented suppressions (development-justified):

| ID                | Reason                                          |
| ----------------- | ----------------------------------------------- |
| AwsSolutions-COG2 | MFA optional in development                     |
| AwsSolutions-COG3 | Advanced Security Mode deferred (cost/GovCloud) |
| AwsSolutions-EC23 | ALB public 80/443 by design; WAF when enabled   |
| AwsSolutions-ELB2 | Access logging enabled                          |
| AwsSolutions-VPC7 | Flow logs controlled by config flag             |

Additional findings discovered during nag runs should be added here with rationale — do not silent-suppress production risks.

## Non-suppressed warnings

### CloudFormation-Validate W9008 — "RDS instance should have StorageEncrypted set to true"

Reported against `ForgeData/Database/AuroraCluster/writer/Resource`
(`AWS::RDS::DBInstance`) on every synth. This is a false positive for Aurora.
Encryption at rest is configured on the cluster, not the instance: the
synthesized `AWS::RDS::DBCluster` carries `StorageEncrypted: true` with
`KmsKeyId` pointing at the Forge storage key, and Aurora instances inherit
cluster storage encryption. `test/data-stack.test.ts` asserts the cluster
property so a regression would fail the build. Left unacknowledged rather than
suppressed so the warning stays visible if the cluster property is ever removed.

### VPC flow log bucket uses SSE-S3 rather than a customer-managed key

`ForgeNetwork` delivers flow logs to S3 (a cost control — see
`docs/operations/cost-controls.md`) using `BucketEncryption.S3_MANAGED`. Using
the Forge logs CMK would require granting `delivery.logs.amazonaws.com` access
to a key shared with other log destinations, widening that key's policy. The
bucket still blocks all public access, enforces TLS in transit, and expires
objects per `retention.securityLogsDays`. Revisit if flow logs are ever
classified above internal-use.
