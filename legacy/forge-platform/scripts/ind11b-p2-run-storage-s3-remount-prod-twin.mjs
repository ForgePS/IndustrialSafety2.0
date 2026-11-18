#!/usr/bin/env node
/**
 * Producers P2 Phase 3 M4 — remount staging S3 objects onto prod-twin keys.
 *
 * Server-side CopyObject within forge-development-documents bucket.
 * Does NOT touch Firebase.
 *
 *   FORGE_P2_STORAGE_PROD_TWIN_REMOUNT_AUTHORIZED=true \
 *     node scripts/ind11b-p2-run-storage-s3-remount-prod-twin.mjs
 *
 * Optional:
 *   FORGE_P2_STORAGE_MAP=path/to/s3-map-staging-latest.json
 *   FORGE_P2_STORAGE_REMOUNT_CONCURRENCY=16
 *   FORGE_P2_STORAGE_REMOUNT_LIMIT=N
 *   FORGE_P2_STORAGE_REMOUNT_OFFSET=0
 *   FORGE_P2_STORAGE_REMOUNT_SKIP_EXISTING=true
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const STAGING_TENANT = "0882c865-59c2-49a6-ab88-ce6ca89be30c";
const PROD_TWIN_TENANT = "5da680d3-50f5-46ac-8b85-6cf454b6a0da";
const DEST_BUCKET = "forge-development-documents-511343547817-us-east-1";
const REGION = "us-east-1";
const EVID_DIR = path.resolve(
  process.env.FORGE_P2_EVID_DIR?.trim() ||
    "docs/program/industrial-migration/ind-11/evidence/p2/03-storage",
);
const APPROVAL = path.join(EVID_DIR, "APPROVE-PRODUCERS-STORAGE-COPY-PROD-TWIN.md");
const AV_DECISION = path.join(EVID_DIR, "av-approach-decision.md");

function fail(msg, code = 2) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

if (process.env.FORGE_P2_STORAGE_PROD_TWIN_REMOUNT_AUTHORIZED?.trim() !== "true") {
  fail(
    "Refused: set FORGE_P2_STORAGE_PROD_TWIN_REMOUNT_AUTHORIZED=true after signing APPROVE-PRODUCERS-STORAGE-COPY-PROD-TWIN.md",
  );
}
if (!fs.existsSync(APPROVAL)) fail(`Approval missing: ${APPROVAL}`);
{
  const t = fs.readFileSync(APPROVAL, "utf8");
  if (!/\*\*Status:\*\*\s*SIGNED/i.test(t) || !/AUTHORIZED/i.test(t)) {
    fail("APPROVE-PRODUCERS-STORAGE-COPY-PROD-TWIN.md is not SIGNED / AUTHORIZED");
  }
  if (!/APPROVED\s*\(electronic/i.test(t)) {
    fail("Prod-twin remount approval missing Program Owner APPROVED mark");
  }
}
if (!fs.existsSync(AV_DECISION)) fail(`AV decision missing: ${AV_DECISION}`);

const mapPath =
  process.env.FORGE_P2_STORAGE_MAP?.trim() || path.join(EVID_DIR, "s3-map-staging-latest.json");
if (!fs.existsSync(mapPath)) fail(`Map missing: ${mapPath}`);

const concurrency = Math.max(
  1,
  Math.min(32, Number(process.env.FORGE_P2_STORAGE_REMOUNT_CONCURRENCY || 16)),
);
const limitEnv = process.env.FORGE_P2_STORAGE_REMOUNT_LIMIT?.trim();
const limit = limitEnv ? Math.max(0, Number(limitEnv)) : null;
const offset = Math.max(0, Number(process.env.FORGE_P2_STORAGE_REMOUNT_OFFSET || 0));
const skipExisting = process.env.FORGE_P2_STORAGE_REMOUNT_SKIP_EXISTING?.trim() !== "false";

function loadS3Sdk() {
  const candidates = [
    "/app/apps/platform-api/package.json",
    path.resolve(process.cwd(), "apps/platform-api/package.json"),
    path.resolve(process.cwd(), "package.json"),
  ];
  for (const pkg of candidates) {
    if (!pkg.startsWith("/app/") && !fs.existsSync(pkg)) continue;
    try {
      const req = createRequire(pkg);
      return req("@aws-sdk/client-s3");
    } catch {
      /* try next */
    }
  }
  return null;
}

const sdk = loadS3Sdk();
const S3Client = sdk?.S3Client ?? null;
const CopyObjectCommand = sdk?.CopyObjectCommand ?? null;
const HeadObjectCommand = sdk?.HeadObjectCommand ?? null;
const ListObjectsV2Command = sdk?.ListObjectsV2Command ?? null;

function toProdTwinKey(stagingKey) {
  const prefix = `tenants/${STAGING_TENANT}/`;
  if (!stagingKey.startsWith(prefix)) {
    throw new Error(`Unexpected staging key prefix: ${stagingKey}`);
  }
  return `tenants/${PROD_TWIN_TENANT}/${stagingKey.slice(prefix.length)}`;
}

function encodeCopySource(bucket, key) {
  return `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function mainSdk(mappings) {
  const s3 = new S3Client({ region: REGION });
  async function head(key) {
    try {
      const h = await s3.send(new HeadObjectCommand({ Bucket: DEST_BUCKET, Key: key }));
      return { ok: true, size: Number(h.ContentLength ?? 0), etag: h.ETag || null };
    } catch (e) {
      if (
        e?.$metadata?.httpStatusCode === 404 ||
        e?.name === "NotFound" ||
        e?.name === "NoSuchKey"
      ) {
        return null;
      }
      throw e;
    }
  }

  const counts = {
    planned: mappings.length,
    copied: 0,
    skipped_existing: 0,
    error: 0,
  };
  const errors = [];
  const sample = [];
  const objectLog = [];
  let i = 0;

  async function worker() {
    while (i < mappings.length) {
      const idx = i++;
      const m = mappings[idx];
      const srcKey = m.s3Key;
      const dstKey = toProdTwinKey(srcKey);
      try {
        if (skipExisting) {
          const existing = await head(dstKey);
          if (existing && existing.size === Number(m.size ?? -1)) {
            counts.skipped_existing += 1;
            objectLog.push({
              sourcePath: m.sourcePath,
              srcKey,
              dstKey,
              status: "skipped_existing",
              size: existing.size,
            });
            continue;
          }
        }
        await s3.send(
          new CopyObjectCommand({
            Bucket: DEST_BUCKET,
            Key: dstKey,
            CopySource: encodeCopySource(DEST_BUCKET, srcKey),
            MetadataDirective: "COPY",
          }),
        );
        counts.copied += 1;
        const row = {
          sourcePath: m.sourcePath,
          srcKey,
          dstKey,
          status: "copied",
          size: m.size,
        };
        objectLog.push(row);
        if (sample.length < 8) sample.push(row);
      } catch (e) {
        counts.error += 1;
        const err = {
          sourcePath: m.sourcePath,
          srcKey,
          dstKey,
          status: "error",
          error: String(e.message || e),
        };
        objectLog.push(err);
        if (errors.length < 40) errors.push(err);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { counts, errors, sample, objectLog };
}

/** AWS CLI fallback when local @aws-sdk/client-s3 is unavailable. */
async function mainCli(mappings) {
  const counts = {
    planned: mappings.length,
    copied: 0,
    skipped_existing: 0,
    error: 0,
  };
  const errors = [];
  const sample = [];
  const objectLog = [];
  let cursor = 0;

  async function worker() {
    while (cursor < mappings.length) {
      const idx = cursor++;
      const m = mappings[idx];
      const srcKey = m.s3Key;
      const dstKey = toProdTwinKey(srcKey);
      try {
        if (skipExisting) {
          const head = spawnSync(
            "aws",
            ["s3api", "head-object", "--bucket", DEST_BUCKET, "--key", dstKey, "--output", "json"],
            { encoding: "utf8", shell: true },
          );
          if (head.status === 0) {
            const h = JSON.parse(head.stdout);
            if (Number(h.ContentLength ?? 0) === Number(m.size ?? -1)) {
              counts.skipped_existing += 1;
              objectLog.push({
                sourcePath: m.sourcePath,
                srcKey,
                dstKey,
                status: "skipped_existing",
                size: Number(h.ContentLength ?? 0),
              });
              continue;
            }
          }
        }
        const cp = spawnSync(
          "aws",
          [
            "s3api",
            "copy-object",
            "--bucket",
            DEST_BUCKET,
            "--key",
            dstKey,
            "--copy-source",
            encodeCopySource(DEST_BUCKET, srcKey),
            "--metadata-directive",
            "COPY",
            "--output",
            "json",
          ],
          { encoding: "utf8", shell: true },
        );
        if (cp.status !== 0) throw new Error(cp.stderr || cp.stdout || "copy-object failed");
        counts.copied += 1;
        const row = {
          sourcePath: m.sourcePath,
          srcKey,
          dstKey,
          status: "copied",
          size: m.size,
        };
        objectLog.push(row);
        if (sample.length < 8) sample.push(row);
      } catch (e) {
        counts.error += 1;
        const err = {
          sourcePath: m.sourcePath,
          srcKey,
          dstKey,
          status: "error",
          error: String(e.message || e),
        };
        objectLog.push(err);
        if (errors.length < 40) errors.push(err);
      }
    }
  }

  // CLI is slower; keep concurrency moderate
  const cliConcurrency = Math.min(concurrency, 8);
  await Promise.all(Array.from({ length: cliConcurrency }, () => worker()));
  return { counts, errors, sample, objectLog };
}

async function reconcileProdTwin() {
  if (S3Client) {
    const s3 = new S3Client({ region: REGION });
    const prefix = `tenants/${PROD_TWIN_TENANT}/`;
    let continuationToken;
    let objects = 0;
    let bytes = 0;
    do {
      const res = await s3.send(
        new ListObjectsV2Command({
          Bucket: DEST_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const o of res.Contents || []) {
        objects += 1;
        bytes += Number(o.Size || 0);
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);
    return { objects, bytes, prefix };
  }
  // CLI reconcile via s3api list (paginate once with --query sum is hard); use s3 ls recursive count
  const ls = spawnSync(
    "aws",
    [
      "s3api",
      "list-objects-v2",
      "--bucket",
      DEST_BUCKET,
      "--prefix",
      `tenants/${PROD_TWIN_TENANT}/`,
      "--output",
      "json",
    ],
    { encoding: "utf8", shell: true, maxBuffer: 128 * 1024 * 1024 },
  );
  if (ls.status !== 0) throw new Error(ls.stderr || "list-objects failed");
  const data = JSON.parse(ls.stdout || "{}");
  let objects = 0;
  let bytes = 0;
  // May need pagination — loop
  let token = null;
  let page = data;
  for (;;) {
    for (const o of page.Contents || []) {
      objects += 1;
      bytes += Number(o.Size || 0);
    }
    if (!page.IsTruncated) break;
    token = page.NextContinuationToken;
    const next = spawnSync(
      "aws",
      [
        "s3api",
        "list-objects-v2",
        "--bucket",
        DEST_BUCKET,
        "--prefix",
        `tenants/${PROD_TWIN_TENANT}/`,
        "--continuation-token",
        token,
        "--output",
        "json",
      ],
      { encoding: "utf8", shell: true, maxBuffer: 128 * 1024 * 1024 },
    );
    if (next.status !== 0) throw new Error(next.stderr || "list-objects page failed");
    page = JSON.parse(next.stdout || "{}");
  }
  return { objects, bytes, prefix: `tenants/${PROD_TWIN_TENANT}/` };
}

async function main() {
  const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  if (!map?.ok || !Array.isArray(map.mappings)) fail("Map JSON missing ok/mappings");
  if (map.target?.tenantId && map.target.tenantId !== STAGING_TENANT) {
    fail(`Expected staging map tenant ${STAGING_TENANT}, got ${map.target.tenantId}`);
  }

  let mappings = map.mappings;
  if (offset) mappings = mappings.slice(offset);
  if (limit != null) mappings = mappings.slice(0, limit);

  const startedAt = new Date().toISOString();
  console.error(
    JSON.stringify({
      phase: "PRODUCERS-P2-storage-s3-remount-prod-twin",
      mode: S3Client ? "sdk" : "cli",
      planned: mappings.length,
      concurrency,
      skipExisting,
    }),
  );

  const { counts, errors, sample, objectLog } = S3Client
    ? await mainSdk(mappings)
    : await mainCli(mappings);

  let reconcile = null;
  try {
    reconcile = await reconcileProdTwin();
  } catch (e) {
    reconcile = { error: String(e.message || e) };
  }

  const inventoryBytes = mappings.reduce((n, m) => n + (Number(m.size) || 0), 0);
  const finishedAt = new Date().toISOString();
  const stamp = finishedAt.replace(/[:.]/g, "-");

  const result = {
    ok: counts.error === 0,
    phase: "PRODUCERS-P2-storage-s3-remount-prod-twin",
    startedAt,
    finishedAt,
    authorization: {
      gate: "FORGE_P2_STORAGE_PROD_TWIN_REMOUNT_AUTHORIZED",
      approval: "evidence/p2/03-storage/APPROVE-PRODUCERS-STORAGE-COPY-PROD-TWIN.md",
      signed: true,
    },
    source: {
      method: "s3-copy-object",
      bucket: DEST_BUCKET,
      tenantId: STAGING_TENANT,
      slug: "producers-rice-mill-staging",
    },
    target: {
      destBucket: DEST_BUCKET,
      tenantId: PROD_TWIN_TENANT,
      slug: "producers-rice-mill",
      region: REGION,
    },
    mapFile: path.basename(mapPath),
    concurrency,
    skipExisting,
    offset,
    limit,
    counts,
    inventorySliceBytes: inventoryBytes,
    reconcile,
    sampleCopied: sample,
    errorPreview: errors,
    errorCount: counts.error,
  };

  fs.mkdirSync(EVID_DIR, { recursive: true });
  const resultPath = path.join(EVID_DIR, `s3-remount-prod-twin-result-${stamp}.json`);
  const latest = path.join(EVID_DIR, "s3-remount-prod-twin-result.json");
  const objectsPath = path.join(EVID_DIR, `s3-remount-prod-twin-objects-${stamp}.json`);
  const reconcilePath = path.join(EVID_DIR, "s3-remount-prod-twin-reconcile.json");

  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(latest, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(objectsPath, `${JSON.stringify({ ok: result.ok, objects: objectLog })}\n`);

  const expectedObjects = offset === 0 && limit == null ? map.mappings.length : mappings.length;
  const expectedBytes =
    offset === 0 && limit == null
      ? map.mappings.reduce((n, m) => n + (Number(m.size) || 0), 0)
      : inventorySliceBytes;
  // For partial runs, reconcile only asserts the prefix has *at least* the slice bytes/objects
  // via result counts; full reconcile is for complete remounts.
  const recon =
    offset === 0 && limit == null
      ? {
          ok:
            reconcile &&
            !reconcile.error &&
            reconcile.objects === expectedObjects &&
            reconcile.bytes === expectedBytes,
          at: finishedAt,
          expected: { objects: expectedObjects, bytes: expectedBytes },
          observed: reconcile,
          note: "Prod-twin prefix list vs full staging map counts/bytes",
        }
      : {
          ok: counts.error === 0 && counts.copied + counts.skipped_existing === mappings.length,
          at: finishedAt,
          mode: "partial-slice",
          slice: { offset, limit, planned: mappings.length },
          counts,
          observedPrefix: reconcile,
          note: "Partial remount — full prefix reconcile deferred until complete run",
        };
  fs.writeFileSync(reconcilePath, `${JSON.stringify(recon, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        ok: result.ok && recon.ok,
        counts: result.counts,
        reconcile: recon,
        written: { resultPath, latest, objectsPath, reconcilePath },
      },
      null,
      2,
    ),
  );
  if (!(result.ok && recon.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e), stack: e?.stack }));
  process.exit(1);
});
