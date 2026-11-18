/** Storage metadata manifest — list only, no downloads, no signed URLs. */
import { createWriteStream } from "node:fs";
import { Storage } from "@google-cloud/storage";
import { sha256File } from "./extract-firestore.js";
import { inferOwnership } from "./storage-ownership.js";

export type StorageManifestResult = {
  objectCount: number;
  totalBytes: number;
  outputFile: string;
  sha256: string;
  ownership: Record<string, number>;
};

export { inferOwnership } from "./storage-ownership.js";

export async function extractStorageManifest(
  projectId: string,
  bucketName: string,
  outputFile: string,
  extractRunId: string,
): Promise<StorageManifestResult> {
  const storage = new Storage({ projectId });
  const bucket = storage.bucket(bucketName);
  const stream = createWriteStream(outputFile, { flags: "w" });
  let objectCount = 0;
  let totalBytes = 0;
  const ownership: Record<string, number> = {};

  const write = (obj: unknown) =>
    new Promise<void>((resolve, reject) => {
      stream.write(`${JSON.stringify(obj)}\n`, (err) => (err ? reject(err) : resolve()));
    });

  for await (const file of bucket.getFilesStream({ autoPaginate: true })) {
    const objectPath = file.name || "";
    const size = Number(file.metadata?.size ?? 0);
    totalBytes += size;
    objectCount += 1;
    const own = inferOwnership(objectPath);
    ownership[own.disposition] = (ownership[own.disposition] ?? 0) + 1;

    await write({
      _migration: {
        sourceSystem: "FIREBASE_STORAGE",
        sourceProject: projectId,
        extractRunId,
        extractedAt: new Date().toISOString(),
      },
      data: {
        sourceBucket: bucketName,
        sourceObjectPath: objectPath,
        size,
        contentType: file.metadata?.contentType ?? null,
        generation: file.metadata?.generation ?? null,
        md5Hash: file.metadata?.md5Hash ?? null,
        crc32c: file.metadata?.crc32c ?? null,
        created: file.metadata?.timeCreated ?? null,
        updated: file.metadata?.updated ?? null,
        metadata: file.metadata?.metadata ?? null,
        tenantMapping: own.tenantMapping,
        relatedEntity: own.relatedEntity,
        relatedEntityId: null,
        migrationDisposition: own.disposition,
      },
    });
  }

  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });

  return {
    objectCount,
    totalBytes,
    outputFile,
    sha256: sha256File(outputFile),
    ownership,
  };
}
