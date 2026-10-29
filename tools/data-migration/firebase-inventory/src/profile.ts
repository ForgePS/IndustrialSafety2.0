/** Firestore value type profiling (no customer values retained). */

export type ObservedType =
  | "string"
  | "boolean"
  | "integer"
  | "double"
  | "null"
  | "timestamp"
  | "geopoint"
  | "reference"
  | "bytes"
  | "array"
  | "map"
  | "unknown";

export type FieldProfile = {
  fieldName: string;
  observedTypes: ObservedType[];
  presence: "common" | "optional" | "rare";
  seenIn: number;
  nested?: boolean;
  notes?: string;
};

export function classifyFirestoreValue(value: unknown): ObservedType {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return "string";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "double";
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    // firebase-admin Timestamp
    if (typeof (value as { toDate?: unknown }).toDate === "function") return "timestamp";
    if ("_seconds" in v || "seconds" in v) {
      if ("_nanoseconds" in v || "nanoseconds" in v) return "timestamp";
    }
    // GeoPoint
    if (("latitude" in v && "longitude" in v) || ("_latitude" in v && "_longitude" in v)) {
      return "geopoint";
    }
    // DocumentReference
    if (
      typeof (value as { path?: unknown }).path === "string" &&
      typeof (value as { id?: unknown }).id === "string"
    ) {
      return "reference";
    }
    // Bytes / Buffer
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) return "bytes";
    if (Array.isArray(value)) return "array";
    return "map";
  }
  return "unknown";
}

export function flattenFields(
  data: Record<string, unknown>,
  prefix = "",
  depth = 0,
): Array<{ fieldName: string; type: ObservedType; nested: boolean }> {
  const out: Array<{ fieldName: string; type: ObservedType; nested: boolean }> = [];
  for (const [key, value] of Object.entries(data)) {
    const fieldName = prefix ? `${prefix}.${key}` : key;
    const type = classifyFirestoreValue(value);
    out.push({ fieldName, type, nested: depth > 0 });
    if (
      type === "map" &&
      depth < 2 &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      out.push(...flattenFields(value as Record<string, unknown>, fieldName, depth + 1));
    }
  }
  return out;
}

export const TENANT_KEY_CANDIDATES = [
  "businessId",
  "organizationId",
  "companyId",
  "clientId",
  "tenantId",
  "sourceBusinessId",
  "firebaseBusinessId",
] as const;

export function detectTenantKeys(fieldNames: string[]): string[] {
  const set = new Set(fieldNames);
  return TENANT_KEY_CANDIDATES.filter((k) => set.has(k));
}

export function mergeFieldProfiles(docs: Array<Record<string, unknown>>): FieldProfile[] {
  const stats = new Map<string, { types: Set<ObservedType>; seen: number; nested: boolean }>();
  for (const doc of docs) {
    const fields = flattenFields(doc);
    const seenKeys = new Set<string>();
    for (const f of fields) {
      if (seenKeys.has(f.fieldName)) continue;
      seenKeys.add(f.fieldName);
      const cur = stats.get(f.fieldName) ?? {
        types: new Set<ObservedType>(),
        seen: 0,
        nested: f.nested,
      };
      cur.types.add(f.type);
      cur.seen += 1;
      cur.nested = cur.nested || f.nested;
      stats.set(f.fieldName, cur);
    }
  }
  const total = Math.max(docs.length, 1);
  return [...stats.entries()]
    .map(([fieldName, s]) => {
      const ratio = s.seen / total;
      const presence: FieldProfile["presence"] =
        ratio >= 0.8 ? "common" : ratio >= 0.2 ? "optional" : "rare";
      return {
        fieldName,
        observedTypes: [...s.types].sort(),
        presence,
        seenIn: s.seen,
        nested: s.nested || undefined,
      };
    })
    .sort((a, b) => a.fieldName.localeCompare(b.fieldName));
}

export function classifyDrift(profiles: FieldProfile[], sampleSize: number): string {
  if (sampleSize <= 1) return "STABLE";
  const rare = profiles.filter((p) => p.presence === "rare").length;
  const multiType = profiles.filter((p) => p.observedTypes.length > 1).length;
  if (rare > 12 || multiType > 8) return "SIGNIFICANT_DRIFT";
  if (rare > 3 || multiType > 2) return "MINOR_DRIFT";
  return "STABLE";
}
