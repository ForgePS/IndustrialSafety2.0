#!/usr/bin/env node
/**
 * Enable Calendar + Reminders modules for producers-rice-mill in production.
 *
 * Dry-run:
 *   TENANT_KEY=producers-rice-mill node scripts/run-ecs-enable-calendar-reminders-modules.mjs
 * Apply:
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/run-ecs-enable-calendar-reminders-modules.mjs
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

const prefix = `enable/calendar-reminders/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/enable-calendar-reminders-modules.mjs`;
const local = path.resolve("scripts/enable-calendar-reminders-modules.mjs");

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
  `import { pathToFileURL } from "node:url";`,
  `const s3 = new S3Client({});`,
  `const obj = await s3.send(new GetObjectCommand({ Bucket: ${JSON.stringify(IMPORTS_BUCKET)}, Key: ${JSON.stringify(key)} }));`,
  `const body = await obj.Body.transformToString();`,
  `writeFileSync("/tmp/enable-calendar-reminders-modules.mjs", body);`,
  `process.env.TENANT_KEY = ${JSON.stringify(TENANT_KEY)};`,
  `process.env.APPLY = ${JSON.stringify(APPLY)};`,
  `process.env.DATABASE_SECRET_ARN = ${JSON.stringify(adminSecretArn)};`,
  `await import(pathToFileURL("/tmp/enable-calendar-reminders-modules.mjs").href);`,
].join("\n");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `enable-calendar-reminders-${APPLY === "1" ? "apply" : "dry"}`,
  {
    forgeEnvironment: "production",
    environment: { DATABASE_SECRET_ARN: adminSecretArn },
  },
);

spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
});

const exitCode = spawnSync(
  "aws",
  [
    "ecs",
    "describe-tasks",
    "--cluster",
    cluster,
    "--tasks",
    taskArn,
    "--region",
    "us-east-1",
    "--query",
    "tasks[0].containers[0].exitCode",
    "--output",
    "text",
  ],
  { encoding: "utf8", shell: true },
);

const code = String(exitCode.stdout || "").trim();
console.log(JSON.stringify({ cluster, taskArn, exitCode: code, apply: APPLY === "1" }, null, 2));
if (code !== "0") process.exit(1);
