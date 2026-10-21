/**
 * Forge Safety - Field Version reporting helpers.
 * Operational intake only — OSHA administration stays on industrial-web.
 */

export type FieldReportType =
  | "incident"
  | "near-miss"
  | "observation"
  | "hazard"
  | "equipment"
  | "security";

export type IncidentCategory =
  | "injuries"
  | "near-misses"
  | "medical-refusals"
  | "property-damage"
  | "automotive";

export type ObservationKind = "SAFE" | "UNSAFE";

export type FieldReportPhoto = {
  id: string;
  fileName: string;
  contentType: string;
  dataUrl: string;
  originalDataUrl?: string;
  hasMarkup?: boolean;
  markupDocument?: unknown;
};

export type FieldReportDraft = {
  type: FieldReportType;
  whatHappened: string;
  divisionName: string;
  locationId: string;
  locationName: string;
  departmentId: string;
  departmentName: string;
  areaDetail: string;
  whenIso: string;
  whoInvolved: string;
  injuryIllness: "" | "yes" | "no" | "unknown";
  bodyAreas: string[];
  equipmentProperty: string;
  witnesses: string;
  immediateActions: string;
  observationKind: ObservationKind | "";
  observationCategory: string;
  hazardLevel: "" | "low" | "medium" | "high" | "critical";
  anonymous: boolean;
  severity: "" | "low" | "moderate" | "high" | "critical";
  incidentSubtype: "" | "injury" | "fire" | "property" | "other";
  outOfService: boolean;
  photos: FieldReportPhoto[];
  /** OSHA-ready operational flags (not full OSHA forms). */
  oshaRelevant: boolean;
  workDayDetails: string;
  targetType: string;
  targetId: string;
  qrLinkId: string;
  equipmentId: string;
  savedAt?: string;
};

export const EMPTY_REPORT_DRAFT: FieldReportDraft = {
  type: "incident",
  whatHappened: "",
  divisionName: "",
  locationId: "",
  locationName: "",
  departmentId: "",
  departmentName: "",
  areaDetail: "",
  whenIso: "",
  whoInvolved: "",
  injuryIllness: "",
  bodyAreas: [],
  equipmentProperty: "",
  witnesses: "",
  immediateActions: "",
  observationKind: "",
  observationCategory: "",
  hazardLevel: "",
  anonymous: false,
  severity: "moderate",
  incidentSubtype: "",
  outOfService: false,
  photos: [],
  oshaRelevant: false,
  workDayDetails: "",
  targetType: "",
  targetId: "",
  qrLinkId: "",
  equipmentId: "",
};

export const REPORT_TYPE_META: Record<
  FieldReportType,
  { label: string; detail: string; api: "incident" | "observation" | "corrective" }
> = {
  incident: {
    label: "Report Incident",
    detail: "Injury, damage, fire, and more",
    api: "incident",
  },
  "near-miss": {
    label: "Near Miss",
    detail: "What almost happened",
    api: "incident",
  },
  observation: {
    label: "Safety Observation",
    detail: "Safe or unsafe behavior",
    api: "observation",
  },
  hazard: {
    label: "Report Hazard",
    detail: "Slip, machine, chemical, and more",
    api: "observation",
  },
  equipment: {
    label: "Equipment Issue",
    detail: "Broken, unsafe, or needs service",
    api: "corrective",
  },
  security: {
    label: "Security Incident",
    detail: "Theft, intrusion, or security concern",
    api: "incident",
  },
};

export const BODY_AREA_OPTIONS = [
  "Head",
  "Eye",
  "Neck",
  "Shoulder",
  "Arm",
  "Hand",
  "Back",
  "Chest",
  "Abdomen",
  "Hip",
  "Leg",
  "Foot",
  "Multiple",
] as const;

export function isFieldReportType(value: string): value is FieldReportType {
  return value in REPORT_TYPE_META;
}

export function parseReportType(raw: string | null | undefined): FieldReportType {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "near_miss" || value === "nearmiss") return "near-miss";
  if (value === "equipment-issue" || value === "equipment_issue" || value === "issue") {
    return "equipment";
  }
  if (isFieldReportType(value)) return value;
  return "hazard";
}

export function defaultWhenIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function resolveIncidentCategory(draft: FieldReportDraft): IncidentCategory {
  if (draft.type === "near-miss") return "near-misses";
  if (draft.type === "security") return "property-damage";
  if (draft.incidentSubtype === "injury" || draft.injuryIllness === "yes") return "injuries";
  if (draft.incidentSubtype === "property" || draft.incidentSubtype === "fire") {
    return "property-damage";
  }
  return "injuries";
}

export function validateReportDraft(
  draft: FieldReportDraft,
): { ok: true } | { ok: false; message: string; step?: string } {
  if (!draft.whatHappened.trim()) {
    return { ok: false, message: "Describe what happened.", step: "what" };
  }
  if (!draft.locationName.trim() && !draft.locationId.trim()) {
    return { ok: false, message: "Select a Location.", step: "org" };
  }
  if (!draft.whenIso.trim()) {
    return { ok: false, message: "When did this occur?", step: "when" };
  }
  if (draft.type === "observation" && !draft.observationKind) {
    return { ok: false, message: "Choose Safe or Unsafe.", step: "kind" };
  }
  if (draft.type === "hazard" && !draft.hazardLevel) {
    return { ok: false, message: "Select a hazard level.", step: "hazard" };
  }
  if (
    (draft.type === "incident" || draft.type === "security") &&
    draft.injuryIllness === "yes" &&
    draft.bodyAreas.length === 0
  ) {
    return {
      ok: false,
      message: "Select at least one body area for injury reports.",
      step: "injury",
    };
  }
  return { ok: true };
}

export function buildReportTitle(draft: FieldReportDraft): string {
  const meta = REPORT_TYPE_META[draft.type];
  const snippet = draft.whatHappened.trim().slice(0, 80);
  if (snippet) return `${meta.label}: ${snippet}`;
  return meta.label;
}

export function buildIncidentPayload(
  draft: FieldReportDraft,
  reporterName: string,
): Record<string, unknown> {
  const category = resolveIncidentCategory(draft);
  const oshaRelevant =
    draft.oshaRelevant || category === "injuries" || draft.injuryIllness === "yes";
  return {
    title: buildReportTitle(draft),
    category,
    incidentCategory: category,
    status: "open",
    severity: draft.severity || "moderate",
    location: draft.locationName || draft.areaDetail || "Field",
    locationDetail: draft.areaDetail || undefined,
    description: draft.whatHappened.trim(),
    reportedBy: draft.anonymous ? "Anonymous (Field)" : reporterName || "Field user",
    dateOccurred: draft.whenIso,
    siteId: draft.locationId || undefined,
    division: draft.divisionName || undefined,
    departmentId: draft.departmentId || undefined,
    departmentName: draft.departmentName || undefined,
    personAffected: draft.whoInvolved || undefined,
    witnessNames: draft.witnesses || undefined,
    correctiveActions: draft.immediateActions || undefined,
    bodyLocations: draft.bodyAreas,
    incidentTypeName:
      draft.type === "security"
        ? "Security"
        : draft.incidentSubtype === "fire"
          ? "Fire"
          : draft.incidentSubtype || undefined,
    equipmentProperty: draft.equipmentProperty || undefined,
    workDayDetails: draft.workDayDetails || undefined,
    oshaRelevant,
    fieldSource: "forge-safety-field",
    photos: draft.photos,
    qrLinkId: draft.qrLinkId || undefined,
    targetType: draft.targetType || undefined,
    targetId: draft.targetId || draft.equipmentId || undefined,
    anonymous: draft.anonymous,
  };
}

export function buildObservationPayload(
  draft: FieldReportDraft,
  reporterName: string,
): Record<string, unknown> {
  const isHazard = draft.type === "hazard";
  const kind = draft.observationKind || (isHazard ? "UNSAFE" : "SAFE");
  return {
    title: buildReportTitle(draft),
    status: "OPEN",
    description: draft.whatHappened.trim(),
    observationType: isHazard ? "HAZARD" : kind,
    category: draft.observationCategory || (isHazard ? "Hazard" : kind),
    location: draft.locationName || draft.areaDetail || "Field",
    riskLevel: draft.hazardLevel || (kind === "UNSAFE" ? "medium" : "low"),
    siteId: draft.locationId || undefined,
    divisionName: draft.divisionName || undefined,
    departmentId: draft.departmentId || undefined,
    departmentName: draft.departmentName || undefined,
    reportedBy: draft.anonymous ? "Anonymous (Field)" : reporterName || "Field user",
    immediateActions: draft.immediateActions || undefined,
    photos: draft.photos,
    anonymous: draft.anonymous,
    fieldSource: "forge-safety-field",
    observedAt: draft.whenIso || undefined,
    qrLinkId: draft.qrLinkId || undefined,
    targetType: draft.targetType || undefined,
    targetId: draft.targetId || draft.equipmentId || undefined,
  };
}

export function buildEquipmentIssuePayload(
  draft: FieldReportDraft,
  reporterName: string,
): Record<string, unknown> {
  const priority =
    draft.hazardLevel === "critical" || draft.hazardLevel === "high"
      ? "HIGH"
      : draft.hazardLevel === "low"
        ? "LOW"
        : "MEDIUM";
  return {
    title: buildReportTitle(draft),
    status: "OPEN",
    description: draft.whatHappened.trim(),
    parentEntityType: draft.targetType || "EQUIPMENT",
    parentEntityId: draft.targetId || draft.equipmentId || draft.qrLinkId || undefined,
    priority,
    siteId: draft.locationId || undefined,
    divisionName: draft.divisionName || undefined,
    departmentId: draft.departmentId || undefined,
    departmentName: draft.departmentName || undefined,
    reportedBy: reporterName || "Field user",
    immediateHazard: draft.hazardLevel === "critical" || draft.outOfService,
    outOfService: draft.outOfService,
    category: "EQUIPMENT_ISSUE",
    photos: draft.photos,
    immediateActions: draft.immediateActions || undefined,
    fieldSource: "forge-safety-field",
    qrLinkId: draft.qrLinkId || undefined,
    observedAt: draft.whenIso || undefined,
  };
}

const DRAFT_PREFIX = "forge.field.report.draft.v1:";

export function saveReportDraft(type: FieldReportType, draft: FieldReportDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${DRAFT_PREFIX}${type}`,
      JSON.stringify({ ...draft, type, savedAt: new Date().toISOString() }),
    );
  } catch {
    // ignore quota
  }
}

export function loadReportDraft(type: FieldReportType): FieldReportDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${DRAFT_PREFIX}${type}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FieldReportDraft>;
    return { ...EMPTY_REPORT_DRAFT, ...parsed, type };
  } catch {
    return null;
  }
}

export function clearReportDraft(type: FieldReportType): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${DRAFT_PREFIX}${type}`);
}

export async function compressReportPhoto(
  file: File,
  maxDim = 1280,
  quality = 0.72,
): Promise<FieldReportPhoto> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image"));
    image.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      id: crypto.randomUUID(),
      fileName: file.name || "photo.jpg",
      contentType: file.type || "image/jpeg",
      dataUrl,
    };
  }
  ctx.drawImage(img, 0, 0, width, height);
  return {
    id: crypto.randomUUID(),
    fileName: file.name || "photo.jpg",
    contentType: "image/jpeg",
    dataUrl: canvas.toDataURL("image/jpeg", quality),
  };
}
