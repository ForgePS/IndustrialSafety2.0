#!/usr/bin/env node
import {
  parseArgs,
  awsJson,
  writeEvidenceArtifact,
  discoverCaller,
  defaultTrailName,
  assertNoSecretsInFile,
} from "./_lib.mjs";

async function main() {
  const args = parseArgs();
  const caller = discoverCaller(args);
  const trailName = defaultTrailName(args.environment);
  const trails = awsJson(["cloudtrail", "describe-trails", "--trail-name-list", trailName], args);
  const trail = trails?.trailList?.[0];
  if (!trail) throw new Error(`Trail not found: ${trailName}`);

  const result = writeEvidenceArtifact({
    outDir: args.outDir,
    basename: "trail-configuration",
    data: trail,
    controlId: "CC-LOG-01",
    riskId: "R-002",
    title: "CloudTrail trail configuration",
    environment: args.environment,
    account: caller.account,
    region: args.region,
    source: "aws cloudtrail describe-trails",
  });
  assertNoSecretsInFile(result.jsonPath);
  console.log(JSON.stringify({ ok: true, ...result, trailName }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
