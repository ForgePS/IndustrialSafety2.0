#!/usr/bin/env node
/**
 * Producers P2 Phase 3 N3 — presigned download smoke (AWS CLI + Aurora check).
 *
 *   FORGE_P2_STORAGE_PRESIGN_SMOKE_AUTHORIZED=true \
 *     node scripts/ind11b-p2-run-storage-presign-smoke.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const EVID_DIR = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/03-storage");
const META_APPROVAL = path.join(EVID_DIR, "APPROVE-PRODUCERS-STORAGE-AURORA-METADATA.md");
const MAP_LOCAL =
  process.env.FORGE_P2_STORAGE_MAP?.trim() || path.join(EVID_DIR, "s3-map-staging-latest.json");
const STAGING = "0882c865-59c2-49a6-ab88-ce6ca89be30c";
const BUCKET_IMPORTS =
  process.env.FORGE_IND11B_IMPORTS_BUCKET || "forge-development-imports-511343547817-us-east-1";

function fail(msg, code = 2) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

function awsOk(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: true });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || args.join(" "));
  return r.stdout.trim();
}

if (process.env.FORGE_P2_STORAGE_PRESIGN_SMOKE_AUTHORIZED?.trim() !== "true") {
  fail("Refused: set FORGE_P2_STORAGE_PRESIGN_SMOKE_AUTHORIZED=true after N1/N2 green");
}
if (!fs.existsSync(META_APPROVAL)) fail(`N-package approval missing: ${META_APPROVAL}`);
if (!fs.existsSync(MAP_LOCAL)) fail(`Map missing: ${MAP_LOCAL}`);

const map = JSON.parse(fs.readFileSync(MAP_LOCAL, "utf8"));
if (!map?.ok || !Array.isArray(map.mappings)) fail("Bad map JSON");

function pick(pred, label) {
  const hit = map.mappings.find(pred);
  if (!hit) fail(`No mapping for category sample: ${label}`);
  return hit;
}

const samples = {
  certificates: pick((m) => String(m.category).toLowerCase().includes("cert"), "certificates"),
  equipment: pick((m) => String(m.category).toLowerCase().includes("equipment"), "equipment"),
  loto: pick(
    (m) =>
      String(m.category).toLowerCase().includes("loto") ||
      String(m.sourcePath).toLowerCase().includes("/loto/"),
    "loto",
  ),
};

const downloadResults = [];
for (const [label, m] of Object.entries(samples)) {
  const headRaw = awsOk([
    "s3api",
    "head-object",
    "--bucket",
    m.destBucket,
    "--key",
    m.s3Key,
    "--output",
    "json",
  ]);
  const head = JSON.parse(headRaw);
  const url = awsOk(["s3", "presign", `s3://${m.destBucket}/${m.s3Key}`, "--expires-in", "300"]);
  const res = await fetch(url, { method: "GET" });
  const buf = Buffer.from(await res.arrayBuffer());
  downloadResults.push({
    label,
    sourcePath: m.sourcePath,
    category: m.category,
    documentId: m.documentId,
    versionId: m.versionId,
    s3Key: m.s3Key,
    destBucket: m.destBucket,
    mapSize: m.size,
    headContentLength: Number(head.ContentLength ?? 0),
    headETag: head.ETag || null,
    headContentType: head.ContentType || null,
    httpStatus: res.status,
    downloadedBytes: buf.length,
    sizeMatch: Number(head.ContentLength ?? 0) === Number(m.size ?? -1),
    httpOk: res.status === 200 && buf.length > 0,
    presignExpiresSeconds: 300,
  });
}

const checkScript = `import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire("@aws-sdk/client-secrets-manager");
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;
const tenantId = ${JSON.stringify(STAGING)};
const versionIds = ${JSON.stringify(Object.values(samples).map((s) => s.versionId))};
const arn = process.env.DATABASE_SECRET_ARN;
const sm = new SecretsManagerClient({ region: "us-east-1" });
const secret = JSON.parse((await sm.send(new GetSecretValueCommand({ SecretId: arn }))).SecretString);
const url = \`postgresql://\${encodeURIComponent(secret.username)}:\${encodeURIComponent(secret.password)}@\${secret.host ?? secret.hostname}:\${Number(secret.port ?? 5432)}/\${secret.dbname ?? secret.database}\`;
const sql = postgres(url, { max: 1 });
try {
  const rows = await sql\`
    select v.id::text as version_id, v.document_id::text as document_id, v.filename,
      v.storage_bucket, v.storage_key, v.availability_status, v.scan_status, v.content_length,
      d.category, d.name
    from platform_document_versions v
    join platform_documents d on d.id = v.document_id
    where v.tenant_id = \${tenantId}::uuid and v.id = any(\${versionIds}::uuid[])
  \`;
  console.log(JSON.stringify({ ok: true, phase: "PRODUCERS-P2-presign-aurora-check", rows }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
`;

const PREFIX = `ind11b/p2-presign-smoke/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${PREFIX}/aurora-check.mjs`;
const localTmp = path.join(EVID_DIR, ".aurora-check-tmp.mjs");
fs.writeFileSync(localTmp, checkScript);
const up = spawnSync("aws", ["s3", "cp", localTmp, `s3://${BUCKET_IMPORTS}/${key}`], {
  encoding: "utf8",
  shell: true,
});
fs.unlinkSync(localTmp);
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
  `const bucket=${JSON.stringify(BUCKET_IMPORTS)};`,
  `const key=${JSON.stringify(key)};`,
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));`,
  `writeFileSync("/tmp/aurora-check.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/aurora-check.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "p2-presign-aurora-check",
  { environment: { DATABASE_SECRET_ARN: adminSecretArn } },
);
spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
  timeout: 600_000,
});
const desc = awsJson(["ecs", "describe-tasks", "--cluster", cluster, "--tasks", taskArn]);
const exitCode = desc.tasks?.[0]?.containers?.[0]?.exitCode;
const taskId = taskArn.split("/").pop();
const logs = awsJson([
  "logs",
  "filter-log-events",
  "--log-group-name",
  "/forge/development/platform-api",
  "--log-stream-names",
  `platform-api/platform-api/${taskId}`,
  "--limit",
  "2000",
]);
const msg = (logs.events || []).map((e) => e.message).join("\n");
let aurora = null;
const marker = '"phase": "PRODUCERS-P2-presign-aurora-check"';
const idx = msg.lastIndexOf(marker);
if (idx >= 0) {
  const brace = msg.lastIndexOf("{", idx);
  for (let end = msg.length; end > brace + 10; end--) {
    try {
      const candidate = JSON.parse(msg.slice(brace, end));
      if (candidate?.phase === "PRODUCERS-P2-presign-aurora-check") {
        aurora = candidate;
        break;
      }
    } catch {
      /* shrink */
    }
  }
}

const allHttpOk = downloadResults.every((r) => r.httpOk && r.sizeMatch);
const auroraOk =
  exitCode === 0 &&
  aurora?.ok === true &&
  Array.isArray(aurora.rows) &&
  aurora.rows.length === 3 &&
  aurora.rows.every((r) => r.availability_status === "AVAILABLE" && r.scan_status === "CLEAN");

const evidence = {
  ok: allHttpOk && auroraOk,
  phase: "PRODUCERS-P2-storage-presign-smoke",
  at: new Date().toISOString(),
  tenantId: STAGING,
  downloads: downloadResults,
  auroraCheck: { exitCode, taskArn, result: aurora },
};
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.join(EVID_DIR, `presign-smoke-${stamp}.json`);
const latest = path.join(EVID_DIR, "presign-smoke.json");
fs.writeFileSync(out, JSON.stringify(evidence, null, 2));
fs.writeFileSync(latest, JSON.stringify(evidence, null, 2));
console.log(
  JSON.stringify(
    {
      written: out,
      ok: evidence.ok,
      downloads: downloadResults.map((d) => ({
        label: d.label,
        httpStatus: d.httpStatus,
        sizeMatch: d.sizeMatch,
        mapSize: d.mapSize,
        downloadedBytes: d.downloadedBytes,
      })),
      auroraRows: aurora?.rows?.map((r) => ({
        version_id: r.version_id,
        availability_status: r.availability_status,
        scan_status: r.scan_status,
        category: r.category,
      })),
    },
    null,
    2,
  ),
);
if (!evidence.ok) process.exit(1);
