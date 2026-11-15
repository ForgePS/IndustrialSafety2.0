import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Firestore, Query } from "firebase-admin/firestore";
import { serializeDocumentData } from "./serialize.js";
import { classifySourceTenantKey, pickSourceTenantKey } from "./tenant-mapping.js";

export type ExtractOptions = {
  projectId: string;
  extractRunId: string;
  outDir: string;
  batchSize: number;
  collectionFilter?: string;
  tenantFilter?: string;
  dryRun?: boolean;
  resume?: boolean;
  toolVersion: string;
  gitSha: string;
};

export type CollectionResult = {
  collection: string;
  sourceCount: number | "UNKNOWN";
  extractedCount: number;
  outputFile: string;
  sha256: string | null;
  errors: string[];
};

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export async function countCollection(
  db: Firestore,
  collectionPath: string,
): Promise<number | "UNKNOWN"> {
  try {
    const agg = await db.collection(collectionPath).count().get();
    return agg.data().count;
  } catch {
    return "UNKNOWN";
  }
}

export async function extractCollection(
  db: Firestore,
  collectionId: string,
  options: ExtractOptions,
): Promise<CollectionResult> {
  const firestoreDir = path.join(options.outDir, "firestore");
  mkdirSync(firestoreDir, { recursive: true });
  const outputFile = path.join(firestoreDir, `${safeFileName(collectionId)}.ndjson`);
  const checkpointFile = path.join(
    options.outDir,
    ".checkpoints",
    `${safeFileName(collectionId)}.json`,
  );
  mkdirSync(path.dirname(checkpointFile), { recursive: true });

  const sourceCount = await countCollection(db, collectionId);
  let extractedCount = 0;
  let lastDocId: string | null = null;
  const errors: string[] = [];

  if (options.resume && existsSync(checkpointFile) && existsSync(outputFile)) {
    const cp = JSON.parse(readFileSync(checkpointFile, "utf8")) as {
      lastDocId: string | null;
      extractedCount: number;
    };
    lastDocId = cp.lastDocId;
    extractedCount = cp.extractedCount;
  } else if (!options.dryRun) {
    writeFileSync(outputFile, "");
  }

  if (options.dryRun) {
    return {
      collection: collectionId,
      sourceCount,
      extractedCount: 0,
      outputFile,
      sha256: null,
      errors: [],
    };
  }

  const stream = createWriteStream(outputFile, { flags: options.resume && lastDocId ? "a" : "w" });
  const writeLine = (obj: unknown) =>
    new Promise<void>((resolve, reject) => {
      stream.write(`${JSON.stringify(obj)}\n`, (err) => (err ? reject(err) : resolve()));
    });

  while (true) {
    let q: Query = db.collection(collectionId).orderBy("__name__").limit(options.batchSize);
    if (lastDocId) {
      const cursor = await db.collection(collectionId).doc(lastDocId).get();
      if (cursor.exists) q = q.startAfter(cursor);
    }
    const page = await q.get();
    if (page.empty) break;

    for (const doc of page.docs) {
      const data = doc.data() as Record<string, unknown>;
      const sourceTenantKey = pickSourceTenantKey(data);
      const mapping = classifySourceTenantKey(sourceTenantKey);
      if (options.tenantFilter) {
        const allowed =
          sourceTenantKey === options.tenantFilter ||
          mapping.canonicalTenantKey === options.tenantFilter;
        if (!allowed) {
          lastDocId = doc.id;
          continue;
        }
      }

      const record = {
        _migration: {
          sourceSystem: "FIRESTORE",
          sourceProject: options.projectId,
          database: "(default)",
          collection: collectionId,
          documentId: doc.id,
          documentPath: doc.ref.path,
          sourceTenantKey,
          canonicalTenantKey: mapping.canonicalTenantKey,
          tenantClassification: mapping.classification,
          extractedAt: new Date().toISOString(),
          extractRunId: options.extractRunId,
          documentCreateTime: doc.createTime?.toDate().toISOString() ?? null,
          documentUpdateTime: doc.updateTime?.toDate().toISOString() ?? null,
        },
        data: serializeDocumentData(data),
      };

      try {
        await writeLine(record);
        extractedCount += 1;
      } catch (e) {
        errors.push(e instanceof Error ? e.message.slice(0, 200) : "write_failed");
      }
      lastDocId = doc.id;
    }

    writeFileSync(
      checkpointFile,
      JSON.stringify({ lastDocId, extractedCount, at: new Date().toISOString() }, null, 2),
    );
    if (page.size < options.batchSize) break;
  }

  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });

  const sha256 = sha256File(outputFile);
  return {
    collection: collectionId,
    sourceCount,
    extractedCount,
    outputFile,
    sha256,
    errors,
  };
}

export async function extractSubcollectionRows(
  db: Firestore,
  options: ExtractOptions,
): Promise<CollectionResult> {
  const subDir = path.join(options.outDir, "subcollections");
  mkdirSync(subDir, { recursive: true });
  const outputFile = path.join(subDir, "equipmentMigrationBatches__rows.ndjson");
  writeFileSync(outputFile, "");
  const stream = createWriteStream(outputFile, { flags: "w" });
  let extractedCount = 0;
  const errors: string[] = [];

  const parents = await db.collection("equipmentMigrationBatches").select().get();
  for (const parent of parents.docs) {
    let lastId: string | null = null;
    while (true) {
      let q: Query = parent.ref.collection("rows").orderBy("__name__").limit(options.batchSize);
      if (lastId) {
        const cursor = await parent.ref.collection("rows").doc(lastId).get();
        if (cursor.exists) q = q.startAfter(cursor);
      }
      const page = await q.get();
      if (page.empty) break;
      for (const doc of page.docs) {
        const data = doc.data() as Record<string, unknown>;
        const sourceTenantKey = pickSourceTenantKey(data);
        const mapping = classifySourceTenantKey(sourceTenantKey);
        const record = {
          _migration: {
            sourceSystem: "FIRESTORE",
            sourceProject: options.projectId,
            database: "(default)",
            collection: "equipmentMigrationBatches/rows",
            documentId: doc.id,
            documentPath: doc.ref.path,
            parentCollection: "equipmentMigrationBatches",
            parentDocumentId: parent.id,
            sourceTenantKey,
            canonicalTenantKey: mapping.canonicalTenantKey,
            tenantClassification: mapping.classification,
            extractedAt: new Date().toISOString(),
            extractRunId: options.extractRunId,
            documentCreateTime: doc.createTime?.toDate().toISOString() ?? null,
            documentUpdateTime: doc.updateTime?.toDate().toISOString() ?? null,
          },
          data: serializeDocumentData(data),
        };
        await new Promise<void>((resolve, reject) => {
          stream.write(`${JSON.stringify(record)}\n`, (err) => (err ? reject(err) : resolve()));
        });
        extractedCount += 1;
        lastId = doc.id;
      }
      if (page.size < options.batchSize) break;
    }
  }

  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });

  return {
    collection: "equipmentMigrationBatches/rows",
    sourceCount: extractedCount,
    extractedCount,
    outputFile,
    sha256: sha256File(outputFile),
    errors,
  };
}

export function sha256File(filePath: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
