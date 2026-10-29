#!/usr/bin/env node
/**
 * Upload fix-admin-default-tenant.mjs and run as ECS one-off (development).
 *
 *   APPLY=1 FORGE_ENV=development node scripts/run-ecs-fix-admin-default-tenant.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const FORGE_ENV = process.env.FORGE_ENV?.trim() || "development";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || `forge-${FORGE_ENV}-secrets-database`;
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || `forge-${FORGE_ENV}-imports-511343547817-us-east-1`;
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || `/forge/${FORGE_ENV}/platform-api`;

const script = "fix-admin-default-tenant.mjs";
const prefix = `fix/fix-admin-default-tenant/${new Date().toISOString().replace(/[:.]/g, "-")}`;
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
  `fix-admin-default-tenant-${APPLY === "1" ? "apply" : "dry"}`,
  {
    forgeEnvironment: FORGE_ENV,
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      APPLY,
      FORGE_ENV,
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
    "100",
    "--query",
    "events[*].message",
    "--output",
    "text",
  ]);
} catch (e) {
  logs = String(e.message || e);
}
const resultLine = (typeof logs === "string" ? logs.split(/\r?\n/) : []).find((m) =>
  m.includes("FIX-ADMIN-DEFAULT-TENANT"),
);
if (resultLine) console.log(resultLine);
else console.log(logs);
console.log(JSON.stringify({ taskArn, exitCode, apply: APPLY === "1", s3Key: key }, null, 2));
process.exit(exitCode === 0 ? 0 : 1);
