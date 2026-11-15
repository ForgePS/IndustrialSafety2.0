/**
 * Normalize Firestore typed markers from the DM-S1 extractor into AWS-import JSON values.
 * Preserves arrays, maps, null, boolean; unwraps Timestamp/GeoPoint/DocumentReference/Bytes/Integer/Double.
 */

export type FirestoreTyped =
  | { __firestoreType: "Timestamp"; value: string }
  | { __firestoreType: "GeoPoint"; latitude: number; longitude: number }
  | { __firestoreType: "DocumentReference"; path: string }
  | { __firestoreType: "Bytes"; encoding: "base64"; value: string }
  | { __firestoreType: "Integer"; value: number }
  | { __firestoreType: "Double"; value: number };

function isTyped(value: unknown): value is FirestoreTyped {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { __firestoreType?: unknown }).__firestoreType === "string"
  );
}

export function normalizeFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return value;
  if (Array.isArray(value)) return value.map((v) => normalizeFirestoreValue(v));
  if (isTyped(value)) {
    switch (value.__firestoreType) {
      case "Timestamp":
        return { type: "timestamp", value: value.value };
      case "GeoPoint":
        return { type: "geopoint", latitude: value.latitude, longitude: value.longitude };
      case "DocumentReference":
        return { type: "document_reference", path: value.path };
      case "Bytes":
        return { type: "bytes", encoding: value.encoding, value: value.value };
      case "Integer":
        return value.value;
      case "Double":
        return value.value;
      default:
        return value;
    }
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeFirestoreValue(v);
    }
    return out;
  }
  return value;
}
