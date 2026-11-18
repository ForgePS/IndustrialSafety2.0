#!/usr/bin/env node
/**
 * Diag personnel availability for producers-rice-mill in production.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";

const prefix = `diag/personnel-avail/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/diag-personnel-availability.mjs`;
const local = path.resolve("scripts/diag-personnel-availability.mjs");

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
  `writeFileSync("/tmp/diag-personnel-availability.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/diag-personnel-availability.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "diag-personnel-avail",
  {
    forgeEnvironment: "production",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
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
      "80",
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
