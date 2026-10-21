#!/usr/bin/env node
/**
 * Seed DOT DQF driver worksheet data for producers-rice-mill in production.
 *
 * Parses the local xlsx (or uses DQF_DRIVERS_JSON_LOCAL), uploads JSON + script to S3,
 * and runs on ECS.
 *
 * Dry-run:
 *   node scripts/run-ecs-seed-dot-dqf-from-source.mjs
 * Apply:
 *   APPLY=1 node scripts/run-ecs-seed-dot-dqf-from-source.mjs
 * Force re-apply:
 *   APPLY=1 FORCE=1 node scripts/run-ecs-seed-dot-dqf-from-source.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true" ? "1" : "0";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";

const DEFAULT_XLSX =
  "C:/Users/jerem/OneDrive/Forge Public Safety/Industrial Safety/DQF Files.xlsx";
const XLSX_LOCAL = process.env.DQF_XLSX_LOCAL || DEFAULT_XLSX;
const JSON_LOCAL =
  process.env.DQF_DRIVERS_JSON_LOCAL || path.resolve(".tmp/dqf-drivers.json");
const SCRIPT_LOCAL = path.resolve("scripts/seed-dot-dqf-from-source.mjs");
const PARSE_SCRIPT = path.resolve("scripts/parse-dqf-xlsx.mjs");

if (TENANT_KEY !== "producers-rice-mill") {
  console.error(`Refusing tenant ${TENANT_KEY}; only producers-rice-mill is allowed`);
  process.exit(1);
}

if (!existsSync(JSON_LOCAL)) {
  if (!existsSync(XLSX_LOCAL)) {
    console.error(`Missing workbook: ${XLSX_LOCAL}`);
    console.error("Set DQF_XLSX_LOCAL or DQF_DRIVERS_JSON_LOCAL");
    process.exit(1);
  }
  const parse = spawnSync(
    process.execPath,
    [PARSE_SCRIPT, XLSX_LOCAL, JSON_LOCAL],
    { encoding: "utf8", shell: true },
  );
  if (parse.status !== 0) {
    console.error(parse.stderr || parse.stdout);
    process.exit(parse.status ?? 1);
  }
  console.log(parse.stdout.trim());
}

const prefix = `seed/dot-dqf-from-source/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const scriptKey = `${prefix}/seed-dot-dqf-from-source.mjs`;
const jsonKey = `${prefix}/dqf-drivers.json`;

for (const [local, key] of [
  [SCRIPT_LOCAL, scriptKey],
  [JSON_LOCAL, jsonKey],
]) {
  const up = spawnSync("aws", ["s3", "cp", local, `s3://${IMPORTS_BUCKET}/${key}`], {
    encoding: "utf8",
    shell: true,
  });
  if (up.status !== 0) {
    console.error(up.stderr || up.stdout);
    process.exit(1);
  }
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
  `const jsonKey=${JSON.stringify(jsonKey)};`,
  `const c=new S3Client({});`,
  `const script=await c.send(new GetObjectCommand({Bucket:bucket,Key:scriptKey}));`,
  `const json=await c.send(new GetObjectCommand({Bucket:bucket,Key:jsonKey}));`,
  `writeFileSync("/tmp/seed-dot-dqf-from-source.mjs", await script.Body.transformToString("utf8"));`,
  `writeFileSync("/tmp/dqf-drivers.json", await json.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/seed-dot-dqf-from-source.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const env = {
  DATABASE_SECRET_ARN: adminSecretArn,
  TENANT_KEY,
  APPLY,
  FORCE,
  DQF_DRIVERS_JSON_PATH: "/tmp/dqf-drivers.json",
};

const label = `dot-dqf-seed-${APPLY === "1" ? "apply" : "dry"}-${TENANT_KEY}`;
const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  label,
  {
    forgeEnvironment: "production",
    environment: env,
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
    "400",
    "--query",
    "events[*].message",
    "--output",
    "text",
  ]);
} catch (e) {
  logs = String(e.message || e);
}

console.log(logs);
console.log(JSON.stringify({ taskArn, exitCode, apply: APPLY, force: FORCE }, null, 2));
process.exit(exitCode === 0 ? 0 : 1);
