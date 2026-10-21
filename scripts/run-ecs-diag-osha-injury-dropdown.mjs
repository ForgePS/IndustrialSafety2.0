#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const FORGE_ENV = process.env.FORGE_ENV === "development" ? "development" : "production";
const isProd = FORGE_ENV === "production";
const ADMIN_SECRET_NAME = isProd
  ? "forge-production-secrets-database"
  : "forge-development-secrets-database";
const IMPORTS_BUCKET = isProd
  ? "forge-production-imports-511343547817-us-east-1"
  : "forge-development-imports-511343547817-us-east-1";
const LOG_GROUP = isProd ? "/forge/production/platform-api" : "/forge/development/platform-api";

const prefix = `diag/osha-injury/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/diag-osha-injury-dropdown.mjs`;
const local = path.resolve("scripts/diag-osha-injury-dropdown.mjs");

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
  `writeFileSync("/tmp/diag-osha-injury-dropdown.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/diag-osha-injury-dropdown.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "diag-osha-injury-dd",
  {
    forgeEnvironment: FORGE_ENV,
    environment: { DATABASE_SECRET_ARN: adminSecretArn },
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
console.log(
  awsText([
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
  ]),
);
process.exit(exitCode === 0 ? 0 : 1);
