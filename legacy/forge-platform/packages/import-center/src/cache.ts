/**
 * In-memory tenant-scoped import cache. Cleared on tenant switch.
 * Never stores privileged download URLs or raw sensitive values intentionally.
 */

type CacheBucket = {
  jobs?: unknown;
  jobDetails: Map<string, unknown>;
  preview: Map<string, unknown>;
};

const buckets = new Map<string, CacheBucket>();

function bucket(tenantId: string): CacheBucket {
  let b = buckets.get(tenantId);
  if (!b) {
    b = { jobDetails: new Map(), preview: new Map() };
    buckets.set(tenantId, b);
  }
  return b;
}

export function setCachedJobs(tenantId: string, jobs: unknown): void {
  bucket(tenantId).jobs = jobs;
}

export function getCachedJobs(tenantId: string): unknown {
  return bucket(tenantId).jobs;
}

export function setCachedJobDetail(tenantId: string, jobId: string, detail: unknown): void {
  bucket(tenantId).jobDetails.set(jobId, detail);
}

export function getCachedJobDetail(tenantId: string, jobId: string): unknown {
  return bucket(tenantId).jobDetails.get(jobId);
}

export function setCachedPreview(tenantId: string, jobId: string, preview: unknown): void {
  bucket(tenantId).preview.set(jobId, preview);
}

export function clearImportTenantCache(tenantId?: string): void {
  if (tenantId) {
    buckets.delete(tenantId);
    return;
  }
  buckets.clear();
}

export function importCacheTenantCount(): number {
  return buckets.size;
}
