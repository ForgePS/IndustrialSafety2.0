#!/usr/bin/env node
/**
 * Backfill incident titles to `yy-mm-dd   Name - Location` for producers-rice-mill.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/run-ecs-fix-incident-titles.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/run-ecs-fix-incident-titles.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const LIMIT = (process.env.LIMIT || "").trim();
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";

if (TENANT_KEY !== "producers-rice-mill") {
  console.error(`Refusing tenant ${TENANT_KEY}; only producers-rice-mill is allowed`);
  process.exit(1);
}

const prefix = `fix/incident-titles/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/fix-incident-titles.mjs`;
const local = path.resolve("scripts/fix-incident-titles.mjs");

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
  `writeFileSync("/tmp/fix-incident-titles.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/fix-incident-titles.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const env = {
  DATABASE_SECRET_ARN: adminSecretArn,
  TENANT_KEY,
  APPLY,
};
if (LIMIT) env.LIMIT = LIMIT;

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `fix-incident-titles-${APPLY === "1" ? "apply" : "dry"}-${TENANT_KEY}`,
  {
    forgeEnvironment: "production",
    environment: env,
  },
);

console.log(JSON.stringify({ cluster, taskArn, apply: APPLY === "1" }, null, 2));

const wait = spawnSync(
  "aws",
  [
    "ecs",
    "wait",
    "tasks-stopped",
    "--cluster",
    cluster,
    "--tasks",
    taskArn,
  ],
  { encoding: "utf8", shell: true },
);
if (wait.status !== 0) {
  console.error(wait.stderr || wait.stdout);
}

const logs = spawnSync(
  "aws",
  [
    "logs",
    "tail",
    LOG_GROUP,
    "--since",
    "15m",
    "--format",
    "short",
  ],
  { encoding: "utf8", shell: true, maxBuffer: 10 * 1024 * 1024 },
);
if (logs.stdout) console.log(logs.stdout);
if (logs.status !== 0) console.error(logs.stderr || "");
