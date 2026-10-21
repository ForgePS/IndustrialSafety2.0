#!/usr/bin/env node
/**
 * Run send-wc-weekly-status-to.mjs on production ECS.
 *   RECIPIENTS=you@example.com node scripts/run-ecs-send-wc-weekly-status-to.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const RECIPIENTS = (process.env.RECIPIENTS || "").trim();
if (!RECIPIENTS) throw new Error("RECIPIENTS is required");
const FORGE_ENV = process.env.FORGE_ENV?.trim() || "production";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP =
  process.env.FORGE_API_LOG_GROUP ||
  (FORGE_ENV === "production" ? "/forge/production/platform-api" : "/forge/development/platform-api");

const prefix = `ops/send-wc-weekly/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const scriptKey = `${prefix}/send-wc-weekly-status-to.mjs`;
const scriptLocal = path.resolve("scripts/send-wc-weekly-status-to.mjs");

const up = spawnSync("aws", ["s3", "cp", scriptLocal, `s3://${IMPORTS_BUCKET}/${scriptKey}`], {
  encoding: "utf8",
  shell: false,
});
if (up.status !== 0) {
  console.error(up.stderr || up.stdout);
  process.exit(1);
}
console.log(`Uploaded script -> s3://${IMPORTS_BUCKET}/${scriptKey}`);

const target = "/app/apps/platform-api/.send-wc-weekly-status-to.mjs";
const evalCode = [
  `import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";`,
  `import { writeFileSync } from "node:fs";`,
  `import { spawnSync } from "node:child_process";`,
  `const c=new S3Client({});`,
  `const script=await c.send(new GetObjectCommand({Bucket:${JSON.stringify(IMPORTS_BUCKET)},Key:${JSON.stringify(scriptKey)}}));`,
  `writeFileSync(${JSON.stringify(target)}, await script.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,[${JSON.stringify(target)}],{stdio:"inherit",env:process.env,cwd:"/app/apps/platform-api"});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "send-wc-weekly-status-to",
  {
    forgeEnvironment: FORGE_ENV,
    environment: { TENANT_KEY, RECIPIENTS },
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
    "200",
    "--query",
    "events[*].message",
    "--output",
    "text",
  ]);
} catch {
  logs = "(logs unavailable)";
}

console.log(JSON.stringify({ exitCode, logs }, null, 2));
process.exit(exitCode === 0 ? 0 : 1);
