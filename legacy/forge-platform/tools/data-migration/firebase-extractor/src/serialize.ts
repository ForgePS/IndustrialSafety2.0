/**
 * Preserve Firestore native types with explicit markers.
 * Extraction only — no field renaming / transforms.
 */

export type FirestoreTyped =
  | { __firestoreType: "Timestamp"; value: string }
  | { __firestoreType: "GeoPoint"; latitude: number; longitude: number }
  | { __firestoreType: "DocumentReference"; path: string }
  | { __firestoreType: "Bytes"; encoding: "base64"; value: string }
  | { __firestoreType: "Integer"; value: number }
  | { __firestoreType: "Double"; value: number };

function isTimestamp(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  );
}

function isGeoPoint(value: unknown): value is { latitude: number; longitude: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { latitude?: unknown }).latitude === "number" &&
    typeof (value as { longitude?: unknown }).longitude === "number" &&
    !("path" in (value as object))
  );
}

function isDocumentReference(value: unknown): value is { path: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { path?: unknown }).path === "string" &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

export function serializeFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { __firestoreType: "Integer", value } satisfies FirestoreTyped;
    }
    return { __firestoreType: "Double", value } satisfies FirestoreTyped;
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return {
      __firestoreType: "Bytes",
      encoding: "base64",
      value: buf.toString("base64"),
    } satisfies FirestoreTyped;
  }
  if (isTimestamp(value)) {
    return {
      __firestoreType: "Timestamp",
      value: value.toDate().toISOString(),
    } satisfies FirestoreTyped;
  }
  if (isGeoPoint(value)) {
    return {
      __firestoreType: "GeoPoint",
      latitude: value.latitude,
      longitude: value.longitude,
    } satisfies FirestoreTyped;
  }
  if (isDocumentReference(value)) {
    return {
      __firestoreType: "DocumentReference",
      path: value.path,
    } satisfies FirestoreTyped;
  }
  if (Array.isArray(value)) {
    return value.map((v) => serializeFirestoreValue(v));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeFirestoreValue(v);
    }
    return out;
  }
  return value;
}

export function serializeDocumentData(data: Record<string, unknown>): Record<string, unknown> {
  return serializeFirestoreValue(data) as Record<string, unknown>;
}
