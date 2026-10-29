#!/usr/bin/env node
/**
 * ECS one-off: apply 0105 auth_browser_sessions DDL on Aurora.
 * Uses admin DB secret.
 *
 *   node scripts/run-ecs-apply-auth-browser-sessions.mjs
 *   node scripts/run-ecs-apply-auth-browser-sessions.mjs --env development
 *   node scripts/run-ecs-apply-auth-browser-sessions.mjs --env production --task-definition <arn>
 */
import { spawnSync } from "node:child_process";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const args = process.argv.slice(2);
const tdIndex = args.indexOf("--task-definition");
const taskDefinition = tdIndex === -1 ? null : args[tdIndex + 1];
const envIndex = args.indexOf("--env");
const forgeEnvironment = envIndex === -1 ? "development" : String(args[envIndex + 1] || "").trim();
if (forgeEnvironment !== "development" && forgeEnvironment !== "production") {
  throw new Error(`Unsupported --env ${forgeEnvironment}`);
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

console.log(`Applying auth_browser_sessions DDL on ${forgeEnvironment}`);

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "/app/packages/database/dist/apply-auth-browser-sessions-ecs.js"],
  "apply-auth-browser-sessions",
  {
    forgeEnvironment,
    ...(taskDefinition ? { taskDefinition } : {}),
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
).stdout.trim();

console.log(`apply-auth-browser-sessions exitCode=${exitCode}`);
process.exit(exitCode === "0" ? 0 : 1);
