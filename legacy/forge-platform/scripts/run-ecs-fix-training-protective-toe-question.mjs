#!/usr/bin/env node
/**
 * Fix protective?Toe mojibake in training questions for producers-rice-mill.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";

if (TENANT_KEY !== "producers-rice-mill") {
  console.error(`Refusing tenant ${TENANT_KEY}; only producers-rice-mill is allowed`);
  process.exit(1);
}

const prefix = `fix/training-protective-toe/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/fix-training-protective-toe-question.mjs`;
const local = path.resolve("scripts/fix-training-protective-toe-question.mjs");

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
  `writeFileSync("/tmp/fix-training-protective-toe-question.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/fix-training-protective-toe-question.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `fix-training-protective-toe-${APPLY === "1" ? "apply" : "dry"}-${TENANT_KEY}`,
  {
    forgeEnvironment: "production",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      TENANT_KEY,
      APPLY,
    },
  },
);

console.log(JSON.stringify({ cluster, taskArn, apply: APPLY === "1" }, null, 2));

const wait = spawnSync(
  "aws",
  ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn],
  { encoding: "utf8", shell: true },
);
if (wait.status !== 0) {
  console.error(wait.stderr || wait.stdout);
  process.exit(1);
}

const desc = spawnSync(
  "aws",
  ["ecs", "describe-tasks", "--cluster", cluster, "--tasks", taskArn, "--output", "json"],
  { encoding: "utf8", shell: true },
);
const task = JSON.parse(desc.stdout).tasks?.[0];
const exit = task?.containers?.[0]?.exitCode;
if (exit !== 0) process.exit(exit || 1);
