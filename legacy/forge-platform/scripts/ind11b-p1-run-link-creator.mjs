#!/usr/bin/env node
/**
 * Run creator→tenant-A Cognito link as platform-api ECS one-off.
 *
 *   FORGE_P1_LINK_COGNITO_SUB=<sub> node scripts/ind11b-p1-run-link-creator.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const COGNITO_SUB = (process.env.FORGE_P1_LINK_COGNITO_SUB ?? "").trim();
if (!COGNITO_SUB) {
  console.error("FORGE_P1_LINK_COGNITO_SUB is required");
  process.exit(2);
}
const EMAIL = (process.env.FORGE_P1_LINK_EMAIL ?? "admin@forgepublicsafety.com").trim();

const BUCKET =
  process.env.FORGE_IND11B_IMPORTS_BUCKET || "forge-development-imports-511343547817-us-east-1";
const PREFIX = `ind11b/p1-link/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${PREFIX}/link-creator-tenant-a.mjs`;
const local = path.resolve("scripts/ind11b-p1-link-creator-tenant-a.mjs");

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
  "forge-development-secrets-database",
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
  `writeFileSync("/tmp/ind11b-p1-link.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/ind11b-p1-link.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "ind11b-p1-link-creator",
  {
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      IMPORT_ACCEPTANCE_TENANT_A_ID: "019faa15-e558-70b6-adcd-a510c3c995f4",
      FORGE_P1_LINK_EMAIL: EMAIL,
      FORGE_P1_LINK_COGNITO_SUB: COGNITO_SUB,
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
    "/forge/development/platform-api",
    "--log-stream-name",
    `platform-api/platform-api/${taskId}`,
    "--limit",
    "100",
    "--query",
    "events[*].message",
    "--output",
    "text",
  ]);
} catch (e) {
  logs = String(e.message || e);
}

const evidence = {
  ok: exitCode === 0,
  at: new Date().toISOString(),
  taskArn,
  exitCode,
  email: EMAIL,
  cognitoSub: COGNITO_SUB,
  logExcerpt: String(logs).slice(0, 12000),
};
fs.writeFileSync(
  "docs/program/industrial-migration/ind-11/evidence/wave1/p1-link-creator-result.json",
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(JSON.stringify(evidence, null, 2));
process.exit(exitCode === 0 ? 0 : 1);
