#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";
const SCRIPT_NAME = "diag-department-duplicates.mjs";
const SCRIPT_LOCAL = path.resolve(`scripts/${SCRIPT_NAME}`);
const prefix = `diag/department-duplicates/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const scriptKey = `${prefix}/${SCRIPT_NAME}`;

const up = spawnSync("aws", ["s3", "cp", SCRIPT_LOCAL, `s3://${IMPORTS_BUCKET}/${scriptKey}`], {
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
  `const scriptKey=${JSON.stringify(scriptKey)};`,
  `const c=new S3Client({});`,
  `const script=await c.send(new GetObjectCommand({Bucket:bucket,Key:scriptKey}));`,
  `writeFileSync("/tmp/${SCRIPT_NAME}", await script.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/${SCRIPT_NAME}"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "diag-department-duplicates",
  {
    forgeEnvironment: "production",
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
const out = spawnSync(
  "aws",
  [
    "logs",
    "get-log-events",
    "--log-group-name",
    LOG_GROUP,
    "--log-stream-name",
    `platform-api/platform-api/${taskId}`,
    "--start-from-head",
    "--limit",
    "10000",
    "--output",
    "json",
  ],
  { encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 },
);
const logs = (JSON.parse(out.stdout || "{}").events || []).map((e) => e.message).join("\n");
process.stdout.write(logs + "\n");
process.exit(exitCode ?? 1);
