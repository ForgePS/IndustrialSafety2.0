#!/usr/bin/env node
/**
 * Export ECS task definition DATABASE_SECRET_ARN evidence (no secret values).
 * Confirms runtime points at app DB secret naming forge-{env}-secrets-database-app.
 */
import {
  parseArgs,
  awsJson,
  writeEvidenceArtifact,
  discoverCaller,
  assertNoSecretsInFile,
  REPO_ROOT,
} from "./_lib.mjs";
import { join } from "node:path";

function stackEnvLabel(environment) {
  return environment
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

async function main() {
  const args = parseArgs();
  const caller = discoverCaller(args);
  const outDir = join(REPO_ROOT, "docs", "compliance", "soc2", "evidence", "testing");
  const stackName = `Forge-${stackEnvLabel(args.environment)}-Compute`;

  const stacks = awsJson(["cloudformation", "describe-stacks", "--stack-name", stackName], args);
  const outputs = stacks?.Stacks?.[0]?.Outputs || [];
  const cluster =
    outputs.find((o) => String(o.OutputKey || "").includes("ClusterName"))?.OutputValue || null;
  if (!cluster) throw new Error(`ClusterName output not found on ${stackName}`);

  const service = `forge-${args.environment}-ecs-platform-api`;
  const desc = awsJson(
    ["ecs", "describe-services", "--cluster", cluster, "--services", service],
    args,
  );
  const taskDefArn = desc?.services?.[0]?.taskDefinition;
  if (!taskDefArn) throw new Error("platform-api task definition not found");

  const td = awsJson(["ecs", "describe-task-definition", "--task-definition", taskDefArn], args);
  const container = td?.taskDefinition?.containerDefinitions?.find(
    (c) => c.name === "platform-api",
  );
  const secretEnv = (container?.secrets || []).find(
    (s) => s.name === "DATABASE_SECRET_ARN" || s.name === "DATABASE_URL",
  );
  // DATABASE_SECRET_ARN is typically plain env, not secrets block — check both.
  const envVar = (container?.environment || []).find((e) => e.name === "DATABASE_SECRET_ARN");
  const secretArn = envVar?.value || secretEnv?.valueFrom || null;

  const expectedSuffix = `forge-${args.environment}-secrets-database-app`;
  const usesAppSecret = Boolean(secretArn && secretArn.includes(expectedSuffix));
  const usesAdminSecret = Boolean(
    secretArn && secretArn.includes(`forge-${args.environment}-secrets-database`) && !usesAppSecret,
  );

  if (!usesAppSecret) {
    throw new Error(
      `Runtime DATABASE_SECRET_ARN does not reference app secret (${expectedSuffix}). Found: ${secretArn}`,
    );
  }

  const result = writeEvidenceArtifact({
    outDir,
    basename: "database-runtime-role",
    data: {
      cluster,
      service,
      taskDefinition: taskDefArn,
      databaseSecretArn: secretArn,
      expectedAppSecretNameContains: expectedSuffix,
      usesAppSecret,
      usesAdminSecret,
      note: "Password/connection string not exported. forge_app role expected via app secret username.",
    },
    controlId: "CC-ISO-02",
    riskId: "R-012",
    title: "Database runtime role / secret evidence",
    environment: args.environment,
    account: caller.account,
    region: args.region,
    source: "aws ecs describe-task-definition",
  });
  assertNoSecretsInFile(result.jsonPath);
  console.log(JSON.stringify({ ok: true, usesAppSecret, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
