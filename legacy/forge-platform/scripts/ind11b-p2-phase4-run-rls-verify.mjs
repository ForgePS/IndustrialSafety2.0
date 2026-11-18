#!/usr/bin/env node
/**
 * Phase 4 R3 — orchestrate RLS isolation verify via ECS (forge_app; no admin secret).
 *
 *   FORGE_P2_PHASE4_LOAD_AUTHORIZED=true \
 *     node scripts/ind11b-p2-phase4-run-rls-verify.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const EVID_DIR = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/04-parity");
const APPROVAL = path.join(EVID_DIR, "APPROVE-PRODUCERS-PHASE4-LOAD.md");
const LOADER_LOCAL = path.resolve("scripts/ind11b-p2-phase4-rls-ecs-loader.mjs");
const BUCKET =
  process.env.FORGE_IND11B_IMPORTS_BUCKET || "forge-development-imports-511343547817-us-east-1";
const PREFIX = `ind11b/p4-rls/${new Date().toISOString().replace(/[:.]/g, "-")}`;

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
if (!fs.existsSync(LOADER_LOCAL)) fail(`Loader missing: ${LOADER_LOCAL}`);

const loaderKey = `${PREFIX}/rls-ecs-loader.mjs`;
{
  const up = spawnSync("aws", ["s3", "cp", LOADER_LOCAL, `s3://${BUCKET}/${loaderKey}`], {
    encoding: "utf8",
    shell: true,
  });
  if (up.status !== 0) fail(up.stderr || up.stdout || "s3 cp failed");
}

const evalCode = [
  `import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";`,
  `import { writeFileSync } from "node:fs";`,
  `import { spawnSync } from "node:child_process";`,
  `const bucket=${JSON.stringify(BUCKET)};`,
  `const key=${JSON.stringify(loaderKey)};`,
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));`,
  `writeFileSync("/tmp/p4-rls.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/p4-rls.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "ind11b-p4-rls-verify",
  {
    environment: {
      DATABASE_SECRET_ARN: awsText([
        "secretsmanager",
        "describe-secret",
        "--secret-id",
        "forge-development-secrets-database-app",
        "--query",
        "ARN",
      ]),
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

let parsed = null;
try {
  const m = String(logs).match(/\{[\s\S]*"phase"\s*:\s*"PRODUCERS-P4-R3-rls"[\s\S]*\}/);
  if (m) parsed = JSON.parse(m[0].replace(/\t/g, ""));
} catch {
  parsed = null;
}

const evidence = {
  ok: exitCode === 0 && (parsed?.ok ?? false),
  at: new Date().toISOString(),
  taskArn,
  exitCode,
  loaderUri: `s3://${BUCKET}/${loaderKey}`,
  result: parsed,
  logExcerpt: String(logs).slice(0, 40000),
};
fs.mkdirSync(EVID_DIR, { recursive: true });
fs.writeFileSync(
  path.join(EVID_DIR, "rls-isolation-result.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(EVID_DIR, "rls-isolation-result-latest.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(JSON.stringify(evidence, null, 2));
process.exit(evidence.ok ? 0 : 1);
