#!/usr/bin/env node
/**
 * Producers P2 Phase 3 — copy Firebase Storage → S3 (staging tenant).
 *
 * Requires:
 *   FORGE_P2_STORAGE_COPY_AUTHORIZED=true
 *   FORGE_FIREBASE_RO_SERVICE_ACCOUNT_PATH=...
 *   Signed APPROVE-PRODUCERS-STORAGE-COPY.md
 *   AWS credentials with PutObject on documents bucket
 *
 *   node scripts/ind11b-p2-run-storage-s3-copy-staging.mjs
 *
 * Optional:
 *   FORGE_P2_STORAGE_COPY_CONCURRENCY=8
 *   FORGE_P2_STORAGE_COPY_LIMIT=N          (cap objects; omit = all)
 *   FORGE_P2_STORAGE_COPY_OFFSET=0
 *   FORGE_P2_STORAGE_MAP=path/to/s3-map-staging-latest.json
 *   FORGE_P2_STORAGE_COPY_SKIP_EXISTING=true  (skip if S3 size+etag/md5 match)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const BUSINESS_ID = "business-1782553339499";
const PROJECT_ID = "forge-industrial-safety";
const STAGING_TENANT = "0882c865-59c2-49a6-ab88-ce6ca89be30c";
const DEST_BUCKET = "forge-development-documents-511343547817-us-east-1";
const REGION = "us-east-1";
const EVID_DIR = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/03-storage");
const APPROVAL = path.join(EVID_DIR, "APPROVE-PRODUCERS-STORAGE-COPY.md");
const AV_DECISION = path.join(EVID_DIR, "av-approach-decision.md");

function fail(msg, code = 2) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

if (process.env.FORGE_P2_STORAGE_COPY_AUTHORIZED?.trim() !== "true") {
  fail(
    "Refused: set FORGE_P2_STORAGE_COPY_AUTHORIZED=true after signing APPROVE-PRODUCERS-STORAGE-COPY.md",
  );
}

if (!fs.existsSync(APPROVAL)) fail(`Approval missing: ${APPROVAL}`);
{
  const t = fs.readFileSync(APPROVAL, "utf8");
  if (!/\*\*Status:\*\*\s*SIGNED/i.test(t) || !/AUTHORIZED/i.test(t)) {
    fail("APPROVE-PRODUCERS-STORAGE-COPY.md is not SIGNED / AUTHORIZED");
  }
  if (!/APPROVED\s*\(electronic/i.test(t)) {
    fail("Copy approval missing Program Owner APPROVED (electronic...) mark");
  }
}
if (!fs.existsSync(AV_DECISION)) fail(`AV decision missing: ${AV_DECISION}`);
{
  const t = fs.readFileSync(AV_DECISION, "utf8");
  if (!/Option B/i.test(t) && !/waiver/i.test(t)) {
    fail("AV approach decision does not record waiver/scanner for copy");
  }
}

const saPath = process.env.FORGE_FIREBASE_RO_SERVICE_ACCOUNT_PATH?.trim();
if (!saPath) fail("FORGE_FIREBASE_RO_SERVICE_ACCOUNT_PATH required");
if (!fs.existsSync(saPath)) fail(`Service account file missing: ${saPath}`);

const concurrency = Math.max(
  1,
  Math.min(32, Number(process.env.FORGE_P2_STORAGE_COPY_CONCURRENCY || 8)),
);
const limitEnv = process.env.FORGE_P2_STORAGE_COPY_LIMIT?.trim();
const limit = limitEnv ? Math.max(0, Number(limitEnv)) : null;
const offset = Math.max(0, Number(process.env.FORGE_P2_STORAGE_COPY_OFFSET || 0));
const skipExisting = process.env.FORGE_P2_STORAGE_COPY_SKIP_EXISTING?.trim() !== "false";

const mapPath =
  process.env.FORGE_P2_STORAGE_MAP?.trim() || path.join(EVID_DIR, "s3-map-staging-latest.json");
if (!fs.existsSync(mapPath)) fail(`S3 map missing: ${mapPath}`);

const requireFromApi = createRequire(path.resolve(process.cwd(), "apps/platform-api/package.json"));
const requireFromMig = createRequire(
  path.resolve(process.cwd(), "packages/migration-firebase/package.json"),
);

let S3Client;
let PutObjectCommand;
let HeadObjectCommand;
let admin;
let getStorage;
try {
  ({ S3Client, PutObjectCommand, HeadObjectCommand } = requireFromApi("@aws-sdk/client-s3"));
} catch (e) {
  fail(`@aws-sdk/client-s3 unavailable via platform-api: ${e}`);
}
try {
  admin = requireFromMig("firebase-admin");
  getStorage = requireFromMig("firebase-admin/storage").getStorage;
} catch (e) {
  fail(`firebase-admin unavailable: ${e}`);
}

const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
const root = admin;
const appName = `p2-storage-copy-${Date.now()}`;
const certFn = root.credential?.cert ?? root.cert;
const app = root.initializeApp(
  {
    credential: certFn.call(root.credential ?? root, sa),
    projectId: PROJECT_ID,
    storageBucket: `${PROJECT_ID}.appspot.com`,
  },
  appName,
);

const s3 = new S3Client({ region: REGION });

function md5Base64ToHex(b64) {
  if (!b64 || typeof b64 !== "string") return null;
  try {
    return Buffer.from(b64, "base64").toString("hex");
  } catch {
    return null;
  }
}

async function resolveSourceBucket(storage) {
  const candidates = [`${PROJECT_ID}.firebasestorage.app`, `${PROJECT_ID}.appspot.com`];
  const errors = [];
  for (const name of candidates) {
    try {
      const bucket = storage.bucket(name);
      const [exists] = await bucket.exists();
      if (!exists) {
        errors.push(`${name}: missing`);
        continue;
      }
      await bucket.getFiles({ maxResults: 1, autoPaginate: false });
      return { bucket, bucketName: name };
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  fail(`No usable source bucket: ${errors.join(" | ")}`);
}

async function headOk(key) {
  try {
    const out = await s3.send(new HeadObjectCommand({ Bucket: DEST_BUCKET, Key: key }));
    return out;
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404 || err?.name === "NotFound" || err?.Code === "NotFound") {
      return null;
    }
    throw err;
  }
}

function asciiMeta(value, max = 256) {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, "_")
    .slice(0, max);
}

async function downloadBuffer(file) {
  const [buf] = await file.download();
  return buf;
}

async function copyOne(bucket, mapping) {
  const expectedMd5Hex = md5Base64ToHex(mapping.md5Hash);
  const existing = skipExisting ? await headOk(mapping.s3Key) : null;
  if (existing) {
    const sizeOk = Number(existing.ContentLength) === Number(mapping.size);
    const storedMd5 =
      existing.Metadata?.["forge-md5-hex"] ||
      Object.entries(existing.Metadata || {}).find(
        ([k]) => k.toLowerCase() === "forge-md5-hex",
      )?.[1];
    // Objects uploaded before metadata stamping (smoke) — size match is enough to skip rewrite.
    const md5Ok =
      !expectedMd5Hex ||
      !storedMd5 ||
      String(storedMd5).toLowerCase() === expectedMd5Hex.toLowerCase();
    if (sizeOk && md5Ok) {
      return {
        status: "skipped_existing",
        sourcePath: mapping.sourcePath,
        s3Key: mapping.s3Key,
        size: mapping.size,
        md5Hex: expectedMd5Hex || storedMd5 || null,
        etag: existing.ETag,
      };
    }
  }

  const file = bucket.file(mapping.sourcePath);
  const [exists] = await file.exists();
  if (!exists) {
    return {
      status: "error",
      sourcePath: mapping.sourcePath,
      s3Key: mapping.s3Key,
      error: "source object missing in Firebase Storage",
    };
  }

  const body = await downloadBuffer(file);
  const actualMd5Hex = crypto.createHash("md5").update(body).digest("hex");
  if (expectedMd5Hex && actualMd5Hex !== expectedMd5Hex.toLowerCase()) {
    return {
      status: "error",
      sourcePath: mapping.sourcePath,
      s3Key: mapping.s3Key,
      error: `source md5 mismatch inventory=${expectedMd5Hex} download=${actualMd5Hex}`,
    };
  }
  if (Number(mapping.size) !== body.length) {
    return {
      status: "error",
      sourcePath: mapping.sourcePath,
      s3Key: mapping.s3Key,
      error: `source size mismatch inventory=${mapping.size} download=${body.length}`,
    };
  }

  const put = await s3.send(
    new PutObjectCommand({
      Bucket: DEST_BUCKET,
      Key: mapping.s3Key,
      Body: body,
      ContentType: mapping.contentType || "application/octet-stream",
      ContentMD5: mapping.md5Hash || Buffer.from(actualMd5Hex, "hex").toString("base64"),
      Metadata: {
        "forge-source-path": asciiMeta(mapping.sourcePath, 1024),
        "forge-firebase-business": asciiMeta(BUSINESS_ID),
        "forge-document-id": asciiMeta(mapping.documentId),
        "forge-version-id": asciiMeta(mapping.versionId),
        "forge-category": asciiMeta(mapping.category || "other"),
        "forge-migration": "producers-p2-phase3",
        "forge-md5-hex": actualMd5Hex,
      },
    }),
  );

  // Bucket encryption makes ETag != MD5; ContentMD5 on PutObject is the integrity check.
  const head = await headOk(mapping.s3Key);
  if (!head || Number(head.ContentLength) !== body.length) {
    return {
      status: "error",
      sourcePath: mapping.sourcePath,
      s3Key: mapping.s3Key,
      error: `post-put size mismatch expected=${body.length} actual=${head?.ContentLength ?? "missing"}`,
    };
  }

  return {
    status: "copied",
    sourcePath: mapping.sourcePath,
    s3Key: mapping.s3Key,
    size: body.length,
    md5Hex: actualMd5Hex,
    etag: put.ETag,
    documentId: mapping.documentId,
    versionId: mapping.versionId,
    category: mapping.category,
  };
}

async function runPool(items, worker, n) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => runner()));
  return results;
}

async function main() {
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[:.]/g, "-");
  const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  if (!map?.ok || !Array.isArray(map.mappings)) fail("Invalid S3 map JSON");
  if (map.target?.tenantId && map.target.tenantId !== STAGING_TENANT) {
    fail(`Map tenant ${map.target.tenantId} is not staging ${STAGING_TENANT}`);
  }
  if (map.target?.destBucket && map.target.destBucket !== DEST_BUCKET) {
    fail(`Map bucket ${map.target.destBucket} != ${DEST_BUCKET}`);
  }

  let mappings = map.mappings;
  if (offset) mappings = mappings.slice(offset);
  if (limit != null) mappings = mappings.slice(0, limit);

  const storage = getStorage(app);
  const { bucket, bucketName } = await resolveSourceBucket(storage);

  // Probe dest bucket with a no-op-ish head on a known non-existent key pattern
  try {
    await headOk(`tenants/${STAGING_TENANT}/documents/00000000-0000-5000-8000-000000000000/probe`);
  } catch (err) {
    fail(
      `Cannot access dest bucket ${DEST_BUCKET}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  console.error(
    JSON.stringify({
      progress: true,
      phase: "start",
      sourceBucket: bucketName,
      destBucket: DEST_BUCKET,
      tenantId: STAGING_TENANT,
      total: mappings.length,
      concurrency,
      skipExisting,
      offset,
      limit,
    }),
  );

  let done = 0;
  const tallies = {
    copied: 0,
    skipped_existing: 0,
    error: 0,
  };
  const errors = [];
  const results = await runPool(
    mappings,
    async (m) => {
      try {
        const r = await copyOne(bucket, m);
        tallies[r.status] = (tallies[r.status] || 0) + 1;
        if (r.status === "error") {
          errors.push({
            sourcePath: r.sourcePath,
            s3Key: r.s3Key,
            error: r.error,
          });
        }
        done += 1;
        if (done % 50 === 0 || done === mappings.length) {
          console.error(
            JSON.stringify({
              progress: true,
              done,
              total: mappings.length,
              tallies: { ...tallies },
            }),
          );
        }
        return r;
      } catch (err) {
        tallies.error += 1;
        done += 1;
        const entry = {
          status: "error",
          sourcePath: m.sourcePath,
          s3Key: m.s3Key,
          error: err instanceof Error ? err.message : String(err),
        };
        errors.push({
          sourcePath: m.sourcePath,
          s3Key: m.s3Key,
          error: entry.error,
        });
        return entry;
      }
    },
    concurrency,
  );

  const finishedAt = new Date().toISOString();
  const copiedBytes = results
    .filter((r) => r.status === "copied" || r.status === "skipped_existing")
    .reduce((n, r) => n + (Number(r.size) || 0), 0);

  const report = {
    ok: tallies.error === 0,
    phase: "PRODUCERS-P2-storage-s3-copy-staging",
    startedAt,
    finishedAt,
    authorization: {
      gate: "FORGE_P2_STORAGE_COPY_AUTHORIZED",
      approval: "evidence/p2/03-storage/APPROVE-PRODUCERS-STORAGE-COPY.md",
      av: "evidence/p2/03-storage/av-approach-decision.md",
      signed: true,
    },
    source: {
      firebaseProject: PROJECT_ID,
      firebaseBusinessId: BUSINESS_ID,
      bucket: bucketName,
    },
    target: {
      destBucket: DEST_BUCKET,
      tenantId: STAGING_TENANT,
      slug: "producers-rice-mill-staging",
      region: REGION,
    },
    mapFile: path.basename(mapPath),
    concurrency,
    skipExisting,
    offset,
    limit,
    counts: {
      planned: mappings.length,
      ...tallies,
      copiedOrSkippedBytes: copiedBytes,
    },
    errorPreview: errors.slice(0, 100),
    errorCount: errors.length,
    sampleCopied: results
      .filter((r) => r.status === "copied")
      .slice(0, 10)
      .map((r) => ({
        sourcePath: r.sourcePath,
        s3Key: r.s3Key,
        size: r.size,
        md5Hex: r.md5Hex,
      })),
  };

  // Full per-object result is large — write summary + errors + compact results sidecar
  fs.mkdirSync(EVID_DIR, { recursive: true });
  const resultPath = path.join(EVID_DIR, `s3-copy-staging-result-${stamp}.json`);
  const latestPath = path.join(EVID_DIR, "s3-copy-staging-result.json");
  const errorsPath = path.join(EVID_DIR, `s3-copy-staging-errors-${stamp}.json`);
  const objectsPath = path.join(EVID_DIR, `s3-copy-staging-objects-${stamp}.json`);

  fs.writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(latestPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(errorsPath, `${JSON.stringify({ ok: errors.length === 0, errors }, null, 2)}\n`);
  fs.writeFileSync(
    objectsPath,
    `${JSON.stringify({
      ok: report.ok,
      startedAt,
      finishedAt,
      objects: results.map((r) => ({
        status: r.status,
        sourcePath: r.sourcePath,
        s3Key: r.s3Key,
        size: r.size ?? null,
        md5Hex: r.md5Hex ?? null,
        error: r.error ?? null,
      })),
    })}\n`,
  );

  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        counts: report.counts,
        resultFile: resultPath,
        errorsFile: errorsPath,
        objectsFile: objectsPath,
      },
      null,
      2,
    ),
  );

  if (!report.ok) process.exit(1);
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String(e), stack: e?.stack }));
    process.exit(1);
  })
  .finally(async () => {
    try {
      await root.deleteApp(app);
    } catch {
      /* ignore */
    }
  });
