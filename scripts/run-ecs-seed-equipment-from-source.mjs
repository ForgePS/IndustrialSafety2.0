#!/usr/bin/env node
/**
 * Backfill industrial_equipment columns + normalized Firebase payload fields
 * for producers-rice-mill (assetRecords → industrial_equipment).
 *
 * Dry-run:
 *   FORGE_ENV=production node scripts/run-ecs-seed-equipment-from-source.mjs
 * Apply:
 *   FORGE_ENV=production APPLY=1 node scripts/run-ecs-seed-equipment-from-source.mjs
 * Limited sample:
 *   FORGE_ENV=production LIMIT=50 node scripts/run-ecs-seed-equipment-from-source.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const LIMIT = process.env.LIMIT || "0";
const FORGE_ENV = process.env.FORGE_ENV === "development" ? "development" : "production";
const isProd = FORGE_ENV === "production";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME ||
  (isProd ? "forge-production-secrets-database" : "forge-development-secrets-database");
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET ||
  (isProd
    ? "forge-production-imports-511343547817-us-east-1"
    : "forge-development-imports-511343547817-us-east-1");
const LOG_GROUP =
  process.env.FORGE_API_LOG_GROUP ||
  (isProd ? "/forge/production/platform-api" : "/forge/development/platform-api");

if (TENANT_KEY !== "producers-rice-mill") {
  console.error(`Refusing tenant ${TENANT_KEY}; only producers-rice-mill is allowed`);
  process.exit(1);
}

const prefix = `seed/equipment-from-source/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/seed-equipment-from-source.mjs`;
const local = path.resolve("scripts/seed-equipment-from-source.mjs");

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

const evalCode = [
  `import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";`,
  `import { writeFileSync } from "node:fs";`,
  `import { spawnSync } from "node:child_process";`,
  `const bucket=${JSON.stringify(IMPORTS_BUCKET)};`,
  `const key=${JSON.stringify(key)};`,
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));`,
  `writeFileSync("/tmp/seed-equipment-from-source.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/seed-equipment-from-source.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `seed-equip-src-${APPLY === "1" ? "apply" : "dry"}-${TENANT_KEY}`,
  {
    forgeEnvironment: FORGE_ENV,
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      TENANT_KEY,
      APPLY,
      LIMIT,
    },
  },
);

spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
  timeout: 2_700_000,
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
console.log(
  JSON.stringify({ taskArn, exitCode, apply: APPLY, limit: LIMIT, forgeEnv: FORGE_ENV }, null, 2),
);
if (exitCode !== 0) process.exit(typeof exitCode === "number" ? exitCode : 1);
