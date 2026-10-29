#!/usr/bin/env node
/**
 * List (and optionally activate) stuck PROCESSING/FAILED training videos.
 * FORGE_ENV=production ACTIVATE_STUCK=1 node scripts/run-ecs-stuck-training-videos.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const ACTIVATE = process.env.ACTIVATE_STUCK === "1" ? "1" : "0";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const key = `diag/stuck-training-videos/${stamp}/_tmp-list-stuck-training-videos.mjs`;
const local = path.resolve("scripts/_tmp-list-stuck-training-videos.mjs");

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
  `writeFileSync("/tmp/list-stuck-training-videos.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/list-stuck-training-videos.mjs"],{stdio:"inherit",env:{...process.env,ACTIVATE_STUCK:${JSON.stringify(ACTIVATE)}}});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "stuck-training-videos",
  {
    forgeEnvironment: "production",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      ACTIVATE_STUCK: ACTIVATE,
    },
  },
);

spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
  stdio: "inherit",
});

const desc = JSON.parse(
  spawnSync(
    "aws",
    ["ecs", "describe-tasks", "--cluster", cluster, "--tasks", taskArn, "--output", "json"],
    { encoding: "utf8", shell: true },
  ).stdout,
);
const exitCode = desc.tasks?.[0]?.containers?.[0]?.exitCode;
console.log(JSON.stringify({ taskArn, exitCode }, null, 2));

const logs = spawnSync(
  "aws",
  [
    "logs",
    "filter-log-events",
    "--log-group-name",
    LOG_GROUP,
    "--filter-pattern",
    "stuckCount",
    "--start-time",
    String(Date.now() - 15 * 60 * 1000),
    "--limit",
    "20",
    "--query",
    "events[*].message",
    "--output",
    "json",
  ],
  { encoding: "utf8", shell: true },
);
console.log(logs.stdout || logs.stderr);
process.exit(exitCode === 0 || exitCode === undefined ? 0 : exitCode);
