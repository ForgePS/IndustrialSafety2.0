#!/usr/bin/env node
/**
 * Producers P2 Phase 3 — read-only Firebase Storage inventory (full pagination).
 *
 * Requires:
 *   FORGE_P2_STORAGE_INVENTORY_AUTHORIZED=true
 *   FORGE_FIREBASE_RO_SERVICE_ACCOUNT_PATH=... (never commit SA JSON)
 *
 * No S3 writes. No Storage mutations. Download tokens stripped from evidence.
 *
 *   node scripts/ind11b-p2-run-storage-inventory.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const BUSINESS_ID = "business-1782553339499";
const PROJECT_ID = "forge-industrial-safety";
const PAGE_SIZE = 1000;
const EVID_DIR = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/03-storage");
const APPROVAL = path.join(EVID_DIR, "APPROVE-PRODUCERS-STORAGE-INVENTORY.md");

function fail(msg, code = 2) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

if (process.env.FORGE_P2_STORAGE_INVENTORY_AUTHORIZED?.trim() !== "true") {
  fail(
    "Refused: set FORGE_P2_STORAGE_INVENTORY_AUTHORIZED=true after signing APPROVE-PRODUCERS-STORAGE-INVENTORY.md",
  );
}

if (!fs.existsSync(APPROVAL)) {
  fail(`Approval missing: ${APPROVAL}`);
}
{
  const approvalText = fs.readFileSync(APPROVAL, "utf8");
  if (!/\*\*Status:\*\*\s*SIGNED/i.test(approvalText)) {
    fail("Approval file is not SIGNED");
  }
}

const saPath = process.env.FORGE_FIREBASE_RO_SERVICE_ACCOUNT_PATH?.trim();
if (!saPath) fail("FORGE_FIREBASE_RO_SERVICE_ACCOUNT_PATH required");
if (!fs.existsSync(saPath)) fail(`Service account file missing: ${saPath}`);

const requireFromMig = createRequire(path.resolve("packages/migration-firebase/package.json"));
let admin;
let getStorage;
try {
  admin = requireFromMig("firebase-admin");
  getStorage = requireFromMig("firebase-admin/storage").getStorage;
} catch (e) {
  fail(`firebase-admin not found under packages/migration-firebase: ${e}`);
}

const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
if (!sa.private_key || !sa.client_email) {
  fail("Service account JSON missing private_key or client_email");
}

const root = admin;
const appName = `p2-storage-inv-${Date.now()}`;
const certFn = root.credential?.cert ?? root.cert;
if (typeof certFn !== "function" || typeof root.initializeApp !== "function") {
  fail(`firebase-admin API unexpected (cert=${typeof certFn}, init=${typeof root.initializeApp})`);
}
if (typeof getStorage !== "function") {
  fail("firebase-admin/storage getStorage unavailable");
}

const app = root.initializeApp(
  {
    credential: certFn.call(root.credential ?? root, sa),
    projectId: PROJECT_ID,
    storageBucket: `${PROJECT_ID}.appspot.com`,
  },
  appName,
);

function scrubMeta(meta) {
  if (!meta || typeof meta !== "object") return {};
  return Object.fromEntries(
    Object.entries(meta).filter(([k]) => !/token|secret|password|key|credential/i.test(k)),
  );
}

function inferBusinessId(objectPath, customMeta) {
  if (typeof customMeta?.businessId === "string" && customMeta.businessId) {
    return customMeta.businessId;
  }
  if (typeof customMeta?.organizationId === "string" && customMeta.organizationId) {
    return customMeta.organizationId;
  }
  const mid = objectPath.match(/(?:^|\/)(business-[^/]+)(?:\/|$)/);
  if (mid) return mid[1];
  const slashBiz = objectPath.match(/businesses\/([^/]+)/);
  if (slashBiz) return slashBiz[1];
  return null;
}

function belongsToProducers(objectPath, customMeta) {
  if (objectPath.includes(BUSINESS_ID)) return true;
  const bid = inferBusinessId(objectPath, customMeta);
  return bid === BUSINESS_ID;
}

function classify(objectPath) {
  const p = objectPath.toLowerCase();
  if (/(^|\/)loto(\/|$)/.test(p) || p.includes("/loto/") || p.includes("loto-")) {
    return "loto";
  }
  if (p.startsWith("certificates/")) return "certificates";
  if (p.startsWith("dot-compliance/") || p.startsWith("dqf-")) return "dot";
  if (p.includes("equipment")) return "equipment";
  if (/(^|\/)qr([_-]|\/)/.test(p) || p.includes("qrcode") || p.includes("qr-image")) {
    return "qr_images";
  }
  if (p.startsWith("module-attachments/")) return "module_attachments";
  if (p.startsWith("workbooks/") || p.includes("/documents/")) return "general_docs";
  return "other";
}

function filenameOf(objectPath) {
  const parts = objectPath.split("/");
  return parts[parts.length - 1] || objectPath;
}

async function resolveBucket(storage) {
  const candidates = [`${PROJECT_ID}.appspot.com`, `${PROJECT_ID}.firebasestorage.app`];
  const errors = [];
  for (const bucketName of candidates) {
    try {
      const bucket = storage.bucket(bucketName);
      const [exists] = await bucket.exists();
      if (!exists) {
        errors.push(`${bucketName}: does not exist`);
        continue;
      }
      // Smoke: one page list proves Object Viewer works
      await bucket.getFiles({ maxResults: 1, autoPaginate: false });
      return { bucket, bucketName, errors };
    } catch (err) {
      errors.push(`${bucketName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  fail(`No usable Storage bucket. Tried: ${errors.join(" | ")}`);
}

async function listAllFiles(bucket) {
  const files = [];
  let pageToken;
  let pages = 0;
  do {
    const opts = {
      maxResults: PAGE_SIZE,
      autoPaginate: false,
    };
    if (pageToken) opts.pageToken = pageToken;
    const [pageFiles, , apiResponse] = await bucket.getFiles(opts);
    pages += 1;
    for (const f of pageFiles) files.push(f);
    const next =
      apiResponse && typeof apiResponse === "object" && "nextPageToken" in apiResponse
        ? apiResponse.nextPageToken
        : undefined;
    pageToken = next || undefined;
    if (pages % 5 === 0 || !pageToken) {
      process.stderr.write(
        JSON.stringify({
          progress: true,
          pages,
          listedSoFar: files.length,
          hasMore: Boolean(pageToken),
        }) + "\n",
      );
    }
  } while (pageToken);
  return { files, pages, truncated: false };
}

async function main() {
  const freezeAt = new Date().toISOString();
  const stamp = freezeAt.replace(/[:.]/g, "-");
  const storage = getStorage(app);
  const { bucket, bucketName, errors: bucketProbeErrors } = await resolveBucket(storage);

  const { files, pages, truncated } = await listAllFiles(bucket);

  const objects = [];
  let producersMatched = 0;
  let bytesProducers = 0;
  const byCategory = {};
  const topPrefixes = {};
  const otherBusinessCounts = {};

  for (const f of files) {
    const objectPath = f.name;
    const meta = f.metadata || {};
    const custom = scrubMeta(meta.metadata || {});
    const size = Number(meta.size ?? 0);
    const contentType = meta.contentType ? String(meta.contentType) : null;
    const inferredBusinessId = inferBusinessId(objectPath, meta.metadata || {});
    const inProducers = belongsToProducers(objectPath, meta.metadata || {});
    const top = objectPath.split("/")[0] || "(root)";
    topPrefixes[top] = (topPrefixes[top] || 0) + 1;

    if (!inProducers) {
      if (inferredBusinessId) {
        otherBusinessCounts[inferredBusinessId] =
          (otherBusinessCounts[inferredBusinessId] || 0) + 1;
      } else {
        otherBusinessCounts["(none)"] = (otherBusinessCounts["(none)"] || 0) + 1;
      }
      continue;
    }

    producersMatched += 1;
    bytesProducers += size;
    const category = classify(objectPath);
    byCategory[category] = byCategory[category] || { count: 0, bytes: 0 };
    byCategory[category].count += 1;
    byCategory[category].bytes += size;

    const hasDownloadToken = Boolean(meta.metadata?.firebaseStorageDownloadTokens);

    objects.push({
      path: objectPath,
      filename: filenameOf(objectPath),
      size,
      contentType,
      md5Hash: meta.md5Hash ? String(meta.md5Hash) : null,
      crc32c: meta.crc32c ? String(meta.crc32c) : null,
      generation: meta.generation ? String(meta.generation) : null,
      updated: meta.updated ? String(meta.updated) : null,
      timeCreated: meta.timeCreated ? String(meta.timeCreated) : null,
      inferredBusinessId,
      category,
      hasDownloadToken,
      customMetadataKeys: Object.keys(custom).sort(),
      customMetadata: custom,
    });
  }

  objects.sort((a, b) => a.path.localeCompare(b.path));

  const exceptions = {
    zeroByte: objects.filter((o) => o.size === 0).map((o) => o.path),
    missingContentType: objects.filter((o) => !o.contentType).map((o) => o.path),
    missingChecksum: objects.filter((o) => !o.md5Hash && !o.crc32c).map((o) => o.path),
    orphanNoBusinessSegment: objects.filter((o) => !o.inferredBusinessId).map((o) => o.path),
  };

  const inventory = {
    ok: true,
    phase: "PRODUCERS-P2-storage-inventory",
    freezeAt,
    firebaseProject: PROJECT_ID,
    firebaseBusinessId: BUSINESS_ID,
    bucket: bucketName,
    bucketProbeErrors,
    authorization: {
      gate: "FORGE_P2_STORAGE_INVENTORY_AUTHORIZED",
      approval: "evidence/p2/03-storage/APPROVE-PRODUCERS-STORAGE-INVENTORY.md",
      signed: true,
    },
    pagination: {
      pageSize: PAGE_SIZE,
      pages,
      truncated,
      autoPaginate: false,
    },
    counts: {
      bucketObjectsScanned: files.length,
      producersMatched,
      producersBytes: bytesProducers,
      nonProducersSkipped: files.length - producersMatched,
      byCategory,
      topPrefixesBucketWide: topPrefixes,
      otherBusinessCountsSample: Object.fromEntries(
        Object.entries(otherBusinessCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 40),
      ),
      exceptions: {
        zeroByte: exceptions.zeroByte.length,
        missingContentType: exceptions.missingContentType.length,
        missingChecksum: exceptions.missingChecksum.length,
        orphanNoBusinessSegment: exceptions.orphanNoBusinessSegment.length,
      },
    },
    objects,
    exceptions,
  };

  fs.mkdirSync(EVID_DIR, { recursive: true });
  const freezePath = path.join(EVID_DIR, `storage-inventory-${stamp}.json`);
  const latestPath = path.join(EVID_DIR, "storage-inventory-latest.json");
  const summaryPath = path.join(EVID_DIR, "storage-inventory-summary.json");

  const json = `${JSON.stringify(inventory, null, 2)}\n`;
  fs.writeFileSync(freezePath, json);
  fs.writeFileSync(latestPath, json);

  const summary = {
    ok: true,
    freezeAt,
    firebaseBusinessId: BUSINESS_ID,
    bucket: bucketName,
    inventoryFile: path.basename(freezePath),
    pagination: inventory.pagination,
    counts: inventory.counts,
    exceptionsPreview: {
      zeroByte: exceptions.zeroByte.slice(0, 50),
      missingContentType: exceptions.missingContentType.slice(0, 50),
      missingChecksum: exceptions.missingChecksum.slice(0, 50),
      orphanNoBusinessSegment: exceptions.orphanNoBusinessSegment.slice(0, 50),
    },
  };
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        freezeAt,
        bucket: bucketName,
        counts: inventory.counts,
        inventoryFile: freezePath,
        summaryFile: summaryPath,
      },
      null,
      2,
    ),
  );
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
