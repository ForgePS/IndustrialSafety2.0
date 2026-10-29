import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { normalizeFirestoreValue } from "./firestore-types.js";
import {
  MATRIX_BY_COLLECTION,
  assertMatrixComplete,
  TARGET_SCHEMA_GAPS,
} from "./source-target-matrix.js";
import { isCustomerImportTenant, resolveAwsTenant } from "./tenant-map.js";
import type { ExtractedRecord, GateCounts, IdMapEntry, TransformError } from "./types.js";

export const TOOL_VERSION = "0.2.0";

function pickEffectiveTenantKey(rec: ExtractedRecord): string | null {
  if (rec._migration.sourceTenantKey) return rec._migration.sourceTenantKey;
  const collection = rec._migration.collection;
  const id = rec._migration.documentId;
  if (
    (collection === "organizations" || collection === "platformBusinesses") &&
    typeof id === "string" &&
    id.length > 0
  ) {
    return id;
  }
  const data = rec.data ?? {};
  for (const key of [
    "businessId",
    "organizationId",
    "companyId",
    "tenantId",
    "primaryBusinessId",
  ] as const) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const ids = data.businessIds;
  if (Array.isArray(ids)) {
    const first = ids.find((x) => typeof x === "string" && x.trim());
    if (typeof first === "string") return first.trim();
  }
  return null;
}

export type TransformOptions = {
  inputDir: string;
  outputDir: string;
  migrationRunId: string;
  gitSha: string;
  customerOnly: boolean;
};

function entityFileName(targetEntity: string): string {
  const base = targetEntity.replace(/^archive\//, "archive-").replace(/^excluded\//, "excluded-");
  return `${base.replace(/[^a-zA-Z0-9._+-]+/g, "_")}.ndjson`;
}

function deterministicTargetId(sourceCollection: string, sourceDocumentId: string): string {
  const h = createHash("sha256")
    .update(`firebase:${sourceCollection}:${sourceDocumentId}`)
    .digest("hex")
    .slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

async function* readNdjson(filePath: string): AsyncGenerator<ExtractedRecord> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    yield JSON.parse(trimmed) as ExtractedRecord;
  }
}

export type TransformResult = {
  gates: GateCounts;
  errors: TransformError[];
  recordCounts: Record<string, number>;
  idMapCount: number;
  sourceDocumentCount: number;
  transformedRecordCount: number;
  targetSchemaGaps: string[];
  unknownMappings: string[];
  packageManifestPath: string;
};

export async function runTransform(options: TransformOptions): Promise<TransformResult> {
  const firestoreDir = path.join(options.inputDir, "firestore");
  if (!existsSync(firestoreDir)) {
    throw new Error(`Missing firestore extract dir: ${firestoreDir}`);
  }

  mkdirSync(options.outputDir, { recursive: true });
  const awsImportDir = path.join(options.outputDir, "aws-import");
  mkdirSync(awsImportDir, { recursive: true });

  const gates: GateCounts = {
    UNKNOWN_TENANT: 0,
    UNKNOWN_TARGET: 0,
    DUPLICATE_TARGET_KEYS: 0,
    FATAL_TRANSFORM_ERRORS: 0,
    REQUIRED_PARENT_MISSING: 0,
    CROSS_TENANT_RELATIONSHIPS: 0,
  };
  const errors: TransformError[] = [];
  const recordCounts: Record<string, number> = {};
  const seenTargetKeys = new Set<string>();
  const idMap: IdMapEntry[] = [];
  const writers = new Map<
    string,
    { stream: ReturnType<typeof createWriteStream>; count: number }
  >();
  const siteIdsByTenant = new Map<string, Set<string>>();
  const personnelIdsByTenant = new Map<string, Set<string>>();
  let sourceDocumentCount = 0;
  let transformedRecordCount = 0;

  const getWriter = (targetEntity: string) => {
    const file = path.join(awsImportDir, entityFileName(targetEntity));
    let w = writers.get(file);
    if (!w) {
      w = { stream: createWriteStream(file, { flags: "w" }), count: 0 };
      writers.set(file, w);
    }
    return w;
  };

  const writeLine = async (targetEntity: string, obj: unknown) => {
    const w = getWriter(targetEntity);
    await new Promise<void>((resolve, reject) => {
      w.stream.write(`${JSON.stringify(obj)}\n`, (err) => (err ? reject(err) : resolve()));
    });
    w.count += 1;
    recordCounts[targetEntity] = (recordCounts[targetEntity] ?? 0) + 1;
    transformedRecordCount += 1;
  };

  const ndjsonFiles = readdirSync(firestoreDir)
    .filter((f) => f.endsWith(".ndjson"))
    .sort();
  const rootCollections = ndjsonFiles.map((f) => f.replace(/\.ndjson$/, ""));
  const unknownMappings = assertMatrixComplete(rootCollections);

  // Pass 1: index parents (sites, personnel) for relationship checks
  for (const file of ndjsonFiles) {
    const collection = file.replace(/\.ndjson$/, "");
    if (collection !== "sites" && collection !== "personnelRecords") continue;
    for await (const rec of readNdjson(path.join(firestoreDir, file))) {
      const { binding } = resolveAwsTenant(rec._migration.sourceTenantKey);
      const tenant = binding?.awsTenantId ?? "none";
      const id = rec._migration.documentId;
      if (collection === "sites") {
        if (!siteIdsByTenant.has(tenant)) siteIdsByTenant.set(tenant, new Set());
        siteIdsByTenant.get(tenant)!.add(id);
      } else {
        if (!personnelIdsByTenant.has(tenant)) personnelIdsByTenant.set(tenant, new Set());
        personnelIdsByTenant.get(tenant)!.add(id);
      }
    }
  }

  // Pass 2: transform
  for (const file of ndjsonFiles) {
    const collection = file.replace(/\.ndjson$/, "");
    const mapping = MATRIX_BY_COLLECTION.get(collection);
    if (!mapping) {
      gates.UNKNOWN_TARGET += 1;
      errors.push({
        severity: "FATAL",
        code: "UNKNOWN_TARGET",
        sourceCollection: collection,
        message: `No source-target matrix row for ${collection}`,
      });
      continue;
    }

    for await (const rec of readNdjson(path.join(firestoreDir, file))) {
      sourceDocumentCount += 1;
      const sourceTenantKey = pickEffectiveTenantKey(rec);
      const { binding, unknown } = resolveAwsTenant(sourceTenantKey);

      // Platform user/membership rows without tenant are excluded (not customer operational SoT)
      if (
        unknown &&
        (collection === "platformUsers" || collection === "organization_users") &&
        !sourceTenantKey
      ) {
        await writeLine("excluded/platform_users_unscoped", {
          targetEntity: "excluded/platform_users_unscoped",
          targetId: deterministicTargetId(collection, rec._migration.documentId),
          disposition: "EXCLUDE_WITH_APPROVAL",
          source: {
            system: "FIREBASE",
            collection,
            documentPath: rec._migration.documentPath,
            documentId: rec._migration.documentId,
            tenantKey: null,
          },
          migrationRunId: options.migrationRunId,
          data: normalizeFirestoreValue(rec.data),
        });
        continue;
      }

      if (options.customerOnly && mapping.disposition !== "GLOBAL") {
        const keepArchiveOrExclude =
          mapping.disposition === "EXCLUDE_WITH_APPROVAL" || mapping.disposition === "ARCHIVE";
        if (!keepArchiveOrExclude && !isCustomerImportTenant(binding) && !unknown) {
          continue;
        }
      }

      if (
        unknown &&
        mapping.disposition !== "GLOBAL" &&
        mapping.disposition !== "EXCLUDE_WITH_APPROVAL" &&
        mapping.disposition !== "ARCHIVE"
      ) {
        gates.UNKNOWN_TENANT += 1;
        errors.push({
          severity: "FATAL",
          code: "UNKNOWN_TENANT",
          sourceCollection: collection,
          sourceDocumentPath: rec._migration.documentPath,
          message: `Unknown tenant key: ${sourceTenantKey ?? "(null)"}`,
        });
        gates.FATAL_TRANSFORM_ERRORS += 1;
        continue;
      }

      const targetId = deterministicTargetId(collection, rec._migration.documentId);
      const dupKey = `${mapping.targetEntity}:${targetId}`;
      if (seenTargetKeys.has(dupKey)) {
        gates.DUPLICATE_TARGET_KEYS += 1;
        errors.push({
          severity: "FATAL",
          code: "DUPLICATE_TARGET_KEYS",
          sourceDocumentPath: rec._migration.documentPath,
          message: dupKey,
        });
        gates.FATAL_TRANSFORM_ERRORS += 1;
        continue;
      }
      seenTargetKeys.add(dupKey);

      const data = normalizeFirestoreValue(rec.data) as Record<string, unknown>;
      const facilityRef =
        (typeof data.siteId === "string" && data.siteId) ||
        (typeof data.locationId === "string" && data.locationId) ||
        null;

      if (
        facilityRef &&
        binding?.awsTenantId &&
        mapping.facilityKeyField &&
        mapping.facilityKeyField !== "self" &&
        mapping.implementationStatus === "READY"
      ) {
        const sites = siteIdsByTenant.get(binding.awsTenantId);
        if (sites && !sites.has(facilityRef)) {
          // Cross-check: may be source orphan or optional
          const crossTenant = [...siteIdsByTenant.entries()].some(
            ([tid, set]) => tid !== binding.awsTenantId && set.has(facilityRef),
          );
          if (crossTenant) {
            gates.CROSS_TENANT_RELATIONSHIPS += 1;
            errors.push({
              severity: "FATAL",
              code: "CROSS_TENANT_RELATIONSHIPS",
              sourceDocumentPath: rec._migration.documentPath,
              message: `siteId ${facilityRef} belongs to another tenant`,
            });
            gates.FATAL_TRANSFORM_ERRORS += 1;
            continue;
          }
          // Required parent missing only for READY transform domains that require facility
          if (
            ["incidents", "inspectionRecords", "assetRecords", "personnelRecords"].includes(
              collection,
            )
          ) {
            gates.REQUIRED_PARENT_MISSING += 1;
            errors.push({
              severity: "FATAL",
              code: "REQUIRED_PARENT_MISSING",
              sourceDocumentPath: rec._migration.documentPath,
              message: `Missing site parent ${facilityRef}`,
            });
            gates.FATAL_TRANSFORM_ERRORS += 1;
            continue;
          }
        }
      }

      const outRecord = {
        targetEntity: mapping.targetEntity,
        targetId,
        awsTenantId: binding?.awsTenantId ?? null,
        awsTenantKey: binding?.awsTenantKey ?? null,
        source: {
          system: "FIREBASE",
          collection: collection,
          documentPath: rec._migration.documentPath,
          documentId: rec._migration.documentId,
          tenantKey: sourceTenantKey,
          createTime: rec._migration.documentCreateTime ?? null,
          updateTime: rec._migration.documentUpdateTime ?? null,
        },
        disposition: mapping.disposition,
        implementationStatus: mapping.implementationStatus,
        migrationRunId: options.migrationRunId,
        data,
      };

      await writeLine(mapping.targetEntity, outRecord);
      idMap.push({
        sourceSystem: "FIREBASE",
        sourceCollection: collection,
        sourceDocumentPath: rec._migration.documentPath,
        sourceDocumentId: rec._migration.documentId,
        sourceTenantKey,
        targetEntity: mapping.targetEntity,
        targetId,
        migrationRunId: options.migrationRunId,
      });
    }
  }

  // Close writers
  await Promise.all(
    [...writers.values()].map(
      (w) =>
        new Promise<void>((resolve, reject) => {
          w.stream.end(() => resolve());
          w.stream.on("error", reject);
        }),
    ),
  );

  // id-map + errors
  const idMapPath = path.join(awsImportDir, "id-map.ndjson");
  writeFileSync(
    idMapPath,
    idMap.map((e) => JSON.stringify(e)).join("\n") + (idMap.length ? "\n" : ""),
  );
  const errorsPath = path.join(awsImportDir, "errors.ndjson");
  writeFileSync(
    errorsPath,
    errors.map((e) => JSON.stringify(e)).join("\n") + (errors.length ? "\n" : ""),
  );

  const fileChecksums: Record<string, string> = {};
  for (const f of readdirSync(awsImportDir)) {
    if (!f.endsWith(".ndjson") && f !== "manifest.json") continue;
    const p = path.join(awsImportDir, f);
    fileChecksums[f] = createHash("sha256").update(readFileSync(p)).digest("hex");
  }

  const sourceManifestPath = path.join(options.inputDir, "manifest.json");
  const sourceManifestSha = existsSync(sourceManifestPath)
    ? createHash("sha256").update(readFileSync(sourceManifestPath)).digest("hex")
    : null;

  const packageManifest = {
    migrationRunId: options.migrationRunId,
    sprint: "DM-S2",
    toolVersion: TOOL_VERSION,
    gitSha: options.gitSha,
    sourcePackageDir: options.inputDir,
    sourceManifestSha256: sourceManifestSha,
    targetSchemaVersion: "industrial-live-ind11-contract-v1",
    generatedAt: new Date().toISOString(),
    sourceDocumentCount,
    transformedRecordCount,
    idMapCount: idMap.length,
    recordCounts,
    gates,
    targetSchemaGaps: TARGET_SCHEMA_GAPS,
    unknownMappings,
    awsImport: "NOT_RUN",
    checksums: fileChecksums,
  };

  const packageManifestPath = path.join(awsImportDir, "manifest.json");
  writeFileSync(packageManifestPath, `${JSON.stringify(packageManifest, null, 2)}\n`);
  fileChecksums["manifest.json"] = createHash("sha256")
    .update(readFileSync(packageManifestPath))
    .digest("hex");
  packageManifest.checksums = fileChecksums;
  writeFileSync(packageManifestPath, `${JSON.stringify(packageManifest, null, 2)}\n`);

  gates.FATAL_TRANSFORM_ERRORS = errors.filter((e) => e.severity === "FATAL").length;

  return {
    gates,
    errors,
    recordCounts,
    idMapCount: idMap.length,
    sourceDocumentCount,
    transformedRecordCount,
    targetSchemaGaps: TARGET_SCHEMA_GAPS,
    unknownMappings,
    packageManifestPath,
  };
}
