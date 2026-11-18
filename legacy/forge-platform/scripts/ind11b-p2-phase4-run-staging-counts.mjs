#!/usr/bin/env node
/**
 * Phase 4 R2 — staging domain row counts after load.
 *
 *   FORGE_P2_PHASE4_LOAD_AUTHORIZED=true \
 *     node scripts/ind11b-p2-phase4-run-staging-counts.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const EVID_DIR = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/04-parity");
const APPROVAL = path.join(EVID_DIR, "APPROVE-PRODUCERS-PHASE4-LOAD.md");
const MANIFEST = path.join(EVID_DIR, "extract-freeze-manifest-latest.json");

function fail(msg, code = 2) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

if (process.env.FORGE_P2_PHASE4_LOAD_AUTHORIZED?.trim() !== "true") {
  fail("Refused: set FORGE_P2_PHASE4_LOAD_AUTHORIZED=true");
}
if (!fs.existsSync(APPROVAL)) fail(`Approval missing: ${APPROVAL}`);
{
  const t = fs.readFileSync(APPROVAL, "utf8");
  if (!/\*\*Status:\*\*\s*SIGNED/i.test(t) || !/AUTHORIZED/i.test(t)) {
    fail("Approval not SIGNED / AUTHORIZED");
  }
}
if (!fs.existsSync(MANIFEST)) fail(`Freeze manifest missing: ${MANIFEST}`);

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const uri = manifest.completionCountsUri;
const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri || "");
if (!match) fail(`Bad completionCountsUri ${uri}`);
const bucket = match[1];
const key = match[2];

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
  `const bucket=${JSON.stringify(bucket)};`,
  `const key=${JSON.stringify(key)};`,
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));`,
  `writeFileSync("/tmp/p4-counts.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/p4-counts.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "ind11b-p4-staging-counts",
  {
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
  logs = awsText([
    "logs",
    "get-log-events",
    "--log-group-name",
    "/forge/development/platform-api",
    "--log-stream-name",
    `platform-api/platform-api/${taskId}`,
    "--limit",
    "80",
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
  countsUri: uri,
  logExcerpt: String(logs).slice(0, 20000),
};
fs.writeFileSync(
  path.join(EVID_DIR, "parity-counts-result.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(EVID_DIR, "parity-counts-result-latest.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(JSON.stringify(evidence, null, 2));
process.exit(exitCode === 0 ? 0 : 1);
