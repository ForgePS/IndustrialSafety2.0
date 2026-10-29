#!/usr/bin/env node
/**
 * Orchestrate M4 prod-twin remount via ECS (platform-api has AWS SDK).
 *
 *   FORGE_P2_STORAGE_PROD_TWIN_REMOUNT_AUTHORIZED=true \
 *     node scripts/ind11b-p2-run-storage-s3-remount-prod-twin-ecs.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const EVID_DIR = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/03-storage");
const APPROVAL = path.join(EVID_DIR, "APPROVE-PRODUCERS-STORAGE-COPY-PROD-TWIN.md");
const MAP_LOCAL =
  process.env.FORGE_P2_STORAGE_MAP?.trim() || path.join(EVID_DIR, "s3-map-staging-latest.json");
const LOADER_LOCAL = path.resolve("scripts/ind11b-p2-run-storage-s3-remount-prod-twin.mjs");
const BUCKET =
  process.env.FORGE_IND11B_IMPORTS_BUCKET || "forge-development-imports-511343547817-us-east-1";
const PREFIX = `ind11b/p2-remount-prod-twin/${new Date().toISOString().replace(/[:.]/g, "-")}`;

function fail(msg, code = 2) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

if (process.env.FORGE_P2_STORAGE_PROD_TWIN_REMOUNT_AUTHORIZED?.trim() !== "true") {
  fail("Refused: set FORGE_P2_STORAGE_PROD_TWIN_REMOUNT_AUTHORIZED=true");
}
if (!fs.existsSync(APPROVAL)) fail(`Approval missing: ${APPROVAL}`);
{
  const t = fs.readFileSync(APPROVAL, "utf8");
  if (!/\*\*Status:\*\*\s*SIGNED/i.test(t) || !/AUTHORIZED/i.test(t)) {
    fail("Prod-twin remount approval not SIGNED / AUTHORIZED");
  }
}
if (!fs.existsSync(MAP_LOCAL)) fail(`Map missing: ${MAP_LOCAL}`);
if (!fs.existsSync(LOADER_LOCAL)) fail(`Loader missing: ${LOADER_LOCAL}`);

const mapKey = `${PREFIX}/s3-map-staging.json`;
const loaderKey = `${PREFIX}/remount-prod-twin.mjs`;
const approvalKey = `${PREFIX}/APPROVE-PRODUCERS-STORAGE-COPY-PROD-TWIN.md`;
const avKey = `${PREFIX}/av-approach-decision.md`;
const avLocal = path.join(EVID_DIR, "av-approach-decision.md");

for (const [local, key] of [
  [MAP_LOCAL, mapKey],
  [LOADER_LOCAL, loaderKey],
  [APPROVAL, approvalKey],
  [avLocal, avKey],
]) {
  const up = spawnSync("aws", ["s3", "cp", local, `s3://${BUCKET}/${key}`], {
    encoding: "utf8",
    shell: true,
  });
  if (up.status !== 0) fail(up.stderr || up.stdout || `s3 cp failed for ${key}`);
}

// Patch loader paths for ECS: read map from /tmp, write evidence to /tmp then we pull logs/result via S3 out
const loaderBody = fs.readFileSync(LOADER_LOCAL, "utf8");
const ecsLoader = `#!/usr/bin/env node
import fs from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire("/app/apps/platform-api/package.json");
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = new S3Client({});
async function getText(bucket, key) {
  const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return await r.Body.transformToString("utf8");
}
const BUCKET = ${JSON.stringify(BUCKET)};
const MAP_KEY = ${JSON.stringify(mapKey)};
const APPROVAL_KEY = ${JSON.stringify(approvalKey)};
const AV_KEY = ${JSON.stringify(avKey)};
const OUT_PREFIX = ${JSON.stringify(PREFIX + "/out")};
const evid = "/tmp/p2-remount-evid";
fs.mkdirSync(evid, { recursive: true });
fs.writeFileSync(evid + "/s3-map-staging-latest.json", await getText(BUCKET, MAP_KEY));
fs.writeFileSync(evid + "/APPROVE-PRODUCERS-STORAGE-COPY-PROD-TWIN.md", await getText(BUCKET, APPROVAL_KEY));
fs.writeFileSync(evid + "/av-approach-decision.md", await getText(BUCKET, AV_KEY));
process.env.FORGE_P2_STORAGE_PROD_TWIN_REMOUNT_AUTHORIZED = "true";
process.env.FORGE_P2_STORAGE_MAP = evid + "/s3-map-staging-latest.json";
process.env.FORGE_P2_EVID_DIR = evid;
process.env.FORGE_P2_STORAGE_REMOUNT_CONCURRENCY = ${JSON.stringify(process.env.FORGE_P2_STORAGE_REMOUNT_CONCURRENCY || "16")};
${process.env.FORGE_P2_STORAGE_REMOUNT_LIMIT ? `process.env.FORGE_P2_STORAGE_REMOUNT_LIMIT = ${JSON.stringify(process.env.FORGE_P2_STORAGE_REMOUNT_LIMIT)};` : ""}
fs.writeFileSync("/tmp/remount-inner.mjs", ${JSON.stringify(loaderBody)});
const run = spawnSync(process.execPath, ["/tmp/remount-inner.mjs"], { stdio: "inherit", env: process.env, cwd: "/app" });
for (const name of fs.readdirSync(evid)) {
  if (!name.startsWith("s3-remount-prod-twin")) continue;
  const body = fs.readFileSync(evid + "/" + name);
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: OUT_PREFIX + "/" + name, Body: body, ContentType: "application/json" }));
  console.log(JSON.stringify({ uploaded: "s3://" + BUCKET + "/" + OUT_PREFIX + "/" + name }));
}
process.exit(run.status ?? 1);
`;

const ecsKey = `${PREFIX}/ecs-bootstrap.mjs`;
const ecsLocal = path.join(EVID_DIR, ".ecs-remount-bootstrap.mjs");
fs.writeFileSync(ecsLocal, ecsLoader);
const upBoot = spawnSync("aws", ["s3", "cp", ecsLocal, `s3://${BUCKET}/${ecsKey}`], {
  encoding: "utf8",
  shell: true,
});
fs.unlinkSync(ecsLocal);
if (upBoot.status !== 0) fail(upBoot.stderr || upBoot.stdout || "bootstrap upload failed");

const evalCode = [
  `import { createRequire } from "node:module";`,
  `import { writeFileSync } from "node:fs";`,
  `import { spawnSync } from "node:child_process";`,
  `const require = createRequire("/app/apps/platform-api/package.json");`,
  `const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");`,
  `const bucket=${JSON.stringify(BUCKET)};`,
  `const key=${JSON.stringify(ecsKey)};`,
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));`,
  `writeFileSync("/tmp/ecs-remount-boot.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/ecs-remount-boot.mjs"],{stdio:"inherit",env:process.env,cwd:"/app"});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "p2-remount-prod-twin",
  { environment: {} },
);

spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
  timeout: 3_600_000,
});

const desc = awsJson(["ecs", "describe-tasks", "--cluster", cluster, "--tasks", taskArn]);
const exitCode = desc.tasks?.[0]?.containers?.[0]?.exitCode;
const taskId = taskArn.split("/").pop();

// Pull artifacts
const outPrefix = `${PREFIX}/out/`;
const listed = awsJson(["s3api", "list-objects-v2", "--bucket", BUCKET, "--prefix", outPrefix]);
const downloaded = [];
for (const obj of listed.Contents || []) {
  const base = path.basename(obj.Key);
  const dest = path.join(EVID_DIR, base);
  const dl = spawnSync("aws", ["s3", "cp", `s3://${BUCKET}/${obj.Key}`, dest], {
    encoding: "utf8",
    shell: true,
  });
  if (dl.status === 0) downloaded.push(dest);
}

let result = null;
const latest = path.join(EVID_DIR, "s3-remount-prod-twin-result.json");
if (fs.existsSync(latest)) {
  result = JSON.parse(fs.readFileSync(latest, "utf8"));
}

const logs = awsJson([
  "logs",
  "filter-log-events",
  "--log-group-name",
  "/forge/development/platform-api",
  "--log-stream-names",
  `platform-api/platform-api/${taskId}`,
  "--limit",
  "5000",
]);
const msg = (logs.events || []).map((e) => e.message).join("\n");

const summary = {
  ok: exitCode === 0 && result?.ok === true,
  at: new Date().toISOString(),
  cluster,
  taskArn,
  exitCode,
  downloaded,
  resultCounts: result?.counts || null,
  reconcile: fs.existsSync(path.join(EVID_DIR, "s3-remount-prod-twin-reconcile.json"))
    ? JSON.parse(
        fs.readFileSync(path.join(EVID_DIR, "s3-remount-prod-twin-reconcile.json"), "utf8"),
      )
    : null,
  logTail: msg.slice(-8000),
};
fs.writeFileSync(
  path.join(EVID_DIR, "s3-remount-prod-twin-orchestrator.json"),
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exit(1);
