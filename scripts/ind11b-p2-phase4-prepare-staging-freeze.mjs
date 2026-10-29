#!/usr/bin/env node
/**
 * Phase 4 Q2/Q3 — remap prior Producers S3 freeze payloads onto staging tenant.
 *
 * Source: uncapped IND-11B wave1–3 payloads (Tenant A target) already in imports bucket.
 * Produces: remapped payloads + NAMESPACE-patched ECS loaders under ind11b/p4-staging/<ts>/.
 *
 *   FORGE_P2_PHASE4_LOAD_AUTHORIZED=true node scripts/ind11b-p2-phase4-prepare-staging-freeze.mjs
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BUSINESS_ID = "business-1782553339499";
const TENANT_A = "019faa15-e558-70b6-adcd-a510c3c995f4";
const STAGING_TENANT = "0882c865-59c2-49a6-ab88-ce6ca89be30c";
const STAGING_KEY = "producers-rice-mill-staging";
const BUCKET =
  process.env.FORGE_IND11B_IMPORTS_BUCKET || "forge-development-imports-511343547817-us-east-1";
const LOCAL_SRC = path.resolve(".tmp-p4/s3");
const EVID_DIR = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/04-parity");
const APPROVAL = path.join(EVID_DIR, "APPROVE-PRODUCERS-PHASE4-LOAD.md");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const PREFIX = `ind11b/p4-staging/${stamp}`;
const OUT_DIR = path.resolve(`.tmp-p4/p4-staging-${stamp}`);

function fail(msg, code = 2) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

if (process.env.FORGE_P2_PHASE4_LOAD_AUTHORIZED?.trim() !== "true") {
  fail("Refused: set FORGE_P2_PHASE4_LOAD_AUTHORIZED=true after signing Phase 4 load approval");
}
if (!fs.existsSync(APPROVAL)) fail(`Approval missing: ${APPROVAL}`);
{
  const t = fs.readFileSync(APPROVAL, "utf8");
  if (!/\*\*Status:\*\*\s*SIGNED/i.test(t) || !/AUTHORIZED/i.test(t)) {
    fail("APPROVE-PRODUCERS-PHASE4-LOAD.md is not SIGNED / AUTHORIZED");
  }
}

const WAVES = [
  {
    id: "wave1",
    payloadLocal: "wave1-payload.json",
    loaderLocal: "wave1-ecs-loader.mjs",
    oldNs: "forge-ind11b-wave1-v1",
    newNs: "forge-ind11b-p4-staging-wave1-v1",
    sourceUri:
      "s3://forge-development-imports-511343547817-us-east-1/ind11b/wave1/2026-08-04T11-03-54-081Z/payload.json",
  },
  {
    id: "wave2a",
    payloadLocal: "wave2a-payload.json",
    loaderLocal: "wave2a-ecs-loader.mjs",
    oldNs: "forge-ind11b-wave2a-v1",
    newNs: "forge-ind11b-p4-staging-wave2a-v1",
    sourceUri:
      "s3://forge-development-imports-511343547817-us-east-1/ind11b/wave2a/2026-08-05T09-34-42-012Z/payload.json",
  },
  {
    id: "wave2-remaining",
    payloadLocal: "wave2rem-payload.json",
    loaderLocal: "wave2rem-ecs-loader.mjs",
    oldNs: "forge-ind11b-wave2-v1",
    newNs: "forge-ind11b-p4-staging-wave2-v1",
    sourceUri:
      "s3://forge-development-imports-511343547817-us-east-1/ind11b/wave2-remaining/2026-08-05T10-53-29-690Z/payload.json",
  },
  {
    id: "wave3-workbooks",
    payloadLocal: "wave3wb-payload.json",
    loaderLocal: "wave3wb-ecs-loader.mjs",
    oldNs: "forge-ind11b-wave3-v1",
    newNs: "forge-ind11b-p4-staging-wave3-v1",
    sourceUri:
      "s3://forge-development-imports-511343547817-us-east-1/ind11b/wave3-workbooks/2026-08-05T11-42-44-439Z/payload.json",
  },
  {
    id: "wave3-coord",
    payloadLocal: "wave3coord-payload.json",
    loaderLocal: "wave3coord-ecs-loader.mjs",
    oldNs: "forge-ind11b-wave3-v1",
    newNs: "forge-ind11b-p4-staging-wave3-v1",
    sourceUri:
      "s3://forge-development-imports-511343547817-us-east-1/ind11b/wave3-coord/2026-08-05T11-45-24-813Z/payload.json",
  },
  {
    id: "wave3-qr-docs",
    payloadLocal: "wave3qr-payload.json",
    loaderLocal: "wave3qr-ecs-loader.mjs",
    oldNs: "forge-ind11b-wave3-v1",
    newNs: "forge-ind11b-p4-staging-wave3-v1",
    sourceUri:
      "s3://forge-development-imports-511343547817-us-east-1/ind11b/wave3-qr-docs/2026-08-05T11-46-42-743Z/payload.json",
    stripControlledDocuments: true,
  },
];

function sha256File(filePath) {
  const h = createHash("sha256");
  h.update(fs.readFileSync(filePath));
  return h.digest("hex");
}

function countArrays(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) out[k] = v.length;
  }
  return out;
}

function remapTenantMappings(payload) {
  const mappings = Array.isArray(payload.tenantMappings) ? payload.tenantMappings : [];
  const remapped = mappings.map((m) => {
    const src = m.sourceOrganizationId || m.sourceBusinessId;
    if (src !== BUSINESS_ID && m.targetTenantId !== TENANT_A) {
      throw new Error(`Unexpected mapping ${JSON.stringify(m)}`);
    }
    return {
      ...m,
      sourceOrganizationId: BUSINESS_ID,
      targetTenantId: STAGING_TENANT,
      mappingStatus: "APPROVED",
      notes: `Phase4 remap from Tenant A ${TENANT_A} → staging ${STAGING_KEY}`,
    };
  });
  if (remapped.length === 0) {
    remapped.push({
      sourceOrganizationId: BUSINESS_ID,
      targetTenantId: STAGING_TENANT,
      mappingStatus: "APPROVED",
      notes: "Phase4 explicit mapping",
    });
  }
  return remapped;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(EVID_DIR, { recursive: true });

const waveManifest = [];

for (const wave of WAVES) {
  const srcPayload = path.join(LOCAL_SRC, wave.payloadLocal);
  const srcLoader = path.join(LOCAL_SRC, wave.loaderLocal);
  if (!fs.existsSync(srcPayload)) fail(`Missing local payload: ${srcPayload}`);
  if (!fs.existsSync(srcLoader)) fail(`Missing local loader: ${srcLoader}`);

  const payload = JSON.parse(fs.readFileSync(srcPayload, "utf8"));
  if (payload.environment !== "development" || payload.mode !== "NONPRODUCTION_LOAD") {
    fail(`Payload refused for ${wave.id}: bad environment/mode`);
  }

  const sourceSha = sha256File(srcPayload);
  payload.tenantMappings = remapTenantMappings(payload);
  payload.phase4 = {
    remappedAt: new Date().toISOString(),
    targetTenantId: STAGING_TENANT,
    targetTenantKey: STAGING_KEY,
    sourcePayloadUri: wave.sourceUri,
    sourcePayloadSha256: sourceSha,
    dressRehearsal: true,
    note: "Remapped prior Producers uncapped freeze; live Firebase re-extract deferred until tooling restored",
  };
  payload.migrationBatchId = `p4-staging-${wave.id}-${stamp}`;
  if (wave.stripControlledDocuments && Array.isArray(payload.controlledDocuments)) {
    payload.phase4.strippedControlledDocuments = payload.controlledDocuments.length;
    payload.controlledDocuments = [];
  }

  const outPayload = path.join(OUT_DIR, `${wave.id}-payload.json`);
  const outLoader = path.join(OUT_DIR, `${wave.id}-ecs-loader.mjs`);
  fs.writeFileSync(outPayload, `${JSON.stringify(payload)}\n`);

  let loaderText = fs.readFileSync(srcLoader, "utf8");
  if (!loaderText.includes(`const NAMESPACE = "${wave.oldNs}"`)) {
    fail(`Loader ${wave.loaderLocal} missing expected NAMESPACE ${wave.oldNs}`);
  }
  loaderText = loaderText.replaceAll(
    `const NAMESPACE = "${wave.oldNs}"`,
    `const NAMESPACE = "${wave.newNs}"`,
  );
  // Soft-label phase for CloudWatch readability
  loaderText = loaderText.replace(
    /\"phase\":\s*\"IND-11B-[^\"]+\"/,
    `"phase": "PRODUCERS-P4-${wave.id}"`,
  );
  fs.writeFileSync(outLoader, loaderText);

  const payloadKey = `${PREFIX}/${wave.id}/payload.json`;
  const loaderKey = `${PREFIX}/${wave.id}/ecs-loader.mjs`;
  for (const [local, key] of [
    [outPayload, payloadKey],
    [outLoader, loaderKey],
  ]) {
    const up = spawnSync("aws", ["s3", "cp", local, `s3://${BUCKET}/${key}`], {
      encoding: "utf8",
      shell: true,
    });
    if (up.status !== 0) fail(up.stderr || up.stdout || `s3 cp failed ${key}`);
  }

  const remappedSha = sha256File(outPayload);
  const counts = countArrays(payload);
  waveManifest.push({
    id: wave.id,
    namespace: wave.newNs,
    sourceUri: wave.sourceUri,
    sourceSha256: sourceSha,
    remappedSha256: remappedSha,
    payloadUri: `s3://${BUCKET}/${payloadKey}`,
    loaderUri: `s3://${BUCKET}/${loaderKey}`,
    counts,
    strippedControlledDocuments: payload.phase4.strippedControlledDocuments ?? 0,
  });
}

// Counts loader patched for staging
const countsSrc = path.join(LOCAL_SRC, "completion-counts.mjs");
let countsText = fs.readFileSync(countsSrc, "utf8");
if (!countsText.includes(TENANT_A)) fail("completion-counts.mjs missing Tenant A constant");
countsText = countsText.replaceAll(TENANT_A, STAGING_TENANT);
countsText = countsText.replace(
  /\"phase\":\s*\"IND-11B-completion-counts\"/,
  `"phase": "PRODUCERS-P4-completion-counts"`,
);
const countsLocal = path.join(OUT_DIR, "completion-counts.mjs");
fs.writeFileSync(countsLocal, countsText);
const countsKey = `${PREFIX}/completion-counts.mjs`;
{
  const up = spawnSync("aws", ["s3", "cp", countsLocal, `s3://${BUCKET}/${countsKey}`], {
    encoding: "utf8",
    shell: true,
  });
  if (up.status !== 0) fail(up.stderr || up.stdout || "s3 cp counts failed");
}

const tenantMapping = {
  ok: true,
  at: new Date().toISOString(),
  sourceBusinessId: BUSINESS_ID,
  firebaseProject: "forge-industrial-safety",
  target: {
    tenantKey: STAGING_KEY,
    tenantId: STAGING_TENANT,
  },
  explicitlyNot: {
    tenantKey: "import-acceptance-tenant-a",
    tenantId: TENANT_A,
  },
  status: "APPROVED",
  dressRehearsal: true,
};

const freezeManifest = {
  ok: true,
  phase: "PRODUCERS-P4-Q2-freeze",
  at: new Date().toISOString(),
  stamp,
  prefix: `s3://${BUCKET}/${PREFIX}`,
  method: "remap-prior-s3-wave-payloads",
  dressRehearsal: true,
  tenantMapping,
  waves: waveManifest,
  completionCountsUri: `s3://${BUCKET}/${countsKey}`,
  note: "Live Firebase re-extract deferred; freeze SHA provenance is remapped prior uncapped Producers payloads.",
};

fs.writeFileSync(
  path.join(EVID_DIR, "tenant-mapping-staging.json"),
  `${JSON.stringify(tenantMapping, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(EVID_DIR, "extract-freeze-manifest.json"),
  `${JSON.stringify(freezeManifest, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(EVID_DIR, "extract-freeze-manifest-latest.json"),
  `${JSON.stringify(freezeManifest, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(OUT_DIR, "manifest.json"),
  `${JSON.stringify(freezeManifest, null, 2)}\n`,
);

console.log(JSON.stringify(freezeManifest, null, 2));
