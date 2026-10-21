/**
 * Server-side DVIR validation helpers (mirrors industrial-web/src/lib/dvir.ts rules).
 */

/** FMCSA-style retention window — records older than this are purged automatically. */
export const DVIR_RETENTION_DAYS = 91;

export function isDvirDotRecord(
  sourcePayload: unknown,
  sourceCollection?: string | null,
): boolean {
  if (sourceCollection === "dvirs") return true;
  if (!sourcePayload || typeof sourcePayload !== "object" || Array.isArray(sourcePayload)) {
    return false;
  }
  return String((sourcePayload as Record<string, unknown>).recordType ?? "").toUpperCase() === "DVIR";
}

export function dvirRetentionCutoffDate(now = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - (DVIR_RETENTION_DAYS - 1));
  return cutoff.toISOString().slice(0, 10);
}

export function dvirRetentionCutoffTimestamp(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - (DVIR_RETENTION_DAYS - 1));
  return cutoff;
}

export type DvirTripType = "PRE_TRIP" | "POST_TRIP";
export type DvirAnswerValue = "YES" | "NO" | "NA";

export type DvirItemAnswer = {
  id: string;
  label: string;
  section: string;
  answer: DvirAnswerValue;
  notes: string;
};

const REQUIRED_ITEM_IDS = [
  "air-compressor",
  "air-lines",
  "battery",
  "brake-accessories",
  "brakes",
  "carburetor",
  "clutch",
  "defroster",
  "drive-line",
  "engine",
  "fifth-wheel",
  "front-axle",
  "fuel-tanks",
  "heater",
  "horn",
  "lights-head-stop",
  "lights-tail-dash",
  "lights-turn",
  "mirrors",
  "muffler",
  "oil-pressure",
  "on-board-recorder",
  "radiator",
  "rear-end",
  "reflectors",
  "springs",
  "starter",
  "steering",
  "tachograph",
  "tires",
  "transmission",
  "wheels",
  "windows",
  "windshield-wipers",
  "truck-other",
  "fire-extinguisher",
  "first-aid-kit",
  "flags-flares-fuses",
  "spare-bulbs-fuses",
  "spare-seal-beam",
  "trailer-brake-connections",
  "trailer-brakes",
  "coupling-chains",
  "coupling-king-pin",
  "doors",
  "hitch",
  "landing-gear",
  "trailer-lights",
  "roof",
  "trailer-springs",
  "tarpaulin",
  "trailer-tires",
  "trailer-wheels",
  "trailer-other",
] as const;

const SAFETY_ITEM_IDS = new Set([
  "fire-extinguisher",
  "first-aid-kit",
  "flags-flares-fuses",
  "spare-bulbs-fuses",
  "spare-seal-beam",
]);

const TRAILER_ITEM_IDS = new Set([
  "trailer-brake-connections",
  "trailer-brakes",
  "coupling-chains",
  "coupling-king-pin",
  "doors",
  "hitch",
  "landing-gear",
  "trailer-lights",
  "roof",
  "trailer-springs",
  "tarpaulin",
  "trailer-tires",
  "trailer-wheels",
  "trailer-other",
]);

function dvirItemSection(id: string): string {
  if (SAFETY_ITEM_IDS.has(id)) return "safety";
  if (TRAILER_ITEM_IDS.has(id) || id.startsWith("trailer-")) return "trailer";
  return "truck";
}

function isAnswer(value: unknown): value is DvirAnswerValue {
  return value === "YES" || value === "NO" || value === "NA";
}

export function assertDvirDriverBody(body: Record<string, unknown>): {
  tripType: DvirTripType;
  inspectionDate: string;
  truckNumber: string;
  trailerNumbers: string;
  workerName: string;
  items: DvirItemAnswer[];
  truckDefects: string[];
  trailerDefects: string[];
  remarks: string;
  conditionSatisfactory: boolean;
  driverSignatureDataUrl: string;
  vehicleId?: string;
} {
  const tripRaw = String(body.tripType ?? "").trim().toUpperCase();
  if (tripRaw !== "PRE_TRIP" && tripRaw !== "POST_TRIP") {
    throw new Error("Choose pre-trip or post-trip.");
  }
  const inspectionDate = String(body.inspectionDate ?? "").trim();
  if (!inspectionDate) throw new Error("Inspection date is required.");
  const truckNumber = String(body.truckNumber ?? "").trim();
  if (!truckNumber) throw new Error("Truck / tractor number is required.");
  const workerName = String(body.workerName ?? body.driverName ?? "").trim();
  if (!workerName) throw new Error("Driver name is required.");

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new Error("Complete every inspection item.");
  }

  const byId = new Map<string, DvirItemAnswer>();
  for (const raw of body.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const answerRaw = String(row.answer ?? "").trim().toUpperCase();
    if (!id || !isAnswer(answerRaw)) continue;
    const notes = String(row.notes ?? "").trim();
    if (answerRaw === "NO" && !notes) {
      throw new Error(`Add a note for “${String(row.label ?? id)}” (answered No).`);
    }
    byId.set(id, {
      id,
      label: String(row.label ?? id),
      section: String(row.section ?? "truck"),
      answer: answerRaw,
      notes,
    });
  }

  for (const id of REQUIRED_ITEM_IDS) {
    if (!byId.has(id)) {
      throw new Error(`Answer Yes, No, or N/A for every item (missing ${id}).`);
    }
  }

  const items = REQUIRED_ITEM_IDS.map((id) => byId.get(id)!);
  const truckDefects: string[] = [];
  const trailerDefects: string[] = [];
  for (const item of items) {
    if (item.answer !== "NO") continue;
    if (item.section === "trailer") trailerDefects.push(item.id);
    else truckDefects.push(item.id);
  }

  const remarks = String(body.remarks ?? "").trim();
  const conditionSatisfactory = body.conditionSatisfactory === true;
  const driverSignatureDataUrl = String(body.driverSignatureDataUrl ?? "").trim();
  const noCount = truckDefects.length + trailerDefects.length;
  if (noCount > 0 && conditionSatisfactory) {
    throw new Error("Vehicle cannot be marked satisfactory when any item is answered No.");
  }
  if (!driverSignatureDataUrl.startsWith("data:image/")) {
    throw new Error("Driver signature is required.");
  }
  const vehicleId =
    typeof body.vehicleId === "string" && body.vehicleId.trim() ? body.vehicleId.trim() : undefined;
  const result: {
    tripType: DvirTripType;
    inspectionDate: string;
    truckNumber: string;
    trailerNumbers: string;
    workerName: string;
    items: DvirItemAnswer[];
    truckDefects: string[];
    trailerDefects: string[];
    remarks: string;
    conditionSatisfactory: boolean;
    driverSignatureDataUrl: string;
    vehicleId?: string;
  } = {
    tripType: tripRaw,
    inspectionDate,
    truckNumber,
    trailerNumbers: String(body.trailerNumbers ?? "").trim(),
    workerName,
    items,
    truckDefects,
    trailerDefects,
    remarks,
    conditionSatisfactory: noCount === 0 && conditionSatisfactory,
    driverSignatureDataUrl,
  };
  if (vehicleId) result.vehicleId = vehicleId;
  return result;
}

export function dvirTitle(tripType: DvirTripType, truckNumber: string): string {
  const label = tripType === "POST_TRIP" ? "Post-trip" : "Pre-trip";
  return `${label} DVIR ${truckNumber.trim() || "Unit"}`;
}

export function dvirStatusForDefects(defectCount: number): "OPEN" | "CLOSED" {
  return defectCount > 0 ? "OPEN" : "CLOSED";
}

/** Full checklist for printable HTML and legacy defect-only payloads. */
export function resolveDvirItemsFromPayload(payload: Record<string, unknown>): DvirItemAnswer[] {
  if (Array.isArray(payload.items) && payload.items.length > 0) {
    return (payload.items as Array<Record<string, unknown>>).map((raw) => ({
      id: String(raw.id ?? ""),
      label: String(raw.label ?? raw.id ?? ""),
      section: String(raw.section ?? dvirItemSection(String(raw.id ?? ""))),
      answer: String(raw.answer ?? "").toUpperCase() as DvirAnswerValue,
      notes: String(raw.notes ?? ""),
    }));
  }
  const truck = Array.isArray(payload.truckDefects)
    ? (payload.truckDefects as string[])
    : [];
  const trailer = Array.isArray(payload.trailerDefects)
    ? (payload.trailerDefects as string[])
    : [];
  const defectSet = new Set([...truck, ...trailer]);
  const remarks = String(payload.remarks ?? "");
  return REQUIRED_ITEM_IDS.map((id) => ({
    id,
    label: id.replace(/-/g, " "),
    section: dvirItemSection(id),
    answer: defectSet.has(id) ? "NO" : "YES",
    notes: defectSet.has(id) ? remarks : "",
  }));
}

/** Accept ISO timestamps from the client for signature dates. */
export function parseOptionalSignedAt(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const raw = String(body[key] ?? "").trim();
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

export function dvirDefectCountFromPayload(payload: Record<string, unknown>): number {
  if (Array.isArray(payload.items)) {
    return (payload.items as Array<Record<string, unknown>>).filter(
      (item) => String(item.answer ?? "").toUpperCase() === "NO",
    ).length;
  }
  return (
    (Array.isArray(payload.truckDefects) ? payload.truckDefects.length : 0) +
    (Array.isArray(payload.trailerDefects) ? payload.trailerDefects.length : 0)
  );
}

export function payloadNeedsMechanic(payload: Record<string, unknown>): boolean {
  if (dvirDefectCountFromPayload(payload) === 0) return false;
  return !payload.mechanicSignedAt && !payload.mechanicSignatureDataUrl;
}

export function payloadNeedsDriverReview(payload: Record<string, unknown>): boolean {
  if (payloadNeedsMechanic(payload)) return false;
  if (dvirDefectCountFromPayload(payload) === 0) return false;
  return !payload.driverReviewSignedAt && !payload.driverReviewSignatureDataUrl;
}
