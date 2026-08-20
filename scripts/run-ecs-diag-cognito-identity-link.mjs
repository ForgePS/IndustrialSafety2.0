#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TARGET_EMAIL = process.env.TARGET_EMAIL || "tbogy@producersrice.com";
const COGNITO_SUB = process.env.COGNITO_SUB || "54683448-30d1-702f-ac6a-ca6b5cfe8b0c";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";
const key = `diag/cognito-identity-link/${Date.now()}/diag-cognito-identity-link.mjs`;
const local = path.resolve("scripts/diag-cognito-identity-link.mjs");

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
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database",
  "--query",
  "ARN",
]);

const evalCode = [
  `import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";`,
  `import { writeFileSync } from "node:fs";`,
  `import { spawnSync } from "node:child_process";`,
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:${JSON.stringify(IMPORTS_BUCKET)},Key:${JSON.stringify(key)}}));`,
  `writeFileSync("/tmp/diag-cognito-identity-link.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/diag-cognito-identity-link.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "diag-cognito-identity-link",
  {
    forgeEnvironment: "production",
    environment: { DATABASE_SECRET_ARN: adminSecretArn, TARGET_EMAIL, COGNITO_SUB },
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
    "200",
    "--query",
    "events[*].message",
    "--output",
    "text",
  ],
  { encoding: "utf8", shell: true },
);
console.log(logs.stdout || logs.stderr);
console.log(JSON.stringify({ taskArn }, null, 2));
