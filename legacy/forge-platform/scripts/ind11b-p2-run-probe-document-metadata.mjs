#!/usr/bin/env node
/**
 * Run read-only document metadata probe via ECS one-off (S3 bootstrap).
 *
 *   node scripts/ind11b-p2-run-probe-document-metadata.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const BUCKET =
  process.env.FORGE_IND11B_IMPORTS_BUCKET || "forge-development-imports-511343547817-us-east-1";
const PREFIX = `ind11b/p2-doc-probe/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${PREFIX}/probe-document-metadata.mjs`;
const local = path.resolve("scripts/ind11b-p2-probe-document-metadata.mjs");
const EVID_DIR = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/03-storage");

function fail(msg, code = 2) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

if (!fs.existsSync(local)) fail(`Missing ${local}`);

const up = spawnSync("aws", ["s3", "cp", local, `s3://${BUCKET}/${key}`], {
  encoding: "utf8",
  shell: true,
});
if (up.status !== 0) fail(up.stderr || up.stdout || "s3 cp failed");

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
  `writeFileSync("/tmp/probe-docs.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/probe-docs.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "p2-probe-document-metadata",
  { environment: { DATABASE_SECRET_ARN: adminSecretArn } },
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
    "200",
    "--query",
    "events[*].message",
    "--output",
    "text",
  ]);
} catch (e) {
  logs = String(e.message || e);
}

let parsed = null;
const chunks = String(logs).split(/\t|\n/).filter(Boolean);
const blob = chunks.join("\n");
const start = blob.lastIndexOf('"phase": "PRODUCERS-P2-storage-aurora-probe"');
if (start >= 0) {
  const brace = blob.lastIndexOf("{", start);
  if (brace >= 0) {
    for (let end = blob.length; end > brace; end--) {
      try {
        parsed = JSON.parse(blob.slice(brace, end));
        if (parsed?.phase === "PRODUCERS-P2-storage-aurora-probe") break;
        parsed = null;
      } catch {
        /* keep shrinking */
      }
    }
  }
}
if (!parsed) {
  try {
    // CloudWatch --output text may flatten; try raw regenerate from events JSON
    const j = awsJson([
      "logs",
      "get-log-events",
      "--log-group-name",
      "/forge/development/platform-api",
      "--log-stream-name",
      `platform-api/platform-api/${taskId}`,
      "--limit",
      "200",
    ]);
    const msg = (j.events || []).map((e) => e.message).join("\n");
    const m = msg.match(/\{[\s\S]*"phase"\s*:\s*"PRODUCERS-P2-storage-aurora-probe"[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch (e) {
    console.error(JSON.stringify({ parseError: String(e) }));
  }
}

fs.mkdirSync(EVID_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = path.join(EVID_DIR, `aurora-document-probe-${stamp}.json`);
const latest = path.join(EVID_DIR, "aurora-document-probe-latest.json");
const evidence = {
  ok: exitCode === 0 && parsed?.ok === true,
  at: new Date().toISOString(),
  cluster,
  taskArn,
  exitCode,
  s3Script: `s3://${BUCKET}/${key}`,
  result: parsed,
  logTail: String(logs).slice(-12000),
};
fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
fs.writeFileSync(latest, JSON.stringify(evidence, null, 2));
console.log(
  JSON.stringify(
    {
      written: outPath,
      exitCode,
      ok: evidence.ok,
      summary: parsed && {
        tables: parsed.tables,
        staging: parsed.staging,
        tenantA: {
          platform_documents: parsed.tenantA?.platform_documents,
          versions_by_status: parsed.tenantA?.versions_by_status,
          equipment_doc_links: parsed.tenantA?.equipment_doc_links,
        },
        prodTwin: {
          platform_documents: parsed.prodTwin?.platform_documents,
          versions_by_status: parsed.prodTwin?.versions_by_status,
        },
      },
    },
    null,
    2,
  ),
);
if (!evidence.ok) process.exit(1);
