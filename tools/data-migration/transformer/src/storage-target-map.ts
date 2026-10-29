/**
 * Map staged Firebase Storage objects to target dispositions without recopy.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function inferOwnership(objectPath: string): {
  disposition: string;
  tenantMapping: string | null;
  relatedEntity: string | null;
} {
  const parts = objectPath.split("/");
  const top = parts[0] || "";
  if (top === "platform-billing-email-templates" || top === "platform-invoice-templates") {
    return { disposition: "PLATFORM_GLOBAL", tenantMapping: null, relatedEntity: "platform" };
  }
  if (top === "tenants" && parts[1]) {
    return {
      disposition: parts[1].startsWith("business-") ? "OWNERSHIP_CONFIRMED" : "AMBIGUOUS",
      tenantMapping: parts[1],
      relatedEntity: parts[3] || parts[2] || null,
    };
  }
  if (top === "module-attachments" && parts[1]) {
    return {
      disposition: parts[1].startsWith("business-") ? "OWNERSHIP_CONFIRMED" : "AMBIGUOUS",
      tenantMapping: parts[1],
      relatedEntity: parts[2] || null,
    };
  }
  if (
    (top === "dot-compliance" ||
      top === "certificates" ||
      top === "equipment-migrations" ||
      top === "training-imports" ||
      top === "dqf-exports") &&
    parts[1]
  ) {
    if (top === "dqf-exports" && parts[1] === "test") {
      return {
        disposition: "EXCLUDE_APPROVED_TEST_ARTIFACT",
        tenantMapping: null,
        relatedEntity: "dqf-exports-test-artifact",
      };
    }
    return {
      disposition: parts[1].startsWith("business-") ? "OWNERSHIP_CONFIRMED" : "AMBIGUOUS",
      tenantMapping: parts[1],
      relatedEntity: top,
    };
  }
  if (!top) return { disposition: "ORPHAN", tenantMapping: null, relatedEntity: null };
  return { disposition: "AMBIGUOUS", tenantMapping: null, relatedEntity: top };
}

export function mapStorageInventory(csvPath: string, outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const lines = readFileSync(csvPath, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  const counts: Record<string, number> = {};
  const outPath = path.join(outDir, "storage-target-map.ndjson");
  const rows: string[] = [];
  for (const line of lines) {
    const name = (line.split(",")[0] ?? "").replace(/^\uFEFF/, "");
    if (!name) continue;
    const own = inferOwnership(name);
    counts[own.disposition] = (counts[own.disposition] ?? 0) + 1;
    rows.push(
      JSON.stringify({
        sourceBucket: "forge-industrial-safety.firebasestorage.app",
        sourcePath: name,
        stagedKey: `storage/source/${name}`,
        targetBucketIntent: "customer-documents-after-controlled-import",
        tenantMapping: own.tenantMapping,
        relatedEntity: own.relatedEntity,
        migrationDisposition: own.disposition,
      }),
    );
  }
  writeFileSync(outPath, `${rows.join("\n")}${rows.length ? "\n" : ""}`);
  const summary = {
    filesAccountedFor: rows.length,
    ambiguousFiles: counts.AMBIGUOUS ?? 0,
    counts,
    sha256: createHash("sha256").update(readFileSync(outPath)).digest("hex"),
    stagedPrefix: "s3://forge-production-imports-511343547817-us-east-1/storage/source/",
  };
  writeFileSync(
    path.join(outDir, "storage-target-map.summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  return summary;
}

const isMain = process.argv[1]?.includes("storage-target-map");
if (isMain) {
  const csv = path.join(REPO, ".tmp-data-migration/dm-s2/storage-source-inventory.csv");
  const out = path.join(REPO, ".tmp-data-migration/dm-s2/aws-import-run-v2");
  process.stdout.write(`${JSON.stringify(mapStorageInventory(csv, out), null, 2)}\n`);
}
