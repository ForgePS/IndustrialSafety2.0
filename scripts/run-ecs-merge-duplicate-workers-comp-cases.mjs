#!/usr/bin/env node
/**
 * Run merge-duplicate-workers-comp-cases.mjs on production ECS.
 *
 * Dry-run:
 *   node scripts/run-ecs-merge-duplicate-workers-comp-cases.mjs
 * Apply:
 *   APPLY=1 node scripts/run-ecs-merge-duplicate-workers-comp-cases.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const FORGE_ENV = process.env.FORGE_ENV?.trim() || "production";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP =
  process.env.FORGE_API_LOG_GROUP ||
  (FORGE_ENV === "production"
    ? "/forge/production/platform-api"
    : "/forge/development/platform-api");

const prefix = `ops/merge-dup-wc/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const scriptKey = `${prefix}/merge-duplicate-workers-comp-cases.mjs`;
const scriptLocal = path.resolve("scripts/merge-duplicate-workers-comp-cases.mjs");
const mergeRunId = prefix.split("/").pop();

const up = spawnSync("aws", ["s3", "cp", scriptLocal, `s3://${IMPORTS_BUCKET}/${scriptKey}`], {
  encoding: "utf8",
  shell: false,
});
if (up.status !== 0) {
  console.error(up.stderr || up.stdout);
  process.exit(1);
}
console.log(`Uploaded script -> s3://${IMPORTS_BUCKET}/${scriptKey}`);

const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  ADMIN_SECRET_NAME,
  "--query",
  "ARN",
]);

const evalCode = [
  `import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";`,
  `import { writeFileSync } from "node:fs";`,
  `import { spawnSync } from "node:child_process";`,
  `const c=new S3Client({});`,
  `const script=await c.send(new GetObjectCommand({Bucket:${JSON.stringify(IMPORTS_BUCKET)},Key:${JSON.stringify(scriptKey)}}));`,
  `writeFileSync("/tmp/merge-duplicate-workers-comp-cases.mjs", await script.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/merge-duplicate-workers-comp-cases.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "merge-duplicate-workers-comp-cases",
  {
    forgeEnvironment: FORGE_ENV,
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      TENANT_KEY,
      APPLY,
      MERGE_RUN_ID: mergeRunId,
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
    "200",
    "--query",
    "events[*].message",
    "--output",
    "text",
  ]);
} catch {
  logs = "(logs unavailable)";
}

console.log(JSON.stringify({ exitCode, apply: APPLY === "1", logs }, null, 2));
process.exit(exitCode === 0 ? 0 : 1);
