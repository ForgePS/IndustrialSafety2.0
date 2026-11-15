#!/usr/bin/env node
/**
 * ECS runner for diag-demo-like-content-on-tenant.mjs
 *   TENANT_KEY=producers-rice-mill node scripts/run-ecs-diag-demo-like-content.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";

const script = "diag-demo-like-content-on-tenant.mjs";
const prefix = `walkthrough/diag-demo-like/${new Date().toISOString().replace(/[:.]/g, "-")}`;
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
  "diag-demo-like",
  {
    forgeEnvironment: "production",
    environment: { DATABASE_SECRET_ARN: adminSecretArn, TENANT_KEY },
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
const logs = spawnSync(
  "aws",
  [
    "logs",
    "get-log-events",
    "--log-group-name",
    "/forge/production/platform-api",
    "--log-stream-name",
    `platform-api/platform-api/${taskId}`,
    "--start-from-head",
    "--limit",
    "20",
    "--query",
    "events[*].message",
    "--output",
    "text",
  ],
  { encoding: "utf8", shell: true },
);
process.stdout.write(String(logs.stdout || logs.stderr || ""));
console.log(JSON.stringify({ cluster, taskArn, exitCode, TENANT_KEY }));
process.exit(exitCode === 0 ? 0 : 1);
