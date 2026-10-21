/**
 * FMCSA Driver's Vehicle Inspection Report (DVIR) — checklist, validation, helpers.
 * Every checklist item is answered Yes / No / N/A. No requires a note.
 */

export type DvirTripType = "PRE_TRIP" | "POST_TRIP";
export type DvirAnswerValue = "YES" | "NO" | "NA";

export type DvirChecklistItem = {
  id: string;
  label: string;
  section: "truck" | "trailer" | "safety";
};

export type DvirItemAnswer = {
  id: string;
  label: string;
  section: "truck" | "trailer" | "safety";
  answer: DvirAnswerValue | null;
  notes: string;
};

export type DvirFormState = {
  tripType: DvirTripType;
  inspectionDate: string;
  truckNumber: string;
  trailerNumbers: string;
  vehicleId?: string | undefined;
  workerName: string;
  items: DvirItemAnswer[];
  remarks: string;
  conditionSatisfactory: boolean;
  driverSignatureDataUrl: string;
  driverSignatureDate: string;
  defectsCorrected: boolean | null;
  defectsNeedNotBeCorrected: boolean | null;
  mechanicName: string;
  mechanicSignatureDataUrl: string;
  driverReviewSignatureDataUrl: string;
};

export type DvirPayload = {
  category: "dvirs";
  recordType: "DVIR";
  tripType: DvirTripType;
  inspectionDate: string;
  truckNumber: string;
  trailerNumbers: string;
  vehicleId?: string | undefined;
  workerName: string;
  items: Array<{
    id: string;
    label: string;
    section: string;
    answer: DvirAnswerValue;
    notes: string;
  }>;
  /** Convenience: item ids answered NO (defects). */
  truckDefects: string[];
  trailerDefects: string[];
  remarks: string;
  conditionSatisfactory: boolean;
  driverSignatureDataUrl: string;
  driverSignedAt: string;
  defectsCorrected?: boolean | null;
  defectsNeedNotBeCorrected?: boolean | null;
  mechanicName?: string;
  mechanicSignatureDataUrl?: string;
  mechanicSignedAt?: string;
  driverReviewSignatureDataUrl?: string;
  driverReviewSignedAt?: string;
  submittedVia: "office" | "public-qr";
};

export const DVIR_TRUCK_ITEMS: ReadonlyArray<DvirChecklistItem> = [
  { id: "air-compressor", label: "Air Compressor", section: "truck" },
  { id: "air-lines", label: "Air Lines", section: "truck" },
  { id: "battery", label: "Battery", section: "truck" },
  { id: "brake-accessories", label: "Brake Accessories", section: "truck" },
  { id: "brakes", label: "Brakes", section: "truck" },
  { id: "carburetor", label: "Carburetor", section: "truck" },
  { id: "clutch", label: "Clutch", section: "truck" },
  { id: "defroster", label: "Defroster", section: "truck" },
  { id: "drive-line", label: "Drive Line", section: "truck" },
  { id: "engine", label: "Engine", section: "truck" },
  { id: "fifth-wheel", label: "Fifth Wheel", section: "truck" },
  { id: "front-axle", label: "Front Axle", section: "truck" },
  { id: "fuel-tanks", label: "Fuel Tanks", section: "truck" },
  { id: "heater", label: "Heater", section: "truck" },
  { id: "horn", label: "Horn", section: "truck" },
  { id: "lights-head-stop", label: "Lights — Head / Stop", section: "truck" },
  { id: "lights-tail-dash", label: "Lights — Tail / Dash", section: "truck" },
  { id: "lights-turn", label: "Lights — Turn Indicators", section: "truck" },
  { id: "mirrors", label: "Mirrors", section: "truck" },
  { id: "muffler", label: "Muffler", section: "truck" },
  { id: "oil-pressure", label: "Oil Pressure", section: "truck" },
  { id: "on-board-recorder", label: "On-Board Recorder", section: "truck" },
  { id: "radiator", label: "Radiator", section: "truck" },
  { id: "rear-end", label: "Rear End", section: "truck" },
  { id: "reflectors", label: "Reflectors", section: "truck" },
  { id: "springs", label: "Springs", section: "truck" },
  { id: "starter", label: "Starter", section: "truck" },
  { id: "steering", label: "Steering", section: "truck" },
  { id: "tachograph", label: "Tachograph", section: "truck" },
  { id: "tires", label: "Tires", section: "truck" },
  { id: "transmission", label: "Transmission", section: "truck" },
  { id: "wheels", label: "Wheels", section: "truck" },
  { id: "windows", label: "Windows", section: "truck" },
  { id: "windshield-wipers", label: "Windshield Wipers", section: "truck" },
  { id: "truck-other", label: "Other", section: "truck" },
];

export const DVIR_SAFETY_ITEMS: ReadonlyArray<DvirChecklistItem> = [
  { id: "fire-extinguisher", label: "Fire Extinguisher", section: "safety" },
  { id: "first-aid-kit", label: "First Aid Kit", section: "safety" },
  { id: "flags-flares-fuses", label: "Flags / Flares / Fuses", section: "safety" },
  { id: "spare-bulbs-fuses", label: "Spare Bulbs & Fuses", section: "safety" },
  { id: "spare-seal-beam", label: "Spare Seal Beam", section: "safety" },
];

export const DVIR_TRAILER_ITEMS: ReadonlyArray<DvirChecklistItem> = [
  { id: "trailer-brake-connections", label: "Brake Connections", section: "trailer" },
  { id: "trailer-brakes", label: "Brakes", section: "trailer" },
  { id: "coupling-chains", label: "Coupling Chains", section: "trailer" },
  { id: "coupling-king-pin", label: "Coupling (King) Pin", section: "trailer" },
  { id: "doors", label: "Doors", section: "trailer" },
  { id: "hitch", label: "Hitch", section: "trailer" },
  { id: "landing-gear", label: "Landing Gear", section: "trailer" },
  { id: "trailer-lights", label: "Lights — All", section: "trailer" },
  { id: "roof", label: "Roof", section: "trailer" },
  { id: "trailer-springs", label: "Springs", section: "trailer" },
  { id: "tarpaulin", label: "Tarpaulin", section: "trailer" },
  { id: "trailer-tires", label: "Tires", section: "trailer" },
  { id: "trailer-wheels", label: "Wheels", section: "trailer" },
  { id: "trailer-other", label: "Other", section: "trailer" },
];

export const DVIR_ALL_ITEMS: ReadonlyArray<DvirChecklistItem> = [
  ...DVIR_TRUCK_ITEMS,
  ...DVIR_SAFETY_ITEMS,
  ...DVIR_TRAILER_ITEMS,
];

const ITEM_BY_ID = new Map(DVIR_ALL_ITEMS.map((item) => [item.id, item]));

export function dvirItemLabel(id: string): string {
  return ITEM_BY_ID.get(id)?.label ?? id;
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local calendar date (YYYY-MM-DD) from an ISO timestamp or date string. */
export function localDateFromIso(value: string | null | undefined): string {
  if (!value) return todayIsoDate();
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return todayIsoDate();
  const dt = new Date(parsed);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** ISO timestamp for storage from a local date picker value. */
export function isoFromLocalDateString(date: string): string {
  const trimmed = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date().toISOString();
  }
  const parts = trimmed.split("-").map((part) => Number(part));
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
}

export function blankDvirItems(): DvirItemAnswer[] {
  return DVIR_ALL_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    section: item.section,
    answer: null,
    notes: "",
  }));
}

export function emptyDvirForm(partial?: Partial<DvirFormState>): DvirFormState {
  const inspectionDate = partial?.inspectionDate ?? todayIsoDate();
  const next: DvirFormState = {
    tripType: partial?.tripType ?? "PRE_TRIP",
    inspectionDate,
    truckNumber: partial?.truckNumber ?? "",
    trailerNumbers: partial?.trailerNumbers ?? "",
    workerName: partial?.workerName ?? "",
    items: partial?.items ? partial.items.map((item) => ({ ...item })) : blankDvirItems(),
    remarks: partial?.remarks ?? "",
    conditionSatisfactory: partial?.conditionSatisfactory ?? true,
    driverSignatureDataUrl: partial?.driverSignatureDataUrl ?? "",
    driverSignatureDate: partial?.driverSignatureDate ?? inspectionDate,
    defectsCorrected: partial?.defectsCorrected ?? null,
    defectsNeedNotBeCorrected: partial?.defectsNeedNotBeCorrected ?? null,
    mechanicName: partial?.mechanicName ?? "",
    mechanicSignatureDataUrl: partial?.mechanicSignatureDataUrl ?? "",
    driverReviewSignatureDataUrl: partial?.driverReviewSignatureDataUrl ?? "",
  };
  if (partial?.vehicleId) next.vehicleId = partial.vehicleId;
  return next;
}

export function dvirNoItems(items: ReadonlyArray<DvirItemAnswer>): DvirItemAnswer[] {
  return items.filter((item) => item.answer === "NO");
}

export function dvirDefectCountFromItems(items: ReadonlyArray<DvirItemAnswer>): number {
  return dvirNoItems(items).length;
}

/** Defect ids for list/status helpers (NO answers). */
export function dvirDefectIds(items: ReadonlyArray<DvirItemAnswer>): {
  truckDefects: string[];
  trailerDefects: string[];
} {
  const truckDefects: string[] = [];
  const trailerDefects: string[] = [];
  for (const item of items) {
    if (item.answer !== "NO") continue;
    if (item.section === "trailer") trailerDefects.push(item.id);
    else truckDefects.push(item.id);
  }
  return { truckDefects, trailerDefects };
}

export function tripTypeLabel(tripType: DvirTripType): string {
  return tripType === "POST_TRIP" ? "Post-trip" : "Pre-trip";
}

export function buildDvirTitle(input: {
  tripType: DvirTripType;
  truckNumber: string;
}): string {
  const unit = input.truckNumber.trim() || "Unit";
  return `${tripTypeLabel(input.tripType)} DVIR ${unit}`;
}

export function initialDvirStatus(hasDefects: boolean): "CLOSED" | "OPEN" {
  return hasDefects ? "OPEN" : "CLOSED";
}

export type DvirValidationResult = { ok: true } | { ok: false; message: string };

function isAnswer(value: unknown): value is DvirAnswerValue {
  return value === "YES" || value === "NO" || value === "NA";
}

/** Driver submit validation (office or public QR). */
export function validateDvirDriverSubmit(form: DvirFormState): DvirValidationResult {
  if (form.tripType !== "PRE_TRIP" && form.tripType !== "POST_TRIP") {
    return { ok: false, message: "Choose pre-trip or post-trip." };
  }
  if (!form.inspectionDate.trim()) {
    return { ok: false, message: "Inspection date is required." };
  }
  if (!form.truckNumber.trim()) {
    return { ok: false, message: "Truck / tractor number is required." };
  }
  if (!form.workerName.trim()) {
    return { ok: false, message: "DRIVER name is required." };
  }
  if (!Array.isArray(form.items) || form.items.length !== DVIR_ALL_ITEMS.length) {
    return { ok: false, message: "Complete every inspection item." };
  }
  for (const catalog of DVIR_ALL_ITEMS) {
    const item = form.items.find((row) => row.id === catalog.id);
    if (!item || !isAnswer(item.answer)) {
      return { ok: false, message: `Answer Yes, No, or N/A for “${catalog.label}”.` };
    }
    if (item.answer === "NO" && !item.notes.trim()) {
      return { ok: false, message: `Add a note for “${catalog.label}” (answered No).` };
    }
  }
  const noCount = dvirDefectCountFromItems(form.items);
  if (noCount > 0 && form.conditionSatisfactory) {
    return {
      ok: false,
      message: "Vehicle cannot be marked satisfactory when any item is answered No.",
    };
  }
  if (!form.driverSignatureDataUrl.trim().startsWith("data:image/")) {
    return { ok: false, message: "DRIVER signature is required." };
  }
  if (!form.driverSignatureDate.trim()) {
    return { ok: false, message: "Signature date is required." };
  }
  return { ok: true };
}

/** Mechanic certification when defects were reported. */
export function validateDvirMechanicCertify(input: {
  defectsCorrected: boolean | null;
  defectsNeedNotBeCorrected: boolean | null;
  mechanicName: string;
  mechanicSignatureDataUrl: string;
  mechanicSignatureDate: string;
}): DvirValidationResult {
  const corrected = input.defectsCorrected === true;
  const needNot = input.defectsNeedNotBeCorrected === true;
  if (corrected === needNot) {
    return {
      ok: false,
      message: "Select either “defects corrected” or “need not be corrected for safe operation”.",
    };
  }
  if (!input.mechanicName.trim()) {
    return { ok: false, message: "Mechanic name is required." };
  }
  if (!input.mechanicSignatureDataUrl.trim().startsWith("data:image/")) {
    return { ok: false, message: "Mechanic signature is required." };
  }
  if (!input.mechanicSignatureDate.trim()) {
    return { ok: false, message: "Mechanic signature date is required." };
  }
  return { ok: true };
}

export function validateDvirDriverReview(input: {
  signatureDataUrl: string;
  signatureDate: string;
}): DvirValidationResult {
  if (!input.signatureDataUrl.trim().startsWith("data:image/")) {
    return { ok: false, message: "DRIVER review signature is required." };
  }
  if (!input.signatureDate.trim()) {
    return { ok: false, message: "DRIVER review signature date is required." };
  }
  return { ok: true };
}

export function buildDvirSubmitPayload(
  form: DvirFormState,
  submittedVia: "office" | "public-qr",
  signedAt = isoFromLocalDateString(form.driverSignatureDate),
): DvirPayload {
  const { truckDefects, trailerDefects } = dvirDefectIds(form.items);
  const noCount = truckDefects.length + trailerDefects.length;
  return {
    category: "dvirs",
    recordType: "DVIR",
    tripType: form.tripType,
    inspectionDate: form.inspectionDate.trim(),
    truckNumber: form.truckNumber.trim(),
    trailerNumbers: form.trailerNumbers.trim(),
    ...(form.vehicleId ? { vehicleId: form.vehicleId } : {}),
    workerName: form.workerName.trim(),
    items: form.items.map((item) => ({
      id: item.id,
      label: item.label,
      section: item.section,
      answer: item.answer as DvirAnswerValue,
      notes: item.notes.trim(),
    })),
    truckDefects,
    trailerDefects,
    remarks: form.remarks.trim(),
    conditionSatisfactory: noCount === 0 && form.conditionSatisfactory,
    driverSignatureDataUrl: form.driverSignatureDataUrl,
    driverSignedAt: signedAt,
    submittedVia,
  };
}

/**
 * Public DVIR links use `/dvir/{token}` (QR) or `/dvir/?token=…`.
 * CloudFront serves the placeholder shell for unknown path tokens, so route
 * params alone read "placeholder" — the real token must come from the browser URL.
 */
export function resolveDvirPublicToken(input: {
  pathname?: string | null | undefined;
  queryToken?: string | null | undefined;
  routeToken?: string | null | undefined;
}): string {
  const fromQuery = String(input.queryToken ?? "").trim();
  if (fromQuery) return fromQuery;

  const path = String(input.pathname ?? "");
  const pathMatch = path.match(/\/dvir\/([^/]+)/i);
  const fromPathname = pathMatch?.[1] ? decodeURIComponent(pathMatch[1]).trim() : "";
  if (fromPathname && fromPathname !== "placeholder") return fromPathname;

  const fromRoute = String(input.routeToken ?? "").trim();
  if (fromRoute && fromRoute !== "placeholder") return fromRoute;

  return "";
}

export function isDvirRecord(row: Record<string, unknown>): boolean {
  const type = String(row.recordType ?? "").toUpperCase();
  if (type === "DVIR") return true;
  const category = String(row.category ?? "").toLowerCase();
  if (category === "dvirs" || category === "dvir") return true;
  const title = String(row.title ?? "").toLowerCase();
  return /\bdvir\b|pre[-\s]?trip|post[-\s]?trip|vehicle inspection report/.test(title);
}

/** Submitted DVIRs are locked — inspection answers and header fields cannot be edited. */
export function dvirIsSubmitted(row: Record<string, unknown>): boolean {
  if (!isDvirRecord(row)) return false;
  const sig = String(row.driverSignatureDataUrl ?? "").trim();
  if (sig.startsWith("data:image/")) return true;
  return String(row.driverSignedAt ?? "").trim().length > 0;
}

function defectCountFromRecord(row: Record<string, unknown>): number {
  if (Array.isArray(row.items)) {
    return (row.items as Array<Record<string, unknown>>).filter(
      (item) => String(item.answer ?? "").toUpperCase() === "NO",
    ).length;
  }
  return (
    (Array.isArray(row.truckDefects) ? row.truckDefects.length : 0) +
    (Array.isArray(row.trailerDefects) ? row.trailerDefects.length : 0)
  );
}

export function dvirDriverName(row: Record<string, unknown>): string {
  const name = String(row.workerName ?? row.driverName ?? "").trim();
  return name || "—";
}

export function dvirInspectionDate(row: Record<string, unknown>): string {
  const raw = String(row.inspectionDate ?? row.recordDate ?? "").trim();
  if (!raw) return "—";
  return raw.slice(0, 10);
}

export type DvirDefectSummary = {
  hasDefects: boolean;
  yesNo: "Yes" | "No";
  text: string;
};

/** Summary text for DOT reports: defects yes/no plus item labels and notes. */
export function dvirDefectSummary(row: Record<string, unknown>): DvirDefectSummary {
  const nos = resolveDvirReportItems(row).filter((item) => item.answer === "NO");
  if (nos.length === 0) {
    return { hasDefects: false, yesNo: "No", text: "" };
  }
  const text = nos
    .map((item) => (item.notes ? `${item.label}: ${item.notes}` : item.label))
    .join("; ");
  return { hasDefects: true, yesNo: "Yes", text };
}

export function dvirNeedsMechanic(row: Record<string, unknown>): boolean {
  if (defectCountFromRecord(row) === 0) return false;
  return !row.mechanicSignedAt && !row.mechanicSignatureDataUrl;
}

export function dvirNeedsDriverReview(row: Record<string, unknown>): boolean {
  if (dvirNeedsMechanic(row)) return false;
  if (defectCountFromRecord(row) === 0) return false;
  return !row.driverReviewSignedAt && !row.driverReviewSignatureDataUrl;
}

export type DvirFollowUpStatus =
  | "none"
  | "needs_mechanic"
  | "needs_driver_review"
  | "complete";

export function dvirFollowUpStatus(row: Record<string, unknown>): DvirFollowUpStatus {
  const defects = defectCountFromRecord(row);
  if (defects === 0) return "none";
  if (dvirNeedsMechanic(row)) return "needs_mechanic";
  if (dvirNeedsDriverReview(row)) return "needs_driver_review";
  return "complete";
}

export function dvirFollowUpLabel(status: DvirFollowUpStatus): string {
  switch (status) {
    case "needs_mechanic":
      return "Needs mechanic";
    case "needs_driver_review":
      return "Needs DRIVER review";
    case "complete":
      return "Defect follow-up complete";
    default:
      return "No defects";
  }
}

export function dvirFollowUpBadgeClass(status: DvirFollowUpStatus): string {
  switch (status) {
    case "needs_mechanic":
      return "bg-label-warning";
    case "needs_driver_review":
      return "bg-label-info";
    case "complete":
      return "bg-label-success";
    default:
      return "bg-label-secondary";
  }
}

export function summarizeDvirList(rows: ReadonlyArray<Record<string, unknown>>) {
  const today = todayIsoDate();
  let openDefects = 0;
  let preToday = 0;
  let postToday = 0;
  for (const row of rows) {
    if (!isDvirRecord(row)) continue;
    const status = String(row.status ?? "").toUpperCase();
    const defects = defectCountFromRecord(row);
    if (defects > 0 && status !== "CLOSED" && status !== "ARCHIVED" && status !== "COMPLETED") {
      openDefects += 1;
    }
    const date = String(row.inspectionDate ?? row.recordDate ?? "").slice(0, 10);
    if (date === today) {
      if (String(row.tripType).toUpperCase() === "POST_TRIP") postToday += 1;
      else if (String(row.tripType).toUpperCase() === "PRE_TRIP") preToday += 1;
    }
  }
  return { openDefects, preToday, postToday, total: rows.filter(isDvirRecord).length };
}

export function setDvirItemAnswer(
  items: DvirItemAnswer[],
  id: string,
  answer: DvirAnswerValue,
): DvirItemAnswer[] {
  return items.map((item) =>
    item.id === id
      ? {
          ...item,
          answer,
          notes: answer === "NO" ? item.notes : "",
        }
      : item,
  );
}

export function setDvirItemNotes(items: DvirItemAnswer[], id: string, notes: string): DvirItemAnswer[] {
  return items.map((item) => (item.id === id ? { ...item, notes } : item));
}

export function answerLabel(answer: DvirAnswerValue | null | undefined): string {
  if (answer === "YES") return "Yes";
  if (answer === "NO") return "No";
  if (answer === "NA") return "N/A";
  return "—";
}

/** Normalize stored record items for report display (supports legacy defect-only rows). */
export function resolveDvirReportItems(row: Record<string, unknown>): DvirItemAnswer[] {
  if (Array.isArray(row.items) && row.items.length > 0) {
    return (row.items as Array<Record<string, unknown>>).map((raw) => {
      const id = String(raw.id ?? "");
      const catalog = ITEM_BY_ID.get(id);
      const answerRaw = String(raw.answer ?? "").toUpperCase();
      return {
        id,
        label: String(raw.label ?? catalog?.label ?? id),
        section: (catalog?.section ??
          (String(raw.section ?? "truck") as DvirChecklistItem["section"])) ||
          "truck",
        answer: isAnswer(answerRaw) ? answerRaw : null,
        notes: String(raw.notes ?? ""),
      };
    });
  }
  const truck = Array.isArray(row.truckDefects) ? (row.truckDefects as string[]) : [];
  const trailer = Array.isArray(row.trailerDefects) ? (row.trailerDefects as string[]) : [];
  const defectSet = new Set([...truck, ...trailer]);
  return DVIR_ALL_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    section: item.section,
    answer: defectSet.has(item.id) ? ("NO" as const) : ("YES" as const),
    notes: defectSet.has(item.id) ? String(row.remarks ?? "") : "",
  }));
}

/** FMCSA-style retention — matches platform-api DVIR_RETENTION_DAYS. */
export const DVIR_RETENTION_DAYS = 91;

export type DvirDayStatus = "empty" | "partial" | "complete" | "defects";

export type DvirDayBucket = {
  date: string;
  preTrip: Record<string, unknown> | null;
  postTrip: Record<string, unknown> | null;
  all: Record<string, unknown>[];
};

/** Rolling calendar dates kept on file (today inclusive, oldest first). */
export function dvirRetentionDateRange(now = new Date()): string[] {
  const dates: string[] = [];
  const end = new Date(now);
  end.setHours(12, 0, 0, 0);
  for (let i = DVIR_RETENTION_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export function groupDvirsByDate(
  rows: ReadonlyArray<Record<string, unknown>>,
): Map<string, DvirDayBucket> {
  const map = new Map<string, DvirDayBucket>();
  for (const row of rows) {
    if (!isDvirRecord(row)) continue;
    const date = dvirInspectionDate(row);
    if (!date) continue;
    const bucket = map.get(date) ?? { date, preTrip: null, postTrip: null, all: [] };
    bucket.all.push(row);
    const trip = String(row.tripType ?? "").toUpperCase();
    if (trip === "POST_TRIP") bucket.postTrip = row;
    else bucket.preTrip = row;
    map.set(date, bucket);
  }
  return map;
}

export function dvirDayStatus(bucket: DvirDayBucket | undefined): DvirDayStatus {
  if (!bucket || bucket.all.length === 0) return "empty";
  const hasDefects = bucket.all.some((row) => dvirDefectSummary(row).hasDefects);
  if (hasDefects) return "defects";
  if (bucket.preTrip && bucket.postTrip) return "complete";
  return "partial";
}

export function dvirDayStatusLabel(status: DvirDayStatus): string {
  switch (status) {
    case "complete":
      return "Pre & post";
    case "partial":
      return "Partial";
    case "defects":
      return "Defects";
    default:
      return "No DVIR";
  }
}

export function openPrintableHtmlPopup(html: string, autoPrint = false): string | null {
  if (typeof window === "undefined") return "Browser only";
  const markup = typeof html === "string" ? html.trim() : "";
  if (!markup) return "Printable HTML was empty.";
  // Reject accidental URL-only payloads (callers sometimes pass an endpoint URL).
  if (/^https?:\/\//i.test(markup) || /^blob:/i.test(markup)) {
    return "Printable content looked like a URL, not HTML.";
  }

  // about:blank + document.write is more reliable than blob: URLs, which
  // intermittently open showing only the address-bar URL with blank content
  // (especially when reusing a named window after a prior revoke).
  const popup = window.open(
    "about:blank",
    `forge-printable-${Date.now()}`,
    "popup=yes,width=960,height=720,scrollbars=yes,resizable=yes",
  );
  if (!popup) {
    return "Pop-up blocked — allow pop-ups to print this document.";
  }

  try {
    popup.document.open();
    popup.document.write(markup);
    popup.document.close();
    popup.focus();
  } catch {
    try {
      popup.close();
    } catch {
      // ignore
    }
    return "Unable to open printable window.";
  }

  if (autoPrint) {
    let printed = false;
    const print = () => {
      if (printed) return;
      printed = true;
      try {
        popup.focus();
        popup.print();
      } catch {
        // ignore
      }
    };
    // Logos and photos load asynchronously; printing earlier leaves them blank on paper.
    let pending: HTMLImageElement[] = [];
    try {
      pending = Array.from(popup.document.images).filter((img) => !img.complete);
    } catch {
      pending = [];
    }
    if (pending.length === 0) {
      window.setTimeout(print, 250);
    } else {
      let remaining = pending.length;
      const done = () => {
        remaining -= 1;
        if (remaining <= 0) window.setTimeout(print, 100);
      };
      for (const img of pending) {
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }
      window.setTimeout(print, 4000);
    }
  }
  return null;
}
