/**
 * DM-S0 CLI — read-only inventory for forge-industrial-safety only.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { inventoryAuth } from "./auth-inventory.js";
import { discoverBusinessIds, inventoryRootCollections } from "./firestore-inventory.js";
import { EXPECTED_PROJECT, resolveProjectId } from "./project-guard.js";
import { inventoryStorage } from "./storage-inventory.js";

function parseArgs(argv: string[]) {
  const out: { project?: string; outDir?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project") out.project = argv[++i];
    else if (a === "--out") out.outDir = argv[++i];
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project ?? EXPECTED_PROJECT);

  console.warn(
    JSON.stringify({
      EXPECTED_PROJECT,
      ACTUAL_PROJECT: projectId,
      PROJECT_GUARD: "PASS",
      mode: "READ_ONLY",
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

  console.warn("inventory: firestore…");
  const { collections, subcollections } = await inventoryRootCollections(db);
  console.warn("inventory: tenants…");
  const tenants = await discoverBusinessIds(db, collections);
  console.warn("inventory: auth…");
  const authSummary = await inventoryAuth(auth);
  console.warn("inventory: storage…");
  const storage = await inventoryStorage(projectId);

  const firestoreDocsTotal = collections.reduce((sum, c) => {
    return sum + (typeof c.count === "number" ? c.count : 0);
  }, 0);

  const customerStorage = storage.buckets.find((b) => b.bucketName.includes("firebasestorage.app"));

  const summary = {
    sprint: "DM-S0",
    at: new Date().toISOString(),
    projectId,
    firestore: {
      database: "(default)",
      location: "nam5",
      mode: "FIRESTORE_NATIVE",
      rootCollections: collections.length,
      documentsTotalKnown: firestoreDocsTotal,
      unknownCountCollections: collections
        .filter((c) => c.count === "UNKNOWN")
        .map((c) => c.collection),
    },
    tenantsTotal: tenants.length,
    auth: {
      totalUsers: authSummary.totalUsers,
      enabledUsers: authSummary.enabledUsers,
      disabledUsers: authSummary.disabledUsers,
    },
    storage: {
      buckets: storage.buckets.map((b) => b.bucketName),
      exportBuckets: storage.exportBuckets,
      customerObjects: customerStorage?.objectCount ?? null,
      customerBytes: customerStorage?.totalBytes ?? null,
    },
    deltaSafe: collections.filter((c) => c.deltaClass === "DELTA_SAFE").map((c) => c.collection),
    deltaUnsafe: collections
      .filter((c) => c.deltaClass === "DELTA_UNSAFE")
      .map((c) => c.collection),
    unscopedCollections: collections
      .filter((c) => !c.tenantScoped && (typeof c.count === "number" ? c.count > 0 : true))
      .map((c) => c.collection),
  };

  const outDir = path.resolve(args.outDir ?? ".tmp-data-migration/dm-s0");
  mkdirSync(outDir, { recursive: true });
  const write = (name: string, data: unknown) => {
    writeFileSync(path.join(outDir, name), JSON.stringify(data, null, 2));
  };

  write("inventory-summary.json", summary);
  write("collections.json", collections);
  write("subcollections.json", subcollections);
  write(
    "schema-profile.json",
    collections.map((c) => ({
      collection: c.collection,
      drift: c.drift,
      fields: c.schema.map((f) => ({
        fieldName: f.fieldName,
        observedTypes: f.observedTypes,
        presence: f.presence,
      })),
    })),
  );
  write("tenant-inventory.json", tenants);
  write("auth-summary.json", authSummary);
  write("storage-summary.json", storage);
  write("delta-readiness.json", {
    deltaSafe: summary.deltaSafe,
    deltaUnsafe: summary.deltaUnsafe,
    partial: collections.filter((c) => c.deltaClass === "PARTIAL").map((c) => c.collection),
  });
  write(
    "relationships.json",
    collections.map((c) => ({
      sourceCollection: c.collection,
      referenceFields: c.referenceFields,
      fileFields: c.fileFields,
    })),
  );

  console.warn(JSON.stringify({ status: "ok", outDir, summary }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
