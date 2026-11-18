#!/usr/bin/env node
/**
 * Register a new platform-api task definition revision with more memory.
 * Usage: node scripts/bump-platform-api-memory.mjs [memoryMiB]
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const memory = String(process.argv[2] || "1024");
const family = process.env.TASK_FAMILY || "forge-production-ecs-platform-api";
const cluster = process.env.ECS_CLUSTER || "forge-production-ecs-platform";
const service = process.env.ECS_SERVICE || "forge-production-ecs-platform-api";

function awsJson(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: true });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `aws failed: ${args.join(" ")}`);
  }
  return JSON.parse(r.stdout);
}

const described = awsJson([
  "ecs",
  "describe-task-definition",
  "--task-definition",
  family,
  "--output",
  "json",
]);

const td = described.taskDefinition;
for (const k of [
  "taskDefinitionArn",
  "revision",
  "status",
  "requiresAttributes",
  "compatibilities",
  "registeredAt",
  "registeredBy",
  "deregisteredAt",
]) {
  delete td[k];
}
td.memory = memory;

const tmp = join(tmpdir(), `forge-api-td-${Date.now()}.json`);
writeFileSync(tmp, JSON.stringify(td), "utf8");

try {
  const registered = awsJson([
    "ecs",
    "register-task-definition",
    "--cli-input-json",
    `file://${tmp.replace(/\\/g, "/")}`,
    "--output",
    "json",
  ]);
  const arn = registered.taskDefinition.taskDefinitionArn;
  console.log(
    JSON.stringify(
      {
        registered: true,
        arn,
        revision: registered.taskDefinition.revision,
        memory: registered.taskDefinition.memory,
      },
      null,
      2,
    ),
  );

  const updated = awsJson([
    "ecs",
    "update-service",
    "--cluster",
    cluster,
    "--service",
    service,
    "--task-definition",
    arn,
    "--force-new-deployment",
    "--output",
    "json",
  ]);
  console.log(
    JSON.stringify(
      {
        serviceUpdated: true,
        taskDefinition: updated.service.taskDefinition,
        desiredCount: updated.service.desiredCount,
        runningCount: updated.service.runningCount,
      },
      null,
      2,
    ),
  );
} finally {
  try {
    unlinkSync(tmp);
  } catch {
    // ignore
  }
}
