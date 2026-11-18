#!/usr/bin/env node
/**
 * Phase 4 R1 — run one remapped wave loader against producers-rice-mill-staging via ECS.
 *
 *   FORGE_P2_PHASE4_LOAD_AUTHORIZED=true \
 *   FORGE_P2_PHASE4_WAVE=wave1 \
 *     node scripts/ind11b-p2-phase4-run-staging-wave.mjs
 *
 * Reads freeze manifest from evidence/p2/04-parity/extract-freeze-manifest-latest.json
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

const waveId = (process.env.FORGE_P2_PHASE4_WAVE || "").trim();
if (!waveId) fail("FORGE_P2_PHASE4_WAVE required (e.g. wave1)");

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const wave = (manifest.waves || []).find((w) => w.id === waveId);
if (!wave) fail(`Wave ${waveId} not in freeze manifest`);

const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(wave.loaderUri);
if (!match) fail(`Bad loaderUri ${wave.loaderUri}`);
const bucket = match[1];
const loaderKey = match[2];

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
  `const key=${JSON.stringify(loaderKey)};`,
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));`,
  `writeFileSync("/tmp/p4-wave-loader.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/p4-wave-loader.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `ind11b-p4-staging-${waveId}`,
  {
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      FORGE_IND11B_DEV_LOAD_AUTHORIZED: "true",
      FORGE_IND11B_ENVIRONMENT: "development",
      FORGE_IND11B_LOAD_MODE: "NONPRODUCTION_LOAD",
      FORGE_IND11B_PAYLOAD_S3_URI: wave.payloadUri,
    },
  },
);

spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
  timeout: 1_800_000,
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
    "120",
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
  wave: waveId,
  taskArn,
  exitCode,
  payloadUri: wave.payloadUri,
  loaderUri: wave.loaderUri,
  remappedSha256: wave.remappedSha256,
  logExcerpt: String(logs).slice(0, 40000),
};
const out = path.join(EVID_DIR, `load-${waveId}-result.json`);
fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
fs.writeFileSync(
  path.join(EVID_DIR, `load-${waveId}-result-latest.json`),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(JSON.stringify(evidence, null, 2));
process.exit(exitCode === 0 ? 0 : 1);
