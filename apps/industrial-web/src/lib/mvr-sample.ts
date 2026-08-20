/**
 * Annual 10% MVR sample selection helpers (shared by web + API logic).
 */

export type MvrSampleDriverLike = {
  id: string;
  status: string;
  sampleYear: number | null;
  sampleCompletedAt?: string;
};

export type MvrAuditEntry = {
  year: number;
  auditedAt: string;
  auditedByName: string;
  driverId: string;
  notes: string;
};

/** Eligible for the annual pull: active insurance roster, not removed/suspended. */
export function isEligibleForMvrSample(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s !== "removed" && s !== "suspended" && s !== "";
}

/** How many drivers to pull for a 10% annual sample (at least one when any exist). */
export function mvrSampleSize(eligibleCount: number, rate = 0.1): number {
  if (eligibleCount <= 0) return 0;
  return Math.max(1, Math.ceil(eligibleCount * rate));
}

/**
 * Deterministic year-seeded pick so reloading the same year without force
 * stays stable, and redraws with force can still call this after clearing.
 */
export function selectMvrSampleIds(
  drivers: readonly MvrSampleDriverLike[],
  year: number,
  rate = 0.1,
): string[] {
  const eligible = drivers.filter((d) => isEligibleForMvrSample(d.status));
  const size = mvrSampleSize(eligible.length, rate);
  if (size === 0) return [];

  // Prefer people not already sampled this year, then older sample years, then id.
  const ranked = [...eligible].sort((a, b) => {
    const aThisYear = a.sampleYear === year ? 1 : 0;
    const bThisYear = b.sampleYear === year ? 1 : 0;
    if (aThisYear !== bThisYear) return aThisYear - bThisYear;
    const aYear = a.sampleYear ?? 0;
    const bYear = b.sampleYear ?? 0;
    if (aYear !== bYear) return aYear - bYear;
    return a.id.localeCompare(b.id);
  });

  // Mix within preference bands using a simple year+id hash so the 10% is not
  // always the same alphabetical slice.
  const scored = ranked.map((d, index) => ({
    id: d.id,
    index,
    score: hashSeed(`${year}:${d.id}`),
  }));
  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  return scored.slice(0, size).map((row) => row.id);
}

function hashSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function parseMvrAuditHistory(raw: unknown): MvrAuditEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: MvrAuditEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const year = Number(row.year);
    const auditedAt = typeof row.auditedAt === "string" ? row.auditedAt.trim() : "";
    if (!Number.isFinite(year) || year < 2000 || !auditedAt) continue;
    out.push({
      year,
      auditedAt,
      auditedByName: typeof row.auditedByName === "string" ? row.auditedByName.trim() : "",
      driverId: typeof row.driverId === "string" ? row.driverId.trim() : "",
      notes: typeof row.notes === "string" ? row.notes.trim() : "",
    });
  }
  return out.sort((a, b) => b.auditedAt.localeCompare(a.auditedAt));
}

export function appendMvrAuditEntry(
  existing: unknown,
  entry: MvrAuditEntry,
): MvrAuditEntry[] {
  return [entry, ...parseMvrAuditHistory(existing)];
}
