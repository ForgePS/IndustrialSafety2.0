#!/usr/bin/env node
/**
 * ECS one-off: link Cognito staging create results into Aurora.
 *
 *   node scripts/ind11b-p2-run-link-staging-roster.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const EVID = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/02-cognito");
const createResult = JSON.parse(
  fs.readFileSync(path.join(EVID, "cognito-create-staging-result.json"), "utf8"),
);
const users = createResult.users.filter((u) => u.ok && u.subject);
if (!users.length) {
  console.error("No successful Cognito create results to link");
  process.exit(2);
}

const BUCKET =
  process.env.FORGE_IND11B_IMPORTS_BUCKET || "forge-development-imports-511343547817-us-east-1";
const PREFIX = `ind11b/p2-cognito/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const scriptKey = `${PREFIX}/link-staging-roster.mjs`;
const payloadKey = `${PREFIX}/link-payload.json`;
const local = path.resolve("scripts/ind11b-p2-link-staging-roster.mjs");

const payload = users.map((u) => ({
  ok: true,
  email: u.email,
  subject: u.subject,
  roleCode: u.roleCode,
  firebaseUid: u.firebaseUid,
}));
const payloadPath = path.join(EVID, "link-staging-payload.json");
fs.writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`);

const upScript = spawnSync("aws", ["s3", "cp", local, `s3://${BUCKET}/${scriptKey}`], {
  encoding: "utf8",
  shell: true,
});
if (upScript.status !== 0) {
  console.error(upScript.stderr || upScript.stdout);
  process.exit(1);
}
const upPayload = spawnSync("aws", ["s3", "cp", payloadPath, `s3://${BUCKET}/${payloadKey}`], {
  encoding: "utf8",
  shell: true,
});
if (upPayload.status !== 0) {
  console.error(upPayload.stderr || upPayload.stdout);
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
  `const key=${JSON.stringify(scriptKey)};`,
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));`,
  `writeFileSync("/tmp/ind11b-p2-link-roster.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/ind11b-p2-link-roster.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "ind11b-p2-link-staging-roster",
  {
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      FORGE_P2_TARGET_TENANT_ID: "0882c865-59c2-49a6-ab88-ce6ca89be30c",
      FORGE_P2_LINK_PAYLOAD_S3_BUCKET: BUCKET,
      FORGE_P2_LINK_PAYLOAD_S3_KEY: payloadKey,
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
  linkedUsers: users.length,
  logExcerpt: String(logs).slice(0, 20000),
};
fs.writeFileSync(
  path.join(EVID, "link-staging-roster-result.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(JSON.stringify(evidence, null, 2));
process.exit(exitCode === 0 ? 0 : 1);
