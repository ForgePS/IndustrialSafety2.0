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
  const keyId = trails?.trailList?.[0]?.KmsKeyId;
  if (!keyId) throw new Error("Trail KMS key not found");

  const key = awsJson(["kms", "describe-key", "--key-id", keyId], args);
  const rotation = awsJson(["kms", "get-key-rotation-status", "--key-id", keyId], args);

  const result = writeEvidenceArtifact({
    outDir: args.outDir,
    basename: "kms-key-status",
    data: {
      keyId,
      keyState: key?.KeyMetadata?.KeyState,
      enabled: key?.KeyMetadata?.Enabled,
      keyManager: key?.KeyMetadata?.KeyManager,
      origin: key?.KeyMetadata?.Origin,
      rotation,
    },
    controlId: "CC-CRY-01",
    riskId: "R-002",
    title: "CloudTrail KMS key status",
    environment: args.environment,
    account: caller.account,
    region: args.region,
    source: "aws kms describe-key / get-key-rotation-status",
  });
  assertNoSecretsInFile(result.jsonPath);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
