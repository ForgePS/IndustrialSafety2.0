#!/usr/bin/env node
/**
 * Seed Safety Incidents Detail Excel export into production Incidents.
 *
 * Dry-run:
 *   TENANT_KEY=producers-rice-mill node scripts/run-ecs-seed-safety-incidents-detail.mjs
 * Apply:
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/run-ecs-seed-safety-incidents-detail.mjs
 * Sample:
 *   TENANT_KEY=producers-rice-mill LIMIT=10 APPLY=1 node scripts/run-ecs-seed-safety-incidents-detail.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const LIMIT = (process.env.LIMIT || "").trim();
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";

const JSON_LOCAL =
  process.env.SAFETY_INCIDENTS_JSON_LOCAL ||
  path.resolve(".tmp-xlsx/safety-incidents.json");
const SCRIPT_LOCAL = path.resolve("scripts/seed-safety-incidents-detail.mjs");

const prefix = `seed/safety-incidents-detail/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const scriptKey = `${prefix}/seed-safety-incidents-detail.mjs`;
const jsonKey = `${prefix}/safety-incidents.json`;

for (const [local, key] of [
  [SCRIPT_LOCAL, scriptKey],
  [JSON_LOCAL, jsonKey],
]) {
  const up = spawnSync("aws", ["s3", "cp", local, `s3://${IMPORTS_BUCKET}/${key}`], {
    encoding: "utf8",
    shell: true,
  });
  if (up.status !== 0) {
    console.error(up.stderr || up.stdout);
    process.exit(1);
  }
}

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
  `const bucket=${JSON.stringify(IMPORTS_BUCKET)};`,
  `const scriptKey=${JSON.stringify(scriptKey)};`,
  `const jsonKey=${JSON.stringify(jsonKey)};`,
  `const c=new S3Client({});`,
  `const script=await c.send(new GetObjectCommand({Bucket:bucket,Key:scriptKey}));`,
  `const json=await c.send(new GetObjectCommand({Bucket:bucket,Key:jsonKey}));`,
  `writeFileSync("/tmp/seed-safety-incidents-detail.mjs", await script.Body.transformToString("utf8"));`,
  `writeFileSync("/tmp/safety-incidents.json", await json.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/seed-safety-incidents-detail.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const env = {
  DATABASE_SECRET_ARN: adminSecretArn,
  TENANT_KEY,
  APPLY,
  SAFETY_INCIDENTS_JSON_PATH: "/tmp/safety-incidents.json",
};
if (LIMIT) env.LIMIT = LIMIT;

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "seed-safety-incidents-detail",
  {
    forgeEnvironment: "production",
    environment: env,
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
    "400",
    "--query",
    "events[*].message",
    "--output",
    "text",
  ]);
} catch (e) {
  logs = String(e.message || e);
}

console.log(logs);
console.log(JSON.stringify({ taskArn, exitCode, apply: APPLY, limit: LIMIT || null }, null, 2));
process.exit(exitCode === 0 ? 0 : 1);
