#!/usr/bin/env node
import {
  parseArgs,
  awsJson,
  writeEvidenceArtifact,
  discoverCaller,
  assertNoSecretsInFile,
  defaultTrailName,
} from "./_lib.mjs";

async function main() {
  const args = parseArgs();
  const caller = discoverCaller(args);
  const trailName = defaultTrailName(args.environment);
  const trails = awsJson(["cloudtrail", "describe-trails", "--trail-name-list", trailName], args);
  const bucketName = trails?.trailList?.[0]?.S3BucketName;
  if (!bucketName) throw new Error("CloudTrail bucket not found");

  const encryption = awsJson(["s3api", "get-bucket-encryption", "--bucket", bucketName], args);
  const pab = awsJson(["s3api", "get-public-access-block", "--bucket", bucketName], args);
  const versioning = awsJson(["s3api", "get-bucket-versioning", "--bucket", bucketName], args);
  const lifecycle = awsJson(
    ["s3api", "get-bucket-lifecycle-configuration", "--bucket", bucketName],
    args,
  );
  let policy = null;
  try {
    policy = awsJson(["s3api", "get-bucket-policy", "--bucket", bucketName], args);
    if (policy?.Policy) policy = { Policy: JSON.parse(policy.Policy) };
  } catch {
    policy = { error: "policy not readable" };
  }

  const result = writeEvidenceArtifact({
    outDir: args.outDir,
    basename: "s3-security-settings",
    data: { bucketName, encryption, publicAccessBlock: pab, versioning, lifecycle, policy },
    controlId: "CC-LOG-01",
    riskId: "R-002",
    title: "CloudTrail S3 bucket security settings",
    environment: args.environment,
    account: caller.account,
    region: args.region,
    source: "aws s3api get-bucket-*",
  });
  assertNoSecretsInFile(result.jsonPath);
  console.log(JSON.stringify({ ok: true, bucketName, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
