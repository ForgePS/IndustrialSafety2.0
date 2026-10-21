#!/usr/bin/env node
/**
 * Seed Company / Locations / Departments from Manager-Departments spreadsheet
 * into producers-rice-mill via ECS one-off.
 *
 * Dry-run:
 *   node scripts/run-ecs-seed-manager-departments.mjs
 * Apply:
 *   APPLY=1 node scripts/run-ecs-seed-manager-departments.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";

const JSON_LOCAL =
  process.env.MANAGER_DEPARTMENTS_JSON_LOCAL ||
  path.resolve(".tmp-xlsx/manager-departments.json");
const SCRIPT_LOCAL = path.resolve("scripts/seed-manager-departments.mjs");

if (TENANT_KEY !== "producers-rice-mill") {
  console.error(`Refusing tenant ${TENANT_KEY}; only producers-rice-mill is allowed`);
  process.exit(1);
}

const prefix = `seed/manager-departments/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const scriptKey = `${prefix}/seed-manager-departments.mjs`;
const jsonKey = `${prefix}/manager-departments.json`;

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
  `writeFileSync("/tmp/seed-manager-departments.mjs", await script.Body.transformToString("utf8"));`,
  `writeFileSync("/tmp/manager-departments.json", await json.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/seed-manager-departments.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `mgr-depts-${APPLY === "1" ? "apply" : "dry"}-${TENANT_KEY}`,
  {
    forgeEnvironment: "production",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      TENANT_KEY,
      APPLY,
      MANAGER_DEPARTMENTS_JSON_PATH: "/tmp/manager-departments.json",
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
      "120",
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
console.log(JSON.stringify({ cluster, taskArn, apply: APPLY, exitCode }, null, 2));
process.exit(exitCode ?? 1);
