#!/usr/bin/env node
/**
 * Run Drizzle migrations via ECS one-off against Aurora.
 * Uses forge_admin (master) secret — never the forge_app runtime secret.
 * Does not print secret values.
 *
 * Environment must be explicit. A previous default to development caused
 * production migrate attempts to hit the wrong database.
 *
 * Usage: node scripts/run-ecs-migrate.mjs --env <development|production>
 *        [--task-definition <arn>]
 */
import { spawnSync } from "node:child_process";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const forgeEnvironment = envIndex === -1 ? null : args[envIndex + 1];
const taskDefinitionIndex = args.indexOf("--task-definition");
const taskDefinition =
  taskDefinitionIndex === -1 ? null : args[taskDefinitionIndex + 1];

if (!forgeEnvironment) {
  console.error("Usage: node scripts/run-ecs-migrate.mjs --env <development|production>");
  process.exit(1);
}
if (!["development", "production"].includes(forgeEnvironment)) {
  console.error(`Unsupported --env ${forgeEnvironment}`);
  process.exit(1);
}

process.env.FORGE_ENV = forgeEnvironment;

const adminSecretName = `forge-${forgeEnvironment}-secrets-database`;
const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  adminSecretName,
  "--query",
  "ARN",
]);

if (!adminSecretArn.includes("secrets-database") || adminSecretArn.includes("database-app")) {
  throw new Error(`Refusing migrate with non-admin secret ARN: ${adminSecretArn}`);
}
if (!adminSecretArn.includes(`forge-${forgeEnvironment}-`)) {
  throw new Error(`Secret ARN does not belong to ${forgeEnvironment}: ${adminSecretArn}`);
}

console.log(`Migrating ${forgeEnvironment} using ${adminSecretName}`);

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "/app/packages/database/dist/migrate-ecs.js"],
  `migrate-${forgeEnvironment}`,
  {
    forgeEnvironment,
    taskDefinition,
    environment: { DATABASE_SECRET_ARN: adminSecretArn },
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
console.log(`\nmigrate exitCode=${code} environment=${forgeEnvironment}`);
process.exit(code === "0" ? 0 : 1);
