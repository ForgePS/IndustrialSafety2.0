#!/usr/bin/env node
/**
 * ECS one-off: seed forge-platform tenant with synthetic Industrial demo data.
 *
 * Dry-run of the seed script is the default when APPLY is unset inside the
 * container; this runner always passes APPLY=1.
 *
 *   FORGE_ENV=production node scripts/run-ecs-seed-forge-platform-demo.mjs
 *   FORGE_ENV=development node scripts/run-ecs-seed-forge-platform-demo.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "forge-platform";
const COMPANY_NAME = process.env.COMPANY_NAME || "Forge Demo Manufacturing";
const APPLY = process.env.APPLY === "0" || process.env.APPLY === "false" ? "0" : "1";
const FORGE_ENV = process.env.FORGE_ENV === "production" ? "production" : "development";
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

const prefix = `seed/forge-platform-demo/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/seed-forge-platform-demo.mjs`;
const local = path.resolve("scripts/seed-forge-platform-demo.mjs");

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
  `writeFileSync("/tmp/seed-forge-platform-demo.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/seed-forge-platform-demo.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `seed-forge-platform-demo-${TENANT_KEY}`,
  {
    forgeEnvironment: FORGE_ENV,
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      TENANT_KEY,
      APPLY,
      COMPANY_NAME,
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
} catch (e) {
  logs = String(e.message || e);
}

console.log(logs);
console.log(
  JSON.stringify(
    {
      taskArn,
      exitCode,
      apply: APPLY,
      tenantKey: TENANT_KEY,
      forgeEnv: FORGE_ENV,
    },
    null,
    2,
  ),
);
process.exit(exitCode === 0 ? 0 : 1);
