/**
 * DM-S2 CLI — Firebase extract → AWS import package.
 * Does NOT write Aurora, Cognito, customer S3 production, or Firebase.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { runTransform, TOOL_VERSION } from "./transform.js";
import {
  SOURCE_TARGET_MATRIX,
  TARGET_SCHEMA_GAPS,
  TARGET_MISSING,
} from "./source-target-matrix.js";
import { AUTHORITATIVE_CUSTOMER_AWS_TENANT } from "./tenant-map.js";
import { dryValidateImportPackage } from "./dry-validate.js";

type CliArgs = {
  input?: string;
  output?: string;
  customerOnly?: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" || a === "--in") out.input = argv[++i];
    else if (a === "--output" || a === "--out") out.output = argv[++i];
    else if (a === "--customer-only") out.customerOnly = true;
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const resolveFromRepo = (p: string) => (path.isAbsolute(p) ? p : path.resolve(repoRoot, p));
  const inputDir = resolveFromRepo(args.input ?? ".tmp-data-migration/dm-s1/migration-package");
  const runId = `dm-s2-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const outputDir = resolveFromRepo(args.output ?? path.join(".tmp-data-migration/dm-s2", runId));

  if (!existsSync(inputDir)) {
    throw new Error(`Input package not found: ${inputDir}`);
  }
  mkdirSync(outputDir, { recursive: true });

  process.stdout.write(
    `${JSON.stringify(
      {
        phase: "START",
        toolVersion: TOOL_VERSION,
        runId,
        inputDir,
        outputDir,
        matrixRows: SOURCE_TARGET_MATRIX.length,
        targetSchemaGaps: TARGET_SCHEMA_GAPS.length,
        authoritativeCustomerAwsTenant: AUTHORITATIVE_CUSTOMER_AWS_TENANT,
        writes: {
          aurora: false,
          cognito: false,
          customerProductionS3: false,
          firebase: false,
        },
      },
      null,
      2,
    )}\n`,
  );

  const result = await runTransform({
    inputDir,
    outputDir,
    migrationRunId: runId,
    gitSha: gitSha(),
    customerOnly: Boolean(args.customerOnly),
  });

  const dry = dryValidateImportPackage(outputDir);

  const dispositionBuckets = {
    AURORA_OPERATIONAL_SOURCE_DOCS: dry.dispositionCounts.AURORA_OPERATIONAL,
    AURORA_HISTORY_SOURCE_DOCS: dry.dispositionCounts.AURORA_HISTORY,
    S3_ARCHIVE_SOURCE_DOCS: dry.dispositionCounts.S3_ARCHIVE,
    PLATFORM_GLOBAL_SOURCE_DOCS: dry.dispositionCounts.PLATFORM_GLOBAL,
    EXCLUDE_APPROVED_SOURCE_DOCS: dry.dispositionCounts.EXCLUDE_APPROVED,
  };
  const accounted =
    dispositionBuckets.AURORA_OPERATIONAL_SOURCE_DOCS +
    dispositionBuckets.AURORA_HISTORY_SOURCE_DOCS +
    dispositionBuckets.S3_ARCHIVE_SOURCE_DOCS +
    dispositionBuckets.PLATFORM_GLOBAL_SOURCE_DOCS +
    dispositionBuckets.EXCLUDE_APPROVED_SOURCE_DOCS;

  const readiness = {
    SOURCE_FIRESTORE_DOCUMENTS: result.sourceDocumentCount,
    TRANSFORMED_RECORDS: result.transformedRecordCount,
    SOURCE_DOCS_ACCOUNTED_FOR: accounted,
    UNACCOUNTED_SOURCE_DOCS: result.sourceDocumentCount - accounted,
    ...dispositionBuckets,
    TOTAL_ACCOUNTED: accounted,
    TENANT_MAPPING:
      result.gates.UNKNOWN_TENANT === 0 && result.unknownMappings.length === 0 ? "PASS" : "FAIL",
    TARGET_SCHEMA: TARGET_SCHEMA_GAPS.length === 0 && TARGET_MISSING.length === 0 ? "PASS" : "FAIL",
    TRANSFORMER:
      result.gates.FATAL_TRANSFORM_ERRORS === 0 && result.unknownMappings.length === 0
        ? "PASS"
        : "FAIL",
    RELATIONSHIPS:
      result.gates.REQUIRED_PARENT_MISSING === 0 && result.gates.CROSS_TENANT_RELATIONSHIPS === 0
        ? "PASS"
        : "FAIL",
    UNKNOWN_MAPPINGS: result.unknownMappings,
    FATAL_ERRORS: result.errors.filter((e) => e.severity === "FATAL").slice(0, 50),
    GATES: result.gates,
    TARGET_SCHEMA_GAPS: TARGET_SCHEMA_GAPS,
    TARGET_MISSING: TARGET_MISSING,
    IMPORT_DRY_VALIDATION: dry.ok ? "PASS" : "FAIL",
    DRY_VALIDATION: dry,
    PACKAGE_MANIFEST: result.packageManifestPath,
  };

  writeFileSync(
    path.join(outputDir, "import-readiness.json"),
    `${JSON.stringify(readiness, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify({ phase: "COMPLETE", readiness }, null, 2)}\n`);

  const hardFail =
    result.gates.UNKNOWN_TENANT > 0 ||
    result.gates.UNKNOWN_TARGET > 0 ||
    result.gates.DUPLICATE_TARGET_KEYS > 0 ||
    result.unknownMappings.length > 0 ||
    !dry.ok ||
    accounted !== result.sourceDocumentCount;

  if (hardFail) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
