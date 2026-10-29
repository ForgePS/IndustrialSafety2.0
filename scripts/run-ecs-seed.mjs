#!/usr/bin/env node
/**
 * Run platform catalog seed via ECS one-off.
 *
 * Usage: node scripts/run-ecs-seed.mjs --env <development|production>
 *        [--task-definition <arn>]
 *
 * Legacy: FORGE_ENV=production node scripts/run-ecs-seed.mjs
 */
import { spawnSync } from "node:child_process";
import { runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const taskDefinitionIndex = args.indexOf("--task-definition");
const forgeEnvironment =
  (envIndex === -1 ? null : args[envIndex + 1]) || process.env.FORGE_ENV?.trim() || "development";
const taskDefinition =
  (taskDefinitionIndex === -1 ? null : args[taskDefinitionIndex + 1]) ||
  process.env.FORGE_ECS_TASK_DEFINITION?.trim() ||
  null;

if (!["development", "production"].includes(forgeEnvironment)) {
  console.error(`Unsupported --env ${forgeEnvironment}`);
  process.exit(1);
}

console.log(`Seeding ${forgeEnvironment}${taskDefinition ? ` via ${taskDefinition}` : ""}`);

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "/app/packages/database/dist/seed.js"],
  `seed-${forgeEnvironment}`,
  {
    forgeEnvironment,
    taskDefinition,
  },
);

spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
});

const exitCode = spawnSync(
  "aws",
  [
    "ecs",
    "describe-tasks",
    "--cluster",
    cluster,
    "--tasks",
    taskArn,
    "--region",
    "us-east-1",
    "--query",
    "tasks[0].containers[0].exitCode",
    "--output",
    "text",
  ],
  { encoding: "utf8", shell: true },
);

const taskId = taskArn.split("/").pop();
const logs = spawnSync(
  "aws",
  [
    "logs",
    "get-log-events",
    "--log-group-name",
    `/forge/${forgeEnvironment}/platform-api`,
    "--log-stream-name",
    `platform-api/platform-api/${taskId}`,
    "--limit",
    "200",
    "--region",
    "us-east-1",
    "--output",
    "json",
  ],
  { encoding: "utf8", shell: true },
);

const text = (JSON.parse(logs.stdout || "{}").events || []).map((e) => e.message).join("\n");
console.log(text);

const code = String(exitCode.stdout || "").trim();
console.log(`\nseed exitCode=${code} environment=${forgeEnvironment}`);
process.exit(code === "0" ? 0 : 1);
