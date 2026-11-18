#!/usr/bin/env node
/**
 * Apply Field-login schema gaps on development via ECS one-off.
 *
 * Dry-run:
 *   node scripts/run-ecs-apply-dev-schema-gaps-field-login.mjs
 * Apply:
 *   APPLY=1 node scripts/run-ecs-apply-dev-schema-gaps-field-login.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const forgeEnvironment = process.env.FORGE_ENV?.trim() || "development";
if (forgeEnvironment !== "development") {
  console.error("This script is development-only (targeted schema gap fill).");
  process.exit(1);
}

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const ADMIN_SECRET_NAME = "forge-development-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-development-imports-511343547817-us-east-1";
const LOG_GROUP = "/forge/development/platform-api";

const script = "apply-dev-schema-gaps-field-login.mjs";
const prefix = `fix/schema-gaps-field-login/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/${script}`;
const local = path.resolve("scripts", script);

const up = spawnSync("aws", ["s3", "cp", local, `s3://${IMPORTS_BUCKET}/${key}`], {
  encoding: "utf8",
  shell: true,
});
if (up.status !== 0) {
  console.error(up.stderr || up.stdout);
  process.exit(1);
}

const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  ADMIN_SECRET_NAME,
  "--query",
  "ARN",
]);

if (!adminSecretArn.includes("forge-development-") || adminSecretArn.includes("database-app")) {
  throw new Error(`Refusing non-admin development secret ARN: ${adminSecretArn}`);
}

const evalCode = [
  `import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";`,
  `import { writeFileSync } from "node:fs";`,
  `import { spawnSync } from "node:child_process";`,
  `const bucket=${JSON.stringify(IMPORTS_BUCKET)};`,
  `const key=${JSON.stringify(key)};`,
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));`,
  `writeFileSync("/tmp/${script}", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/${script}"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `schema-gaps-field-login-${APPLY === "1" ? "apply" : "dry"}`,
  {
    forgeEnvironment: "development",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      APPLY,
    },
  },
);

spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
  timeout: 900_000,
});

const desc = awsJson(["ecs", "describe-tasks", "--cluster", cluster, "--tasks", taskArn]);
const exitCode = desc.tasks?.[0]?.containers?.[0]?.exitCode;
const taskId = taskArn.split("/").pop();
let logs = "";
try {
  logs = awsText([
    "logs",
    "get-log-events",
    "--log-group-name",
    LOG_GROUP,
    "--log-stream-name",
    `platform-api/platform-api/${taskId}`,
    "--limit",
    "100",
    "--query",
    "events[*].message",
    "--output",
    "text",
  ]);
} catch (e) {
  logs = String(e.message || e);
}
console.log(logs);
console.log(JSON.stringify({ taskArn, exitCode, apply: APPLY === "1" }, null, 2));
process.exit(exitCode === 0 ? 0 : 1);
