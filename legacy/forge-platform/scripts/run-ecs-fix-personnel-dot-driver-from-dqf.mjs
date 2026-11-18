#!/usr/bin/env node
/**
 * Recompute is_dot_driver from DQF links in production.
 *
 * Dry-run:
 *   node scripts/run-ecs-fix-personnel-dot-driver-from-dqf.mjs
 * Apply:
 *   APPLY=1 node scripts/run-ecs-fix-personnel-dot-driver-from-dqf.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";

const prefix = `fix/personnel-dot-driver/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/fix-personnel-dot-driver-from-dqf.mjs`;
const local = path.resolve("scripts/fix-personnel-dot-driver-from-dqf.mjs");

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
  `writeFileSync("/tmp/fix-personnel-dot-driver-from-dqf.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/fix-personnel-dot-driver-from-dqf.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `fix-dot-driver-${APPLY === "1" ? "apply" : "dry"}`,
  {
    forgeEnvironment: "production",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      APPLY,
    },
  },
);

spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
  timeout: 900_000,
});

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

const logs = spawnSync(
  "aws",
  [
    "logs",
    "filter-log-events",
    "--log-group-name",
    LOG_GROUP,
    "--filter-pattern",
    `"${taskArn.split("/").pop()}"`,
    "--limit",
    "50",
    "--query",
    "events[*].message",
    "--output",
    "text",
  ],
  { encoding: "utf8", shell: true },
);
if (logs.stdout) console.log(logs.stdout);
if (logs.stderr) console.error(logs.stderr);

console.log(JSON.stringify({ taskArn, exitCode: Number(exitCode) }, null, 2));
process.exit(Number(exitCode) || 0);
