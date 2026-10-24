#!/usr/bin/env node
/**
 * Orchestrate Phase 3 N1/N2 Aurora document metadata upsert (staging).
 *
 * Dry-run (default):
 *   FORGE_P2_STORAGE_AURORA_METADATA_AUTHORIZED=true \
 *     node scripts/ind11b-p2-run-aurora-document-metadata.mjs
 *
 * Apply:
 *   FORGE_P2_STORAGE_AURORA_METADATA_AUTHORIZED=true \
 *   FORGE_P2_STORAGE_AURORA_METADATA_MODE=apply \
 *     node scripts/ind11b-p2-run-aurora-document-metadata.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const EVID_DIR = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/03-storage");
const APPROVAL = path.join(EVID_DIR, "APPROVE-PRODUCERS-STORAGE-AURORA-METADATA.md");
const MAP_LOCAL =
  process.env.FORGE_P2_STORAGE_MAP?.trim() || path.join(EVID_DIR, "s3-map-staging-latest.json");
const LOADER_LOCAL = path.resolve("scripts/ind11b-p2-aurora-document-metadata-ecs-loader.mjs");
const BUCKET =
  process.env.FORGE_IND11B_IMPORTS_BUCKET || "forge-development-imports-511343547817-us-east-1";
const PREFIX = `ind11b/p2-doc-meta/${new Date().toISOString().replace(/[:.]/g, "-")}`;

function fail(msg, code = 2) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

if (process.env.FORGE_P2_STORAGE_AURORA_METADATA_AUTHORIZED?.trim() !== "true") {
  fail(
    "Refused: set FORGE_P2_STORAGE_AURORA_METADATA_AUTHORIZED=true after signing APPROVE-PRODUCERS-STORAGE-AURORA-METADATA.md",
  );
}
if (!fs.existsSync(APPROVAL)) fail(`Approval missing: ${APPROVAL}`);
{
  const t = fs.readFileSync(APPROVAL, "utf8");
  if (!/\*\*Status:\*\*\s*SIGNED/i.test(t) || !/AUTHORIZED/i.test(t)) {
    fail("APPROVE-PRODUCERS-STORAGE-AURORA-METADATA.md is not SIGNED / AUTHORIZED");
  }
  if (!/APPROVED\s*\(electronic/i.test(t)) {
    fail("Approval missing Program Owner APPROVED (electronic...) mark");
  }
}
if (!fs.existsSync(MAP_LOCAL)) fail(`Map missing: ${MAP_LOCAL}`);
if (!fs.existsSync(LOADER_LOCAL)) fail(`Loader missing: ${LOADER_LOCAL}`);

const mode = (process.env.FORGE_P2_STORAGE_AURORA_METADATA_MODE || "dry-run").trim();
if (!["dry-run", "apply"].includes(mode)) fail(`Bad mode: ${mode}`);

const mapKey = `${PREFIX}/s3-map-staging.json`;
const loaderKey = `${PREFIX}/aurora-document-metadata-ecs-loader.mjs`;

for (const [local, key] of [
  [MAP_LOCAL, mapKey],
  [LOADER_LOCAL, loaderKey],
]) {
  const up = spawnSync("aws", ["s3", "cp", local, `s3://${BUCKET}/${key}`], {
    encoding: "utf8",
    shell: true,
  });
  if (up.status !== 0) fail(up.stderr || up.stdout || `s3 cp failed for ${key}`);
}

const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  "forge-development-secrets-database",
  "--query",
  "ARN",
]);

const mapUri = `s3://${BUCKET}/${mapKey}`;
const evalCode = [
  `import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";`,
  `import { writeFileSync } from "node:fs";`,
  `import { spawnSync } from "node:child_process";`,
  `const bucket=${JSON.stringify(BUCKET)};`,
  `const key=${JSON.stringify(loaderKey)};`,
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));`,
  `writeFileSync("/tmp/p2-doc-meta.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/p2-doc-meta.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const env = {
  DATABASE_SECRET_ARN: adminSecretArn,
  FORGE_P2_STORAGE_AURORA_METADATA_AUTHORIZED: "true",
  FORGE_P2_STORAGE_AURORA_METADATA_MODE: mode,
  FORGE_P2_DOC_MAP_S3_URI: mapUri,
  FORGE_P2_DOC_TENANT_ID: "0882c865-59c2-49a6-ab88-ce6ca89be30c",
};
if (process.env.FORGE_P2_DOC_LIMIT?.trim())
  env.FORGE_P2_DOC_LIMIT = process.env.FORGE_P2_DOC_LIMIT.trim();
if (process.env.FORGE_P2_DOC_OFFSET?.trim())
  env.FORGE_P2_DOC_OFFSET = process.env.FORGE_P2_DOC_OFFSET.trim();
if (process.env.FORGE_P2_DOC_BATCH?.trim())
  env.FORGE_P2_DOC_BATCH = process.env.FORGE_P2_DOC_BATCH.trim();

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `p2-aurora-doc-meta-${mode}`,
  { environment: env },
);

spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
  timeout: 1_800_000,
});

const desc = awsJson(["ecs", "describe-tasks", "--cluster", cluster, "--tasks", taskArn]);
const exitCode = desc.tasks?.[0]?.containers?.[0]?.exitCode;
const taskId = taskArn.split("/").pop();

const logJson = awsJson([
  "logs",
  "filter-log-events",
  "--log-group-name",
  "/forge/development/platform-api",
  "--log-stream-names",
  `platform-api/platform-api/${taskId}`,
  "--limit",
  "10000",
]);
const msg = (logJson.events || []).map((e) => e.message).join("\n");
let parsed = null;
const marker = '"phase": "PRODUCERS-P2-storage-aurora-metadata"';
const idx = msg.lastIndexOf(marker);
if (idx >= 0) {
  const brace = msg.lastIndexOf("{", idx);
  // parse from brace by expanding until JSON.parse succeeds
  for (let end = msg.length; end > brace + 10; end--) {
    try {
      const candidate = JSON.parse(msg.slice(brace, end));
      if (candidate?.phase === "PRODUCERS-P2-storage-aurora-metadata") {
        parsed = candidate;
        break;
      }
    } catch {
      /* shrink */
    }
  }
}

fs.mkdirSync(EVID_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = path.join(EVID_DIR, `aurora-document-metadata-${mode}-${stamp}.json`);
const latest = path.join(EVID_DIR, `aurora-document-metadata-${mode}-latest.json`);
const evidence = {
  ok: exitCode === 0 && parsed?.ok === true,
  at: new Date().toISOString(),
  mode,
  cluster,
  taskArn,
  exitCode,
  mapUri,
  loaderUri: `s3://${BUCKET}/${loaderKey}`,
  result: parsed,
  logTail: msg.slice(-12000),
};
fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
fs.writeFileSync(latest, JSON.stringify(evidence, null, 2));
if (mode === "apply" && evidence.ok) {
  fs.writeFileSync(
    path.join(EVID_DIR, "aurora-document-metadata-result.json"),
    JSON.stringify(evidence, null, 2),
  );
}
console.log(
  JSON.stringify(
    {
      written: outPath,
      exitCode,
      ok: evidence.ok,
      summary: parsed
        ? {
            mode: parsed.mode,
            planned: parsed.counts?.planned ?? parsed.slice?.planned,
            before: parsed.before,
            after: parsed.after,
            counts: parsed.counts,
            errorCount: parsed.errors?.length ?? parsed.counts?.error,
          }
        : null,
    },
    null,
    2,
  ),
);
if (!evidence.ok) process.exit(1);
