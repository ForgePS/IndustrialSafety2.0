#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const BRIDGE_ID = process.env.BRIDGE_ID || "01a08fff-6141-7624-924c-fb44d482d942";
const APPLY = process.env.APPLY === "1" ? "1" : "0";
const FORGE_ENV = process.env.FORGE_ENV === "development" ? "development" : "production";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || `forge-${FORGE_ENV}-secrets-database`;
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET ||
  (FORGE_ENV === "production"
    ? "forge-production-imports-511343547817-us-east-1"
    : "forge-development-imports-511343547817-us-east-1");
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || `/forge/${FORGE_ENV}/platform-api`;

const prefix = `ops/enable-print-bridge/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/enable-print-bridge.mjs`;
const local = path.resolve("scripts/enable-print-bridge.mjs");

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
  `writeFileSync("/tmp/enable-print-bridge.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/enable-print-bridge.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "enable-print-bridge",
  {
    forgeEnvironment: FORGE_ENV,
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      TENANT_KEY,
      BRIDGE_ID,
      APPLY,
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
    "--region",
    "us-east-1",
    "--output",
    "json",
  ],
  { encoding: "utf8", shell: true },
);
console.log((JSON.parse(logs.stdout || "{}").events || []).map((e) => e.message).join("\n"));

const exitCode = awsText([
  "ecs",
  "describe-tasks",
  "--cluster",
  cluster,
  "--tasks",
  taskArn,
  "--query",
  "tasks[0].containers[0].exitCode",
]);
process.exit(Number(exitCode) || 0);
