#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";

const prefix = `fix/dot-dqf-personnel-links/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/fix-dot-dqf-personnel-links.mjs`;
const local = path.resolve("scripts/fix-dot-dqf-personnel-links.mjs");

spawnSync("aws", ["s3", "cp", local, `s3://${IMPORTS_BUCKET}/${key}`], {
  encoding: "utf8",
  shell: true,
});

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
  `writeFileSync("/tmp/fix-dot-dqf-personnel-links.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/fix-dot-dqf-personnel-links.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `fix-dot-dqf-personnel-${APPLY === "1" ? "apply" : "dry"}-${TENANT_KEY}`,
  {
    forgeEnvironment: "production",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      TENANT_KEY,
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
const logs = awsText([
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

console.log(logs);
console.log(JSON.stringify({ taskArn, exitCode, apply: APPLY }, null, 2));
