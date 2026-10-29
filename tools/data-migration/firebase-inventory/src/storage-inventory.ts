/** Firebase / GCS storage metadata inventory — list only, no downloads. */
import { Storage } from "@google-cloud/storage";

export type BucketSummary = {
  bucketName: string;
  purpose: string;
  objectCount: number;
  totalBytes: number;
  tenantScopingMethod: string;
  topPrefixes: Array<{ prefix: string; count: number; bytes: number }>;
  byExtension: Record<string, number>;
  byMime: Record<string, number>;
  zeroByteObjects: number;
  largeObjectsOver50MiB: number;
  notes: string;
};

function purposeForBucket(name: string): string {
  if (name.includes("firebasestorage.app") || name.endsWith(".appspot.com")) {
    return "Firebase Storage customer/application files";
  }
  if (
    name.includes("firestore-migration") ||
    name.includes("data_migration") ||
    name.includes("data_export")
  ) {
    return "Firestore export / migration staging";
  }
  if (name.includes("gcf-v2")) return "Cloud Functions source/uploads (non-customer app data)";
  return "Other GCS bucket";
}

function inferTenantScoping(prefixes: string[]): string {
  if (
    prefixes.some(
      (p) =>
        p.startsWith("tenants/") || p.startsWith("module-attachments/") || p.includes("business-"),
    )
  ) {
    return "path-prefix businessId/tenant segments";
  }
  return "UNKNOWN / bucket-level";
}

export async function inventoryStorage(projectId: string): Promise<{
  buckets: BucketSummary[];
  exportBuckets: string[];
}> {
  const storage = new Storage({ projectId });
  const [bucketList] = await storage.getBuckets();
  const buckets: BucketSummary[] = [];
  const exportBuckets: string[] = [];

  for (const bucket of bucketList) {
    const name = bucket.name;
    if (purposeForBucket(name).includes("migration") || purposeForBucket(name).includes("export")) {
      exportBuckets.push(name);
    }

    // Skip deep inventory of GCF source buckets (not customer data)
    if (name.includes("gcf-v2")) {
      buckets.push({
        bucketName: name,
        purpose: purposeForBucket(name),
        objectCount: 0,
        totalBytes: 0,
        tenantScopingMethod: "N/A",
        topPrefixes: [],
        byExtension: {},
        byMime: {},
        zeroByteObjects: 0,
        largeObjectsOver50MiB: 0,
        notes: "Skipped deep listing (functions infrastructure)",
      });
      continue;
    }

    let objectCount = 0;
    let totalBytes = 0;
    let zeroByteObjects = 0;
    let largeObjectsOver50MiB = 0;
    const prefixCounts = new Map<string, { count: number; bytes: number }>();
    const byExtension: Record<string, number> = {};
    const byMime: Record<string, number> = {};

    // Stream metadata only
    for await (const file of bucket.getFilesStream({ autoPaginate: true })) {
      objectCount += 1;
      const size = Number(file.metadata?.size ?? 0);
      totalBytes += size;
      if (size === 0) zeroByteObjects += 1;
      if (size > 50 * 1024 * 1024) largeObjectsOver50MiB += 1;

      const path = file.name || "";
      const top = path.split("/")[0] || "(root)";
      const cur = prefixCounts.get(top) ?? { count: 0, bytes: 0 };
      cur.count += 1;
      cur.bytes += size;
      prefixCounts.set(top, cur);

      const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")).toLowerCase() : "(none)";
      byExtension[ext] = (byExtension[ext] ?? 0) + 1;
      const mime = String(file.metadata?.contentType || "unknown");
      byMime[mime] = (byMime[mime] ?? 0) + 1;
    }

    const topPrefixes = [...prefixCounts.entries()]
      .map(([prefix, v]) => ({ prefix, count: v.count, bytes: v.bytes }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    buckets.push({
      bucketName: name,
      purpose: purposeForBucket(name),
      objectCount,
      totalBytes,
      tenantScopingMethod: inferTenantScoping(topPrefixes.map((p) => p.prefix + "/")),
      topPrefixes,
      byExtension,
      byMime,
      zeroByteObjects,
      largeObjectsOver50MiB,
      notes: "",
    });
  }

  return { buckets, exportBuckets };
}
