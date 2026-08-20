#!/usr/bin/env node
/**
 * Seed PRM form definitions + submissions from wave2-remaining freeze.
 *
 *   node scripts/run-ecs-seed-producers-forms-from-freeze.mjs
 *   APPLY=1 node scripts/run-ecs-seed-producers-forms-from-freeze.mjs
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

const prefix = `seed/forms-from-freeze/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/seed-producers-forms-from-freeze.mjs`;
const local = path.resolve("scripts/seed-producers-forms-from-freeze.mjs");

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
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:${JSON.stringify(IMPORTS_BUCKET)},Key:${JSON.stringify(key)}}));`,
  `writeFileSync("/tmp/seed-producers-forms-from-freeze.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/seed-producers-forms-from-freeze.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "seed-producers-forms-from-freeze",
  {
    forgeEnvironment: "production",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      TENANT_KEY,
      APPLY,
      FORMS_FREEZE_BUCKET:
        process.env.FORMS_FREEZE_BUCKET || "forge-production-imports-511343547817-us-east-1",
      FORMS_FREEZE_KEY:
        process.env.FORMS_FREEZE_KEY ||
        "seed/forms-from-freeze/source/wave2-remaining-payload.json",
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
process.exit(exitCode ?? 1);
