#!/usr/bin/env node
/**
 * ECS wrapper for diag-fix-walkthrough-voice.mjs
 *
 *   FORGE_ENV=production TENANT_KEYS=forge-platform APPLY=0 node scripts/run-ecs-diag-fix-walkthrough-voice.mjs
 *   FORGE_ENV=production TENANT_KEYS=forge-platform,producers-rice-mill APPLY=1 node scripts/run-ecs-diag-fix-walkthrough-voice.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const FORGE_ENV = process.env.FORGE_ENV === "development" ? "development" : "production";
const TENANT_KEYS = process.env.TENANT_KEYS || process.env.TENANT_KEY || "forge-platform";
const VOICE_ID = process.env.VOICE_ID || "Stephen";
const PROFILE_ID = process.env.VOICE_PROFILE_ID || "forge-male-conversational";
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const BUCKET =
  process.env.FORGE_IMPORTS_BUCKET ||
  (FORGE_ENV === "production"
    ? "forge-production-imports-511343547817-us-east-1"
    : "forge-development-imports-511343547817-us-east-1");
const script = "diag-fix-walkthrough-voice.mjs";
const key = `diag/walkthrough-voice/${new Date().toISOString().replace(/[:.]/g, "-")}/${script}`;
const local = path.resolve("scripts", script);

const up = spawnSync("aws", ["s3", "cp", local, `s3://${BUCKET}/${key}`], {
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
  `forge-${FORGE_ENV}-secrets-database`,
  "--query",
  "ARN",
]);

const evalCode = [
  `import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";`,
  `import { writeFileSync } from "node:fs";`,
  `import { spawnSync } from "node:child_process";`,
  `const bucket=${JSON.stringify(BUCKET)};`,
  `const key=${JSON.stringify(key)};`,
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));`,
  `writeFileSync("/tmp/${script}", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/${script}"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `diag-fix-walkthrough-voice-${APPLY === "1" ? "apply" : "dry"}`,
  {
    forgeEnvironment: FORGE_ENV,
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      TENANT_KEYS,
      VOICE_ID,
      VOICE_PROFILE_ID: PROFILE_ID,
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
try {
  const logs = awsText([
    "logs",
    "get-log-events",
    "--log-group-name",
    `/forge/${FORGE_ENV}/platform-api`,
    "--log-stream-name",
    `platform-api/platform-api/${taskId}`,
    "--limit",
    "200",
  ]);
  console.log(logs);
} catch (e) {
  console.error(String(e));
}
console.log(JSON.stringify({ cluster, taskArn, exitCode, TENANT_KEYS, VOICE_ID, APPLY }));
process.exit(typeof exitCode === "number" ? exitCode : 1);
