#!/usr/bin/env node
/**
 * Producers P2 Phase 3 — dry-run Firebase Storage path → S3 key map (staging).
 *
 * Reads the inventory freeze. Writes no objects to S3.
 *
 *   node scripts/ind11b-p2-storage-s3-map.mjs
 *
 * Optional:
 *   FORGE_P2_STORAGE_MAP_TENANT=staging|prod-twin  (default staging)
 *   FORGE_P2_STORAGE_MAP_INVENTORY=path/to/freeze.json
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const BUSINESS_ID = "business-1782553339499";
const EVID_DIR = path.resolve("docs/program/industrial-migration/ind-11/evidence/p2/03-storage");
const DEST_BUCKET = "forge-development-documents-511343547817-us-east-1";

const TENANTS = {
  staging: {
    slug: "producers-rice-mill-staging",
    tenantId: "0882c865-59c2-49a6-ab88-ce6ca89be30c",
  },
  "prod-twin": {
    slug: "producers-rice-mill",
    tenantId: "5da680d3-50f5-46ac-8b85-6cf454b6a0da",
  },
};

function fail(msg, code = 2) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

function safeFilename(value) {
  return (
    (String(value).replace(/\\/g, "/").split("/").pop() ?? "file")
      .replace(/\.\.+/g, ".")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 180) || "file"
  );
}

/** Deterministic UUID from SHA-256 digest (version nibble 5, RFC-ish). */
function uuidFromBytes(buf) {
  const b = Buffer.from(buf);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function uuidFromString(s) {
  return uuidFromBytes(crypto.createHash("sha256").update(s, "utf8").digest());
}

function buildTargetKey(tenantId, documentId, versionId, filename) {
  return `tenants/${tenantId}/documents/${documentId}/${versionId}/${safeFilename(filename)}`;
}

function resolveInventoryPath() {
  const envPath = process.env.FORGE_P2_STORAGE_MAP_INVENTORY?.trim();
  if (envPath) {
    if (!fs.existsSync(envPath)) fail(`Inventory missing: ${envPath}`);
    return envPath;
  }
  const latest = path.join(EVID_DIR, "storage-inventory-latest.json");
  if (fs.existsSync(latest)) return latest;
  fail("No storage-inventory-latest.json — run inventory first");
}

function main() {
  const which = (process.env.FORGE_P2_STORAGE_MAP_TENANT || "staging").trim();
  const tenant = TENANTS[which];
  if (!tenant) {
    fail(`Unknown FORGE_P2_STORAGE_MAP_TENANT=${which}; use staging|prod-twin`);
  }

  const inventoryPath = resolveInventoryPath();
  const inv = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  if (!inv?.ok || !Array.isArray(inv.objects)) {
    fail("Inventory JSON missing ok/objects");
  }
  if (inv.firebaseBusinessId && inv.firebaseBusinessId !== BUSINESS_ID) {
    fail(`Inventory business mismatch: ${inv.firebaseBusinessId}`);
  }

  const mappedAt = new Date().toISOString();
  const stamp = mappedAt.replace(/[:.]/g, "-");
  const mappings = [];
  const keySet = new Map();
  const collisions = [];
  const byCategory = {};

  for (const o of inv.objects) {
    const sourcePath = o.path;
    const documentId = uuidFromString(`forge-p2-doc:${BUSINESS_ID}:${sourcePath}`);
    const versionSeed = o.generation || o.md5Hash || o.crc32c || `size-${o.size}`;
    const versionId = uuidFromString(`forge-p2-ver:${BUSINESS_ID}:${sourcePath}:${versionSeed}`);
    const filename = safeFilename(o.filename || sourcePath);
    const s3Key = buildTargetKey(tenant.tenantId, documentId, versionId, filename);

    if (keySet.has(s3Key)) {
      collisions.push({ s3Key, first: keySet.get(s3Key), second: sourcePath });
    } else {
      keySet.set(s3Key, sourcePath);
    }

    const category = o.category || "other";
    byCategory[category] = (byCategory[category] || 0) + 1;

    mappings.push({
      sourcePath,
      category,
      size: o.size,
      contentType: o.contentType,
      md5Hash: o.md5Hash,
      crc32c: o.crc32c,
      generation: o.generation,
      documentId,
      versionId,
      filename,
      destBucket: DEST_BUCKET,
      s3Key,
      stagingRemapNote:
        which === "staging"
          ? "prod-twin key uses same doc/version IDs with tenant UUID replaced"
          : null,
    });
  }

  const result = {
    ok: collisions.length === 0,
    phase: "PRODUCERS-P2-storage-s3-map",
    mode: "dry-run",
    mappedAt,
    sourceInventory: path.basename(inventoryPath),
    sourceInventoryFreezeAt: inv.freezeAt ?? null,
    firebaseBusinessId: BUSINESS_ID,
    target: {
      which,
      slug: tenant.slug,
      tenantId: tenant.tenantId,
      destBucket: DEST_BUCKET,
      keyConvention: "tenants/{tenantId}/documents/{documentId}/{versionId}/{filename}",
      idStrategy:
        "sha256-derived UUID v5-style from businessId+sourcePath (+generation/md5 for version)",
    },
    decision: {
      m1: "Map staging first; prod-twin reuses documentId/versionId with tenant UUID swapped in key prefix",
      copyGate: "FORGE_P2_STORAGE_COPY_AUTHORIZED + APPROVE-PRODUCERS-STORAGE-COPY.md",
    },
    counts: {
      mapped: mappings.length,
      uniqueKeys: keySet.size,
      collisions: collisions.length,
      byCategory,
      bytes: mappings.reduce((n, m) => n + (Number(m.size) || 0), 0),
    },
    collisions,
    mappings,
  };

  fs.mkdirSync(EVID_DIR, { recursive: true });
  const outPath = path.join(EVID_DIR, `s3-map-${which}-${stamp}.json`);
  const latestPath = path.join(EVID_DIR, `s3-map-${which}-latest.json`);
  const summaryPath = path.join(EVID_DIR, `s3-map-${which}-summary.json`);

  // Full map is large — write compact one-line mappings for freeze + small summary with samples
  fs.writeFileSync(outPath, `${JSON.stringify(result)}\n`);
  fs.writeFileSync(latestPath, `${JSON.stringify(result)}\n`);

  const summary = {
    ok: result.ok,
    mappedAt,
    sourceInventory: result.sourceInventory,
    sourceInventoryFreezeAt: result.sourceInventoryFreezeAt,
    target: result.target,
    decision: result.decision,
    counts: result.counts,
    collisionPreview: collisions.slice(0, 20),
    sampleMappings: mappings.slice(0, 8).map((m) => ({
      sourcePath: m.sourcePath,
      s3Key: m.s3Key,
      category: m.category,
      size: m.size,
    })),
    mapFile: path.basename(outPath),
  };
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        mappedAt,
        counts: result.counts,
        mapFile: outPath,
        summaryFile: summaryPath,
      },
      null,
      2,
    ),
  );

  if (collisions.length > 0) process.exit(1);
}

main();
