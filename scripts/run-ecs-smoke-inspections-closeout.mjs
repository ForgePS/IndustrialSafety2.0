#!/usr/bin/env node
/**
 * Run inspections close-out smoke via ECS one-off.
 *   node scripts/run-ecs-smoke-inspections-closeout.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const API_BASE = process.env.API_BASE || "https://dygmtx4vxgy9i.cloudfront.net";

if (TENANT_KEY !== "producers-rice-mill") {
  console.error(`Refusing tenant ${TENANT_KEY}`);
  process.exit(1);
}

const prefix = `smoke/inspections-closeout/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/smoke-inspections-closeout.mjs`;
const local = path.resolve("scripts/smoke-inspections-closeout.mjs");

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
  `writeFileSync("/tmp/smoke-inspections-closeout.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/smoke-inspections-closeout.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `smoke-inspections-closeout-${TENANT_KEY}`,
  {
    forgeEnvironment: "production",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      TENANT_KEY,
      API_BASE,
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
console.log(JSON.stringify({ cluster, taskArn, exitCode }, null, 2));
if (exitCode !== 0) process.exit(exitCode ?? 1);
