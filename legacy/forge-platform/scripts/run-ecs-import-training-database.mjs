#!/usr/bin/env node
/**
 * Upload Training Database.xlsx and import script, then run import on ECS.
 *
 * Dry-run:
 *   node scripts/run-ecs-import-training-database.mjs --file "c:/Users/jerem/Downloads/Training Database.xlsx"
 * Apply:
 *   APPLY=1 node scripts/run-ecs-import-training-database.mjs --file "c:/Users/jerem/Downloads/Training Database.xlsx"
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const FORGE_ENV = process.env.FORGE_ENV?.trim() || "production";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP =
  process.env.FORGE_API_LOG_GROUP ||
  (FORGE_ENV === "production"
    ? "/forge/production/platform-api"
    : "/forge/development/platform-api");

const localFile = path.resolve(
  arg("file") ||
    process.env.TRAINING_XLSX_PATH ||
    "c:/Users/jerem/Downloads/Training Database.xlsx",
);
const prefix = `seed/training-database/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const scriptKey = `${prefix}/import-training-database.mjs`;
const xlsxKey = `${prefix}/Training-Database.xlsx`;
const scriptLocal = path.resolve("scripts/import-training-database.mjs");
const importRunId = prefix.split("/").pop();

for (const [local, key, label] of [
  [scriptLocal, scriptKey, "script"],
  [localFile, xlsxKey, "xlsx"],
]) {
  const dest = `s3://${IMPORTS_BUCKET}/${key}`;
  const up = spawnSync("aws", ["s3", "cp", local, dest], {
    encoding: "utf8",
    shell: false,
  });
  if (up.status !== 0) {
    console.error(`Failed to upload ${label}:`, up.stderr || up.stdout);
    process.exit(1);
  }
  console.log(`Uploaded ${label} -> s3://${IMPORTS_BUCKET}/${key}`);
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
  `const script=await c.send(new GetObjectCommand({Bucket:${JSON.stringify(IMPORTS_BUCKET)},Key:${JSON.stringify(scriptKey)}}));`,
  `writeFileSync("/tmp/import-training-database.mjs", await script.Body.transformToString("utf8"));`,
  `const xlsx=await c.send(new GetObjectCommand({Bucket:${JSON.stringify(IMPORTS_BUCKET)},Key:${JSON.stringify(xlsxKey)}}));`,
  `writeFileSync("/tmp/Training-Database.xlsx", Buffer.from(await xlsx.Body.transformToByteArray()));`,
  `const run=spawnSync(process.execPath,["/tmp/import-training-database.mjs"],{stdio:"inherit",env:{...process.env,TRAINING_XLSX_PATH:"/tmp/Training-Database.xlsx"}});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "import-training-database",
  {
    forgeEnvironment: FORGE_ENV,
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      TENANT_KEY,
      APPLY,
      IMPORT_RUN_ID: importRunId,
      TRAINING_XLSX_PATH: "/tmp/Training-Database.xlsx",
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
  const out = spawnSync(
    "aws",
    [
      "logs",
      "get-log-events",
      "--log-group-name",
      LOG_GROUP,
      "--log-stream-name",
      `platform-api/platform-api/${taskId}`,
      "--limit",
      "400",
      "--output",
      "json",
    ],
    { encoding: "utf8", shell: true },
  );
  logs = (JSON.parse(out.stdout || "{}").events || []).map((e) => e.message).join("\n");
} catch {
  // ignore
}
process.stdout.write(logs + (logs.endsWith("\n") ? "" : "\n"));
process.exit(exitCode ?? 1);
