#!/usr/bin/env node
/**
 * Hot scale production platform-api + Aurora for latency:
 * - Fargate API: 256/1024 → 1024/2048 (4x CPU)
 * - Aurora Serverless v2 min ACU: 2 → 4
 *
 * Usage: node scripts/hotfix-prod-scale-api-aurora.mjs
 *        node scripts/hotfix-prod-scale-api-aurora.mjs --skip-aurora
 *        node scripts/hotfix-prod-scale-api-aurora.mjs --skip-api
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";

const ACCOUNT = "511343547817";
const REGION = "us-east-1";
const CLUSTER = "forge-production-ecs-platform";
const SERVICE = "forge-production-ecs-platform-api";
const AURORA_CLUSTER = "forge-production-rds-aurora";
const NEW_CPU = "1024";
const NEW_MEMORY = "2048";
const NEW_MIN_ACU = 4;
const NEW_MAX_ACU = 32;
const skipAurora = process.argv.includes("--skip-aurora");
const skipApi = process.argv.includes("--skip-api");

function awsJson(args) {
  return JSON.parse(
    execFileSync("aws", [...args, "--region", REGION, "--output", "json"], {
      encoding: "utf8",
    }),
  );
}

function awsText(args) {
  return execFileSync("aws", [...args, "--region", REGION, "--output", "text"], {
    encoding: "utf8",
  }).trim();
}

const identity = awsJson(["sts", "get-caller-identity"]);
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing: account ${identity.Account} != ${ACCOUNT}`);
}

const results = {};

if (!skipApi) {
  const svc = awsJson(["ecs", "describe-services", "--cluster", CLUSTER, "--services", SERVICE])
    .services?.[0];
  if (!svc?.taskDefinition) throw new Error("API service / task definition missing");

  const td = awsJson([
    "ecs",
    "describe-task-definition",
    "--task-definition",
    svc.taskDefinition,
  ]).taskDefinition;

  const keep = [
    "family",
    "taskRoleArn",
    "executionRoleArn",
    "networkMode",
    "containerDefinitions",
    "requiresCompatibilities",
    "volumes",
    "placementConstraints",
    "runtimePlatform",
    "proxyConfiguration",
    "ephemeralStorage",
  ];
  const next = {};
  for (const k of keep) if (td[k] !== undefined) next[k] = td[k];
  next.cpu = NEW_CPU;
  next.memory = NEW_MEMORY;

  const tmp = path.join(process.cwd(), `.forge-scale-api-td-${Date.now()}.json`);
  writeFileSync(tmp, JSON.stringify(next));
  try {
    const registered = awsJson([
      "ecs",
      "register-task-definition",
      "--cli-input-json",
      `file://${tmp.replace(/\\/g, "/")}`,
    ]).taskDefinition;
    awsJson([
      "ecs",
      "update-service",
      "--cluster",
      CLUSTER,
      "--service",
      SERVICE,
      "--task-definition",
      registered.taskDefinitionArn,
      "--force-new-deployment",
    ]);
    results.api = {
      from: { cpu: td.cpu, memory: td.memory, taskDef: svc.taskDefinition },
      to: {
        cpu: NEW_CPU,
        memory: NEW_MEMORY,
        taskDef: registered.taskDefinitionArn,
      },
    };
    console.log(`API scaled → ${registered.taskDefinitionArn} (${NEW_CPU}/${NEW_MEMORY})`);
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}

if (!skipAurora) {
  const before = awsJson(["rds", "describe-db-clusters", "--db-cluster-identifier", AURORA_CLUSTER])
    .DBClusters?.[0]?.ServerlessV2ScalingConfiguration;

  awsText([
    "rds",
    "modify-db-cluster",
    "--db-cluster-identifier",
    AURORA_CLUSTER,
    "--serverless-v2-scaling-configuration",
    `MinCapacity=${NEW_MIN_ACU},MaxCapacity=${NEW_MAX_ACU}`,
    "--apply-immediately",
  ]);

  results.aurora = {
    from: before ?? null,
    to: { MinCapacity: NEW_MIN_ACU, MaxCapacity: NEW_MAX_ACU },
  };
  console.log(`Aurora min ACU → ${NEW_MIN_ACU} (max ${NEW_MAX_ACU})`);
}

console.log(JSON.stringify({ ok: true, results }, null, 2));
console.log("Wait ~3–5 min for ECS rollout + Aurora capacity to settle, then hard-refresh.");
