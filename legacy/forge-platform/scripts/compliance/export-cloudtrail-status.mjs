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
  const status = awsJson(["cloudtrail", "get-trail-status", "--name", trailName], args);
  if (!status?.IsLogging) {
    throw new Error(`Trail ${trailName} is not logging`);
  }

  const result = writeEvidenceArtifact({
    outDir: args.outDir,
    basename: "trail-status",
    data: status,
    controlId: "CC-LOG-01",
    riskId: "R-002",
    title: "CloudTrail trail status",
    environment: args.environment,
    account: caller.account,
    region: args.region,
    source: "aws cloudtrail get-trail-status",
  });
  assertNoSecretsInFile(result.jsonPath);
  console.log(JSON.stringify({ ok: true, IsLogging: status.IsLogging, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
