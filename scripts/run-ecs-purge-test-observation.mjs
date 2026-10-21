#!/usr/bin/env node
/**
 * Runs scripts/purge-test-observation.mjs as a one-off production platform-api task.
 *
 *   DATE=2026-10-07 node scripts/run-ecs-purge-test-observation.mjs
 *   APPLY=1 OBSERVATION_ID=<uuid> node scripts/run-ecs-purge-test-observation.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";

const script = "purge-test-observation.mjs";
const key = `maintenance/purge-test-observation/${new Date().toISOString().replace(/[:.]/g, "-")}/${script}`;

const up = spawnSync("aws", ["s3", "cp", path.resolve("scripts", script), `s3://${IMPORTS_BUCKET}/${key}`], {
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
  `purge-test-observation-${APPLY === "1" ? "apply" : "dry"}`,
  {
    forgeEnvironment: "production",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      APPLY,
      DATE: process.env.DATE || "",
      OBSERVATION_ID: process.env.OBSERVATION_ID || "",
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
const logs = spawnSync(
  "aws",
  [
    "logs",
    "get-log-events",
    "--log-group-name",
    "/forge/production/platform-api",
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
process.stdout.write(String(logs.stdout || logs.stderr || ""));
console.log(JSON.stringify({ taskArn, exitCode, APPLY }));
process.exit(typeof exitCode === "number" ? exitCode : 1);
