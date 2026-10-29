#!/usr/bin/env node
/**
 * Run diag-auth-principal-steps.mjs on development platform-api with ACCESS_TOKEN.
 *
 *   ACCESS_TOKEN=eyJ... FORGE_ENV=development node scripts/run-ecs-diag-auth-principal-steps.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const ACCESS_TOKEN = (process.env.ACCESS_TOKEN || "").trim();
if (!ACCESS_TOKEN) {
  console.error("ACCESS_TOKEN required");
  process.exit(1);
}

const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-development-imports-511343547817-us-east-1";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/development/platform-api";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-development-secrets-database";

const script = "diag-auth-principal-steps.mjs";
const key = `diag/auth-principal/${Date.now()}/${script}`;
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
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:${JSON.stringify(IMPORTS_BUCKET)},Key:${JSON.stringify(key)}}));`,
  `writeFileSync("/tmp/${script}", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/${script}"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "diag-auth-principal-steps",
  {
    forgeEnvironment: process.env.FORGE_ENV?.trim() || "development",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      ACCESS_TOKEN,
    },
  },
);

spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
  timeout: 900_000,
});

const taskId = taskArn.split("/").pop();
const logs = spawnSync(
  "aws",
  [
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
  ],
  { encoding: "utf8", shell: true },
);
console.log(logs.stdout || logs.stderr);
console.log(JSON.stringify({ taskArn }, null, 2));
