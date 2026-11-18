#!/usr/bin/env node
/**
 * Controlled CloudTrail verification events (safe, reversed).
 * Generates: read-only API call, AccessDenied call, IAM simulate, optional SG describe.
 */
import { spawnSync } from "node:child_process";
import {
  parseArgs,
  awsJson,
  writeEvidenceArtifact,
  discoverCaller,
  assertNoSecretsInFile,
  defaultTrailName,
} from "./_lib.mjs";

function runAws(argsList, opts) {
  const result = spawnSync(
    "aws",
    [...argsList, "--profile", opts.profile, "--region", opts.region, "--output", "json"],
    { encoding: "utf8", shell: true },
  );
  return {
    status: result.status,
    stdout: result.stdout?.trim() || "",
    stderr: result.stderr?.trim() || "",
  };
}

async function main() {
  const args = parseArgs();
  const caller = discoverCaller(args);
  const trailName = defaultTrailName(args.environment);
  const started = new Date().toISOString();

  const readOnly = runAws(["sts", "get-caller-identity"], args);
  const accessDenied = runAws(
    [
      "s3api",
      "get-object",
      "--bucket",
      "forge-nonexistent-bucket-access-denied-test",
      "--key",
      "x",
    ],
    args,
  );
  const iamSim = runAws(
    [
      "iam",
      "simulate-principal-policy",
      "--policy-source-arn",
      caller.arn.replace(/:assumed-role\/([^/]+)\/.*/, ":role/$1").includes(":role/")
        ? caller.arn.replace(
            /^arn:([^:]+):sts::(\d+):assumed-role\/([^/]+)\/.*$/,
            "arn:$1:iam::$2:role/$3",
          )
        : caller.arn,
      "--action-names",
      "s3:ListBucket",
      "--resource-arns",
      "*",
    ],
    args,
  );
  const sgDescribe = runAws(["ec2", "describe-security-groups", "--max-items", "1"], args);

  // Wait briefly for CloudTrail delivery (lookup can lag).
  await new Promise((r) => setTimeout(r, 15000));
  let lookup = { Events: [] };
  try {
    lookup = awsJson(
      [
        "cloudtrail",
        "lookup-events",
        "--max-results",
        "20",
        "--lookup-attributes",
        "AttributeKey=Username,AttributeValue=forge-admin",
      ],
      args,
    );
  } catch {
    lookup = { Events: [], note: "lookup failed or empty" };
  }

  const result = writeEvidenceArtifact({
    outDir: args.outDir,
    basename: "controlled-test-events",
    data: {
      trailName,
      started,
      ended: new Date().toISOString(),
      tests: {
        readOnlyCallerIdentity: { status: readOnly.status, ok: readOnly.status === 0 },
        accessDeniedGetObject: {
          status: accessDenied.status,
          expectedFailure: true,
          ok: accessDenied.status !== 0,
        },
        iamSimulatePrincipalPolicy: { status: iamSim.status, ok: iamSim.status === 0 },
        describeSecurityGroups: { status: sgDescribe.status, ok: sgDescribe.status === 0 },
      },
      recentLookupEventNames: (lookup.Events || []).map((e) => e.EventName),
      note: "No lasting privilege granted; temporary SG changes were not applied (describe-only).",
    },
    controlId: "CC-LOG-01",
    riskId: "R-002",
    title: "CloudTrail controlled test event summary",
    environment: args.environment,
    account: caller.account,
    region: args.region,
    source: "scripts/compliance/verify-cloudtrail-controlled-events.mjs",
  });
  assertNoSecretsInFile(result.jsonPath);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
