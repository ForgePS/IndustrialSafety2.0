#!/usr/bin/env node
/**
 * producers-rice-mill only: upload roster index + fix script and run on ECS.
 *
 *   node scripts/parse-employee-roster-xlsx.mjs "<xlsx>" --out .tmp-personnel-fix/employee-roster-index.json
 *   node scripts/run-ecs-fix-unnamed-personnel-from-roster.mjs
 *   APPLY=1 node scripts/run-ecs-fix-unnamed-personnel-from-roster.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const ROSTER_INDEX_LOCAL =
  process.env.ROSTER_INDEX_LOCAL || path.resolve(".tmp-personnel-fix/employee-roster-index.json");
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";

if (TENANT_KEY !== "producers-rice-mill") {
  console.error(`Refusing tenant ${TENANT_KEY}; this runner is producers-rice-mill only.`);
  process.exit(1);
}

if (!existsSync(ROSTER_INDEX_LOCAL)) {
  console.error(`Missing roster index: ${ROSTER_INDEX_LOCAL}`);
  console.error(
    "Run: node scripts/parse-employee-roster-xlsx.mjs \"<path-to-xlsx>\" --out .tmp-personnel-fix/employee-roster-index.json",
  );
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const prefix = `fix/unnamed-personnel-from-roster/${stamp}`;
const scriptKey = `${prefix}/fix-unnamed-personnel-from-roster.mjs`;
const indexKey = `${prefix}/employee-roster-index.json`;
const localScript = path.resolve("scripts/fix-unnamed-personnel-from-roster.mjs");

for (const [local, key] of [
  [localScript, scriptKey],
  [ROSTER_INDEX_LOCAL, indexKey],
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
  `const indexKey=${JSON.stringify(indexKey)};`,
  `const c=new S3Client({});`,
  `const script=await c.send(new GetObjectCommand({Bucket:bucket,Key:scriptKey}));`,
  `writeFileSync("/tmp/fix-unnamed-personnel-from-roster.mjs", await script.Body.transformToString("utf8"));`,
  `const index=await c.send(new GetObjectCommand({Bucket:bucket,Key:indexKey}));`,
  `writeFileSync("/tmp/employee-roster-index.json", await index.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/fix-unnamed-personnel-from-roster.mjs"],{stdio:"inherit",env:{...process.env,ROSTER_INDEX_JSON:"/tmp/employee-roster-index.json"}});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "fix-unnamed-personnel-from-roster",
  {
    forgeEnvironment: "production",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      TENANT_KEY,
      APPLY,
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
console.log(JSON.stringify({ taskArn, exitCode, apply: APPLY === "1", indexKey }, null, 2));
process.exit(exitCode === 0 ? 0 : 1);
