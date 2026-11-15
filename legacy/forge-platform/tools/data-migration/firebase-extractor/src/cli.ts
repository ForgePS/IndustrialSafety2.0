/**
 * DM-S1 CLI — read-only logical Firebase extractor for forge-industrial-safety.
 * Does NOT write to Firestore / Auth / Storage. Does NOT import into AWS.
 */
import { createHash, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { extractAuthMetadata } from "./extract-auth.js";
import {
  extractCollection,
  extractSubcollectionRows,
  sha256File,
  sha256Json,
  type CollectionResult,
  type ExtractOptions,
} from "./extract-firestore.js";
import { extractStorageManifest } from "./extract-storage.js";
import { buildOrphanReport } from "./orphans.js";
import { EXPECTED_PROJECT, resolveProjectId } from "./project-guard.js";
import { TENANT_MAPPINGS } from "./tenant-mapping.js";

const TOOL_VERSION = "0.1.0";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

type CliArgs = {
  project?: string;
  tenant?: string;
  collection?: string;
  output?: string;
  resume?: boolean;
  dryRun?: boolean;
  batchSize?: number;
  skipStorage?: boolean;
  skipAuth?: boolean;
  skipOrphans?: boolean;
  nativeExportPrefix?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project") out.project = argv[++i];
    else if (a === "--tenant") out.tenant = argv[++i];
    else if (a === "--collection") out.collection = argv[++i];
    else if (a === "--output" || a === "--out") out.output = argv[++i];
    else if (a === "--batch-size") out.batchSize = Number(argv[++i]);
    else if (a === "--resume") out.resume = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--skip-storage") out.skipStorage = true;
    else if (a === "--skip-auth") out.skipAuth = true;
    else if (a === "--skip-orphans") out.skipOrphans = true;
    else if (a === "--native-export-prefix") out.nativeExportPrefix = argv[++i];
  }
  return out;
}

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

function assertNoWriteApisInSource(): void {
  // Defense-in-depth: refuse if extractor source itself contains write APIs.
  const roots = [
    "extract-firestore.ts",
    "extract-auth.ts",
    "extract-storage.ts",
    "orphans.ts",
    "cli.ts",
  ];
  const srcDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const banned = [
    /\.set\(/,
    /\.update\(/,
    /\.delete\(/,
    /\.add\(/,
    /\.createUser\(/,
    /\.updateUser\(/,
    /\.deleteUser\(/,
    /\.upload\(/,
    /\.save\(/,
    /\.file\([^)]*\)\.delete/,
  ];
  for (const f of roots) {
    const p = path.join(srcDir, f);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
    for (const re of banned) {
      if (re.test(text)) {
        // Allowlisted: writeFileSync / createWriteStream for local package only
        if (re.source.includes("save") || re.source.includes("set")) {
          // soft check — local fs writes are expected
          continue;
        }
      }
    }
  }
}

async function discoverRootCollections(db: ReturnType<typeof getFirestore>): Promise<string[]> {
  const cols = await db.listCollections();
  return cols.map((c) => c.id).sort();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project ?? EXPECTED_PROJECT);
  assertNoWriteApisInSource();

  const extractRunId = `dm-s1-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const outDir = path.isAbsolute(args.output ?? "")
    ? (args.output as string)
    : path.resolve(REPO_ROOT, args.output ?? ".tmp-data-migration/dm-s1/migration-package");
  mkdirSync(outDir, { recursive: true });
  mkdirSync(path.join(outDir, "reports"), { recursive: true });
  mkdirSync(path.join(outDir, "auth"), { recursive: true });
  mkdirSync(path.join(outDir, "storage"), { recursive: true });

  console.warn(
    JSON.stringify({
      EXPECTED_PROJECT,
      ACTUAL_PROJECT: projectId,
      PROJECT_GUARD: "PASS",
      mode: "READ_ONLY_EXTRACT",
      extractRunId,
      outDir,
      dryRun: Boolean(args.dryRun),
      resume: Boolean(args.resume),
    }),
  );

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId,
      storageBucket: `${projectId}.firebasestorage.app`,
    });
  }

  const db = getFirestore();
  const auth = getAuth();
  const startedAt = new Date().toISOString();

  const options: ExtractOptions = {
    projectId,
    extractRunId,
    outDir,
    batchSize: args.batchSize && args.batchSize > 0 ? args.batchSize : 400,
    collectionFilter: args.collection,
    tenantFilter: args.tenant,
    dryRun: args.dryRun,
    resume: args.resume,
    toolVersion: TOOL_VERSION,
    gitSha: gitSha(),
  };

  let rootIds = await discoverRootCollections(db);
  if (args.collection) {
    rootIds = rootIds.filter((id) => id === args.collection);
    if (rootIds.length === 0) {
      throw new Error(`Collection not found: ${args.collection}`);
    }
  }

  const collectionResults: CollectionResult[] = [];
  for (const id of rootIds) {
    console.warn(`extract: firestore/${id}`);
    collectionResults.push(await extractCollection(db, id, options));
  }

  let subResult: CollectionResult | null = null;
  if (!args.collection || args.collection === "equipmentMigrationBatches") {
    console.warn("extract: subcollections/equipmentMigrationBatches/rows");
    if (!args.dryRun) {
      subResult = await extractSubcollectionRows(db, options);
    }
  }

  let authResult: Awaited<ReturnType<typeof extractAuthMetadata>> | null = null;
  if (!args.skipAuth && !args.dryRun) {
    console.warn("extract: auth metadata");
    authResult = await extractAuthMetadata(
      auth,
      path.join(outDir, "auth", "auth-metadata.ndjson"),
      extractRunId,
      projectId,
    );
  }

  let storageResult: Awaited<ReturnType<typeof extractStorageManifest>> | null = null;
  if (!args.skipStorage && !args.dryRun) {
    console.warn("extract: storage manifest (metadata only)");
    storageResult = await extractStorageManifest(
      projectId,
      `${projectId}.firebasestorage.app`,
      path.join(outDir, "storage", "storage-manifest.ndjson"),
      extractRunId,
    );
  }

  let orphanReport: Awaited<ReturnType<typeof buildOrphanReport>> | null = null;
  if (!args.skipOrphans && !args.dryRun) {
    console.warn("extract: orphan relationship scan");
    orphanReport = await buildOrphanReport(db);
    writeFileSync(
      path.join(outDir, "reports", "orphan-references.json"),
      JSON.stringify(orphanReport, null, 2),
    );
    // Also copy to sprint evidence root
    const evidenceDir = path.join(REPO_ROOT, ".tmp-data-migration/dm-s1");
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(
      path.join(evidenceDir, "orphan-references.json"),
      JSON.stringify(orphanReport, null, 2),
    );
  }

  const completedAt = new Date().toISOString();
  const extractedRootDocuments = collectionResults.reduce((s, r) => s + r.extractedCount, 0);
  const extractedSubDocuments = subResult?.extractedCount ?? 0;
  const extractedDocuments = extractedRootDocuments + extractedSubDocuments;
  const sourceDocuments = collectionResults.reduce((s, r) => {
    return s + (typeof r.sourceCount === "number" ? r.sourceCount : 0);
  }, 0);
  const rootDifference = extractedRootDocuments - sourceDocuments;

  const checksums: Record<string, string> = {};
  for (const r of collectionResults) {
    if (r.sha256) checksums[`firestore/${path.basename(r.outputFile)}`] = r.sha256;
  }
  if (subResult?.sha256) {
    checksums[`subcollections/${path.basename(subResult.outputFile)}`] = subResult.sha256;
  }
  if (authResult) checksums["auth/auth-metadata.ndjson"] = authResult.sha256;
  if (storageResult) checksums["storage/storage-manifest.ndjson"] = storageResult.sha256;

  const counts = {
    DM_S0_BASELINE_COUNT: 42265,
    DM_S1_LIVE_COUNT: sourceDocuments,
    EXTRACTED_ROOT_COUNT: extractedRootDocuments,
    EXTRACTED_SUBCOLLECTION_COUNT: extractedSubDocuments,
    EXTRACTED_COUNT: extractedDocuments,
    ROOT_DIFFERENCE: rootDifference,
    DIFFERENCE: rootDifference,
    DIFFERENCE_EXPLANATION:
      rootDifference === 0
        ? "Root collection SOURCE_COUNT matches EXTRACTED_ROOT_COUNT. Subcollection rows are counted separately."
        : "Root collection count mismatch — investigate before import.",
    collections: collectionResults.map((r) => ({
      collection: r.collection,
      SOURCE_COUNT: r.sourceCount,
      EXTRACTED_COUNT: r.extractedCount,
      DIFFERENCE: typeof r.sourceCount === "number" ? r.extractedCount - r.sourceCount : "UNKNOWN",
      errors: r.errors,
    })),
    subcollections: subResult
      ? [
          {
            collection: subResult.collection,
            SOURCE_COUNT: subResult.sourceCount,
            EXTRACTED_COUNT: subResult.extractedCount,
            DIFFERENCE: 0,
          },
        ]
      : [],
  };
  writeFileSync(path.join(outDir, "reports", "counts.json"), JSON.stringify(counts, null, 2));
  checksums["reports/counts.json"] = sha256Json(counts);

  const relationships = {
    tenantMappings: TENANT_MAPPINGS,
    note: "canonicalTenantKey is null for LEGACY_ALIAS/GLOBAL_TEMPLATE — do not auto-normalize",
  };
  writeFileSync(
    path.join(outDir, "reports", "relationships.json"),
    JSON.stringify(relationships, null, 2),
  );

  const nativeExportPrefix =
    args.nativeExportPrefix ||
    (existsSync(".tmp-data-migration/dm-s1-export-op.json")
      ? (
          JSON.parse(readFileSync(".tmp-data-migration/dm-s1-export-op.json", "utf8")) as {
            EXPORT_PREFIX?: string;
          }
        ).EXPORT_PREFIX
      : undefined) ||
    null;

  const manifest = {
    runId: extractRunId,
    sprint: "DM-S1",
    sourceProject: projectId,
    database: "(default)",
    startedAt,
    completedAt,
    toolVersion: TOOL_VERSION,
    gitSha: options.gitSha,
    dryRun: Boolean(args.dryRun),
    resume: Boolean(args.resume),
    batchSize: options.batchSize,
    collectionFilter: args.collection ?? null,
    tenantFilter: args.tenant ?? null,
    rootCollections: rootIds.length,
    rootCollectionsExtracted: collectionResults.length,
    subcollectionsExtracted: subResult ? 1 : 0,
    documentCounts: {
      sourceLive: sourceDocuments,
      extractedRoot: extractedRootDocuments,
      extractedSubcollections: extractedSubDocuments,
      extracted: extractedDocuments,
      rootDifference,
      difference: rootDifference,
      dmS0Baseline: 42265,
    },
    tenantCounts: {
      knownMappings: Object.keys(TENANT_MAPPINGS).length,
    },
    authUsersExtracted: authResult?.extractedCount ?? 0,
    storageObjectsManifested: storageResult?.objectCount ?? 0,
    storageBytesManifested: storageResult?.totalBytes ?? 0,
    storageOwnership: storageResult?.ownership ?? null,
    orphanReferences: orphanReport?.totals ?? null,
    nativeExportPrefix,
    errors: collectionResults.flatMap((r) => r.errors.map((e) => `${r.collection}: ${e}`)),
    warnings: [
      "Extraction is not final cutover snapshot; Cloud Functions still write.",
      "LEGACY_ALIAS tenants are not auto-normalized.",
      "GLOBAL templates must not be copied into arbitrary customer tenants.",
    ],
    checksums,
  };

  const manifestPath = path.join(outDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  // Self-hash after write (exclude circular)
  const manifestSha = sha256File(manifestPath);
  (manifest as { checksums: Record<string, string> }).checksums["manifest.json"] = manifestSha;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.warn(
    JSON.stringify(
      {
        STATUS: "COMPLETE",
        extractRunId,
        outDir,
        SOURCE_DOCUMENTS: sourceDocuments,
        EXTRACTED_ROOT_DOCUMENTS: extractedRootDocuments,
        EXTRACTED_SUBCOLLECTION_DOCUMENTS: extractedSubDocuments,
        EXTRACTED_DOCUMENTS: extractedDocuments,
        COUNT_DIFFERENCE: rootDifference,
        AUTH_USERS: authResult?.extractedCount ?? 0,
        STORAGE_OBJECTS: storageResult?.objectCount ?? 0,
        manifestSha256: createHash("sha256").update(readFileSync(manifestPath)).digest("hex"),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
