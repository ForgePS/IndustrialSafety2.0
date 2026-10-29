import { normalizeLotoImageArrows, type LotoImageArrow } from "@/lib/loto-image-annotations";
import { isDisplayableLotoImageUrl } from "@/lib/loto-clipboard-images";

export type { LotoImageArrow } from "@/lib/loto-image-annotations";
export { normalizeLotoImageArrows } from "@/lib/loto-image-annotations";

export const LOTO_ENERGY_TYPES = [
  "Electrical",
  "Mechanical",
  "Hydraulic",
  "Pneumatic",
  "Chemical",
  "Thermal",
  "Gravity",
  "Controlled Gravity",
  "Water",
  "Stored energy",
  "Other",
] as const;

/** Energy letter codes used on LOTO steps / printed badges. */
export type LotoEnergyLetter = "E" | "P" | "H" | "W" | "C" | "G" | "M" | "T" | "CG";

export const LOTO_ENERGY_LETTER_META: Record<
  LotoEnergyLetter,
  { bg: string; fg: string; label: string }
> = {
  E: { bg: "#dc2626", fg: "#ffffff", label: "Electrical" },
  P: { bg: "#2563eb", fg: "#ffffff", label: "Pneumatic" },
  C: { bg: "#ea580c", fg: "#ffffff", label: "Chemical" },
  G: { bg: "#eab308", fg: "#111827", label: "Gravity" },
  M: { bg: "#7c3aed", fg: "#ffffff", label: "Mechanical" },
  T: { bg: "#111827", fg: "#ffffff", label: "Thermal" },
  W: { bg: "#16a34a", fg: "#ffffff", label: "Water" },
  CG: { bg: "#800000", fg: "#ffffff", label: "Controlled Gravity" },
  H: { bg: "#92400e", fg: "#ffffff", label: "Hydraulic" },
};

/**
 * Resolve the energy letter from a description code (e.g. "E-4 480V", "CG-1")
 * and/or energy source name.
 */
export function parseLotoEnergyLetter(
  descriptionCode?: string | null,
  energyName?: string | null,
): LotoEnergyLetter | null {
  const code = typeof descriptionCode === "string" ? descriptionCode.trim().toUpperCase() : "";
  if (code) {
    const fromCode =
      code.match(/^(CG)(?=[\s\-_0-9]|$)/) || code.match(/^([EPHWGMT]|C)(?=[\s\-_0-9]|$)/);
    if (fromCode?.[1] === "CG") return "CG";
    if (fromCode?.[1]) return fromCode[1] as LotoEnergyLetter;
  }

  const name = typeof energyName === "string" ? energyName.trim().toLowerCase() : "";
  if (!name) return null;
  if (name.includes("controlled gravity") || name === "cg") return "CG";
  if (name.includes("electric")) return "E";
  if (name.includes("pneumatic") || /\bair\b/.test(name)) return "P";
  if (name.includes("hydraulic")) return "H";
  if (name.includes("water")) return "W";
  if (name.includes("chemical")) return "C";
  if (name.includes("gravity")) return "G";
  if (name.includes("mechanic")) return "M";
  if (name.includes("thermal") || name.includes("heat") || name.includes("steam")) return "T";
  return null;
}

export function lotoEnergyLetterStyle(
  descriptionCode?: string | null,
  energyName?: string | null,
): { letter: LotoEnergyLetter; bg: string; fg: string; label: string } | null {
  const letter = parseLotoEnergyLetter(descriptionCode, energyName);
  if (!letter) return null;
  const meta = LOTO_ENERGY_LETTER_META[letter];
  return { letter, ...meta };
}

export function lotoEnergyLetterBadgeClass(letter: LotoEnergyLetter | null | undefined): string {
  if (!letter) return "bg-label-secondary";
  switch (letter) {
    case "E":
      return "bg-danger";
    case "P":
      return "bg-primary";
    case "H":
      return "bg-label-warning";
    case "W":
      return "bg-success";
    case "C":
      return "bg-label-warning";
    case "G":
      return "bg-warning";
    case "M":
      return "bg-label-primary";
    case "T":
      return "bg-dark";
    case "CG":
      return "bg-danger";
    default:
      return "bg-label-secondary";
  }
}

export const LOTO_PROCEDURE_STATUSES = [
  "DRAFT",
  "NEEDS_CORRECTION",
  "IN_REVIEW",
  "ACTIVE",
  "CLOSED",
  "ARCHIVED",
  /** Legacy — treated as In review */
  "PENDING_APPROVAL",
  /** Legacy — treated as Active for lockout issue */
  "APPROVED",
] as const;

export const LOTO_LOCKOUT_STATUSES = ["ISSUED", "VERIFIED", "CLOSED"] as const;

export type LotoTab = "procedures" | "lockouts" | "reports";

export type LotoStats = {
  procedures: number;
  drafts: number;
  active: number;
  reviews: number;
  openLockouts: number;
};

function upper(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function lotoStatusBadgeClass(status: string): string {
  const key = upper(status);
  if (key === "ACTIVE" || key === "APPROVED" || key === "VERIFIED" || key === "COMPLETED") {
    return "bg-label-success";
  }
  if (key === "IN_REVIEW" || key === "PENDING_APPROVAL" || key === "SUBMITTED") {
    return "bg-label-warning";
  }
  if (key === "NEEDS_CORRECTION") return "bg-label-danger";
  if (key === "ISSUED" || key === "OPEN") return "bg-label-info";
  if (key === "DRAFT") return "bg-label-secondary";
  if (key === "CLOSED" || key === "ARCHIVED") return "bg-label-secondary";
  return "bg-label-secondary";
}

export function lotoStatusLabel(status: string): string {
  const key = upper(status);
  if (key === "IN_REVIEW" || key === "PENDING_APPROVAL") return "In review";
  if (key === "NEEDS_CORRECTION") return "Needs correction";
  if (key === "APPROVED") return "Active";
  if (!key) return "Unknown";
  return key
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function lotoPhaseBadgeClass(phase: string): string {
  const key = upper(phase);
  if (key === "VERIFICATION") return "bg-label-warning";
  if (key === "ISOLATION" || key === "SHUTDOWN") return "bg-label-danger";
  if (key === "RESTART") return "bg-label-success";
  return "bg-label-secondary";
}

/** Approve activates the procedure — only ACTIVE (and legacy APPROVED) can be issued. */
export function canIssueLockout(status: string): boolean {
  const key = upper(status);
  return key === "ACTIVE" || key === "APPROVED";
}

/** Author can optionally submit DRAFT or corrected procedures for EHS review. */
export function lotoCanSubmitForReview(status: string): boolean {
  const key = upper(status);
  return key === "DRAFT" || key === "NEEDS_CORRECTION";
}

/** Author can activate a procedure without EHS review when higher validation is not needed. */
export function lotoCanActivateDirect(status: string): boolean {
  return lotoCanSubmitForReview(status);
}

/** EHS Director can approve or send back while the procedure is in review. */
export function lotoCanEhsReview(status: string): boolean {
  const key = upper(status);
  return key === "IN_REVIEW" || key === "PENDING_APPROVAL";
}

export function lotoIsNeedsCorrection(status: string): boolean {
  return upper(status) === "NEEDS_CORRECTION";
}

export function lotoListHref(): string {
  return "/modules/lockout-tagout/";
}

/** Procedure detail page. Ids stay in the query string (static export). */
export function lotoProcedureHref(id: string): string {
  return `/modules/lockout-tagout/procedure/?id=${encodeURIComponent(id)}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

/** Plain string fields only — rejects String(object/array) corruption. */
function plainText(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("[object Object]")) return "";
  return trimmed;
}

/** Equipment label for LOTO list rows (payload + catalog fields). */
export function lotoProcedureEquipmentName(row: Record<string, unknown>): string {
  return (
    text(row.equipmentName) ||
    text(row.equipmentUnit) ||
    text(row.equipment) ||
    text(row.title) ||
    "—"
  );
}

/**
 * Site label for LOTO list rows.
 * Prefer explicit site snapshots — never fall back to equipment type / location
 * fields that migrated payloads sometimes reuse.
 */
export function lotoProcedureSiteName(row: Record<string, unknown>): string {
  const type =
    text(row.equipmentTypeName) || text(row.equipmentTypeNameSnapshot) || text(row.equipmentType);
  const candidates = [
    text(row.siteName),
    text(row.siteNameSnapshot),
    text(row.site),
    text(row.leftFooter),
  ];
  for (const value of candidates) {
    if (!value) continue;
    if (type && value.toLowerCase() === type.toLowerCase()) continue;
    return value;
  }
  return "—";
}

/**
 * Area label for LOTO list rows.
 * Prefer area snapshots; processLine is a weaker location fallback only.
 */
export function lotoProcedureAreaName(row: Record<string, unknown>): string {
  const type =
    text(row.equipmentTypeName) || text(row.equipmentTypeNameSnapshot) || text(row.equipmentType);
  const candidates = [
    text(row.areaName),
    text(row.areaNameSnapshot),
    text(row.area),
    text(row.processLine),
  ];
  for (const value of candidates) {
    if (!value) continue;
    if (type && value.toLowerCase() === type.toLowerCase()) continue;
    return value;
  }
  return "—";
}

/** Division label for LOTO list/detail rows (payload snapshots). */
export function lotoProcedureDivisionName(row: Record<string, unknown>): string {
  const payload = asRecord(row.source_payload ?? row.sourcePayload);
  return (
    text(row.divisionName) ||
    text(row.divisionNameSnapshot) ||
    text(row.division) ||
    text(payload.divisionName) ||
    text(payload.divisionNameSnapshot) ||
    text(payload.division) ||
    "—"
  );
}

/** Department label for LOTO list/detail rows (payload snapshots). */
export function lotoProcedureDepartmentName(row: Record<string, unknown>): string {
  const payload = asRecord(row.source_payload ?? row.sourcePayload);
  return (
    text(row.departmentName) ||
    text(row.departmentNameSnapshot) ||
    text(row.department) ||
    text(payload.departmentName) ||
    text(payload.departmentNameSnapshot) ||
    text(payload.department) ||
    "—"
  );
}

/**
 * Scope / description text for LOTO QR stickers and labels.
 * Only plain string fields — never coerce notes/description arrays
 * (String([{...}]) yields "[object Object],[object Object],...").
 */
export function lotoProcedureDescription(row: Record<string, unknown>): string {
  const equipment = lotoProcedureEquipmentName(row);
  const scope =
    plainText(row.scope) || plainText(row.description) || plainText(row.workDescription);
  if (scope) return scope;
  // Plain-text notes only; structured precaution arrays are not sticker copy.
  const notes = plainText(row.notes);
  if (notes) return notes;
  const title = plainText(row.title);
  if (title && title !== equipment && title !== "—") return title;
  return "";
}

export type LotoStepForm = {
  energySourceName: string;
  energyMagnitude: string;
  isolationLocationText: string;
  lockoutDeviceName: string;
  isolationAction: string;
  verificationMethodName: string;
  descriptionCode: string;
  customDescription: string;
  printedProcedureDescription: string;
  /** Primary / legacy single photo (kept in sync with stepImages[0]). */
  stepImageUrl: string;
  stepImageFileName: string;
  stepImagePreviewUrl: string;
  stepImageAnnotations: LotoImageArrow[];
  /** Step photos (includes the primary as index 0 when present). */
  stepImages: LotoPhotoForm[];
};

/** One uploadable/annotated LOTO photo (equipment or step). */
export type LotoPhotoForm = {
  imageUrl: string;
  fileName: string;
  previewUrl: string;
  annotations: LotoImageArrow[];
  caption?: string;
};

/** Cap per equipment block or per lockout step (print + payload size). */
export const LOTO_MAX_PHOTOS_PER_SLOT = 6;

export function emptyLotoPhotoForm(partial?: Partial<LotoPhotoForm>): LotoPhotoForm {
  return {
    imageUrl: "",
    fileName: "",
    previewUrl: "",
    annotations: [],
    caption: "",
    ...partial,
  };
}

function photoHasContent(photo: LotoPhotoForm): boolean {
  return Boolean(
    photo.imageUrl.trim() ||
    photo.previewUrl.trim() ||
    photo.fileName.trim() ||
    photo.annotations.length > 0,
  );
}

/** Normalize API / legacy single fields into a photo array (max LOTO_MAX_PHOTOS_PER_SLOT). */
export function normalizeLotoPhotoForms(
  raw: unknown,
  legacy?: {
    imageUrl?: unknown;
    fileName?: unknown;
    annotations?: unknown;
    caption?: unknown;
  },
): LotoPhotoForm[] {
  const fromArray: LotoPhotoForm[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const row = asRecord(item);
      const imageUrl =
        text(row.imageUrl) ||
        text(row.stepImageUrl) ||
        text(row.equipmentImageUrl) ||
        text(row.stepImageStorageKey) ||
        text(row.equipmentImageStorageKey) ||
        text(row.url);
      const fileName =
        text(row.fileName) ||
        text(row.stepImageFileName) ||
        text(row.equipmentImageFileName) ||
        text(row.filename);
      const annotations = normalizeLotoImageArrows(
        row.annotations ?? row.stepImageAnnotations ?? row.equipmentImageAnnotations,
      );
      const caption = text(row.caption) || text(row.equipmentImageCaption);
      if (!imageUrl && !fileName && annotations.length === 0) continue;
      fromArray.push(
        emptyLotoPhotoForm({
          imageUrl,
          fileName,
          annotations,
          caption,
        }),
      );
      if (fromArray.length >= LOTO_MAX_PHOTOS_PER_SLOT) break;
    }
  }
  if (fromArray.length > 0) return fromArray;

  const legacyUrl = text(legacy?.imageUrl);
  const legacyFile = text(legacy?.fileName);
  const legacyArrows = normalizeLotoImageArrows(legacy?.annotations);
  const legacyCaption = text(legacy?.caption);
  if (!legacyUrl && !legacyFile && legacyArrows.length === 0) return [];
  return [
    emptyLotoPhotoForm({
      imageUrl: legacyUrl,
      fileName: legacyFile,
      annotations: legacyArrows,
      caption: legacyCaption,
    }),
  ];
}

/** Keep legacy single-photo fields aligned with photos[0] for older readers/print. */
export function syncStepLegacyPhotoFields(step: LotoStepForm): LotoStepForm {
  const photos = (step.stepImages ?? []).filter(photoHasContent).slice(0, LOTO_MAX_PHOTOS_PER_SLOT);
  const primary = photos[0];
  return {
    ...step,
    stepImages: photos,
    stepImageUrl: primary?.imageUrl ?? "",
    stepImageFileName: primary?.fileName ?? "",
    stepImagePreviewUrl: primary?.previewUrl ?? "",
    stepImageAnnotations: primary?.annotations ?? [],
  };
}

export function syncEquipmentLegacyPhotoFields(
  form: Pick<
    LotoProcedureFormState,
    | "equipmentImages"
    | "equipmentImageUrl"
    | "equipmentImageFileName"
    | "equipmentImagePreviewUrl"
    | "equipmentImageAnnotations"
    | "equipmentImageCaption"
  >,
): Pick<
  LotoProcedureFormState,
  | "equipmentImages"
  | "equipmentImageUrl"
  | "equipmentImageFileName"
  | "equipmentImagePreviewUrl"
  | "equipmentImageAnnotations"
  | "equipmentImageCaption"
> {
  const photos = (form.equipmentImages ?? [])
    .filter(photoHasContent)
    .slice(0, LOTO_MAX_PHOTOS_PER_SLOT);
  const primary = photos[0];
  return {
    equipmentImages: photos,
    equipmentImageUrl: primary?.imageUrl ?? "",
    equipmentImageFileName: primary?.fileName ?? "",
    equipmentImagePreviewUrl: primary?.previewUrl ?? "",
    equipmentImageAnnotations: primary?.annotations ?? [],
    equipmentImageCaption:
      form.equipmentImageCaption.trim() || primary?.caption || primary?.fileName || "",
  };
}

/** Serialize photo forms for create/update payloads (keeps legacy single fields separately). */
export function lotoPhotoFormsToPayload(photos: LotoPhotoForm[]): Array<Record<string, unknown>> {
  return photos
    .filter(photoHasContent)
    .slice(0, LOTO_MAX_PHOTOS_PER_SLOT)
    .map((photo) => ({
      imageUrl: photo.imageUrl.trim() || null,
      fileName: photo.fileName.trim() || null,
      annotations: photo.annotations,
      caption: (photo.caption ?? "").trim() || null,
    }));
}

export type LotoPhotoDisplay = {
  imageUrl: string;
  annotations: LotoImageArrow[];
  caption: string;
};

export function lotoPhotosToDisplay(
  raw: unknown,
  legacy?: {
    imageUrl?: unknown;
    fileName?: unknown;
    annotations?: unknown;
    caption?: unknown;
  },
): LotoPhotoDisplay[] {
  return normalizeLotoPhotoForms(raw, legacy)
    .filter((photo) => photo.imageUrl.trim())
    .map((photo) => ({
      imageUrl: photo.imageUrl,
      annotations: photo.annotations,
      caption: (photo.caption ?? "").trim(),
    }));
}

export type LotoPrecautionSelection = {
  id: string;
  shortName: string;
  text: string;
  category?: string;
};

export type LotoSequenceStepForm = {
  step: string;
  description: string;
};

export type LotoProcedureFormState = {
  title: string;
  equipmentName: string;
  equipmentId: string;
  equipmentExternalId: string;
  equipmentTypeName: string;
  siteId: string;
  siteName: string;
  departmentId: string;
  departmentName: string;
  divisionName: string;
  areaName: string;
  procedureNumber: string;
  revision: string;
  scope: string;
  precautions: LotoPrecautionSelection[];
  steps: LotoStepForm[];
  restorationLabel: string;
  /** Primary / legacy equipment photo (kept in sync with equipmentImages[0]). */
  equipmentImageUrl: string;
  equipmentImageCaption: string;
  equipmentImageFileName: string;
  equipmentImagePreviewUrl: string;
  equipmentImageAnnotations: LotoImageArrow[];
  /** Equipment photos (includes the primary as index 0 when present). */
  equipmentImages: LotoPhotoForm[];
  /** Editable page-2 printable sheet fields */
  printPurpose: string;
  printScopeStatement: string;
  printEnforcement: string;
  shutdownSequence: LotoSequenceStepForm[];
  restoreSequence: LotoSequenceStepForm[];
};

export const LOTO_EQUIPMENT_TYPE_OPTIONS = [
  "Fan",
  "Conveyor",
  "Motor",
  "Pump",
  "Compressor",
  "Mixer",
  "Elevator",
  "Blower",
  "Auger",
  "Other",
] as const;

export const LOTO_LOCKOUT_DEVICE_OPTIONS = [
  "Lock and Hasp",
  "Lock",
  "Tag",
  "Blank",
  "Chain",
  "Valve Lock",
  "Plug Lock",
] as const;

export const LOTO_LOCKOUT_METHOD_OPTIONS = [
  "Move disconnect to off position and lock out",
  "Disconnect",
  "Close valve and lock",
  "Open breaker and lock",
  "Isolate and lock out",
  "Depressurize and lock",
] as const;

export const LOTO_DEFAULT_PRECAUTIONS: LotoPrecautionSelection[] = [
  {
    id: "machine-general",
    shortName: "Machine / general",
    category: "General",
    text: "Ensure machine has come to a complete stop before proceeding.",
  },
  {
    id: "capacitor",
    shortName: "Capacitor",
    category: "Electrical",
    text: "This machine has internal capacitors. You must ensure they are fully discharged before proceeding.",
  },
  {
    id: "chiller",
    shortName: "Chiller",
    category: "Thermal",
    text: "This machine is capable of generating extremely cold temperatures. Allow it to return to room temperature before proceeding.",
  },
  {
    id: "injection-molder",
    shortName: "Injection Molder",
    category: "Thermal",
    text: "Machine generates extreme heat and pressure. Ensure pressure has vented and press is room temperature before proceeding.",
  },
  {
    id: "piping-systems",
    shortName: "Piping Systems",
    category: "Hydraulic",
    text: "Piping systems can store energy hydraulically. Ensure pressures are isolated and/or have been relieved before proceeding.",
  },
  {
    id: "crane",
    shortName: "Crane",
    category: "Mechanical",
    text: "Crane is suspended overhead. Unload and secure crane before proceeding.",
  },
  {
    id: "pneumatic-equipment",
    shortName: "Pneumatic Equipment",
    category: "Pneumatic",
    text: "Pneumatic equipment can store energy. Ensure pressures have bled off before proceeding.",
  },
  {
    id: "steam-pressure-hazard",
    shortName: "Steam Pressure Hazard",
    category: "Thermal",
    text: "Steam pressure and burn hazard. Ensure steam and heat have dissipated before proceeding.",
  },
  {
    id: "thermal-energy-hazard",
    shortName: "Thermal Energy Hazard",
    category: "Thermal",
    text: "Thermal energy and burn hazard. Ensure heat has dissipated before proceeding.",
  },
  {
    id: "raised-load",
    shortName: "Raised Load",
    category: "Mechanical",
    text: "Potential energy is stored with a raised load. Lower unit to lowest position or block in place before proceeding.",
  },
  {
    id: "confined-space",
    shortName: "Confined Space",
    category: "General",
    text: "Confined Space. Authorized personnel only. Permits are required before entering. Follow all Confined Space procedures.",
  },
  {
    id: "fans",
    shortName: "Fans",
    category: "Mechanical",
    text: "Ensure fan has come to a complete stop before proceeding.",
  },
  {
    id: "chemical-hazards",
    shortName: "Chemical hazards",
    category: "Chemical",
    text: "Chemical hazard - reference SDS. Wear proper PPE. Ensure ventilation is adequate and all chemicals are accounted for before proceeding.",
  },
  {
    id: "hydraulic",
    shortName: "Hydraulic",
    category: "Hydraulic",
    text: "Hydraulic equipment can store energy. Ensure to relieve pressure per manufacturers instruction.",
  },
  {
    id: "hydraulic-pneumatic",
    shortName: "Hydraulic pneumatic",
    category: "Hydraulic",
    text: "Hydraulic and pneumatic equipment can store energy. Ensure to relieve pressure per manufacturers instruction.",
  },
  {
    id: "refrigeration",
    shortName: "Refrigeration",
    category: "Chemical",
    text: "Refrigerant gas present. Authorized personnel only to service equipment.",
  },
  {
    id: "radiation",
    shortName: "Radiation",
    category: "General",
    text: "Radiation present. Authorized personnel only to service equipment.",
  },
  {
    id: "flammable-gases-liquids",
    shortName: "Flammable gases / liquids",
    category: "Chemical",
    text: "Flammable gases or liquids present. Ensure all lines have been purged prior to servicing.",
  },
  {
    id: "working-at-heights",
    shortName: "Working at heights",
    category: "General",
    text: "Proper use of mobile lift or ladder required.",
  },
  {
    id: "pinch-point-hazard",
    shortName: "Pinch Point Hazard",
    category: "Mechanical",
    text: "Pinch point hazard. Ensure equipment has come to a complete stop before proceeding. Shutdown adjacent equipment to avoid potential injury.",
  },
  {
    id: "upstream-downstream",
    shortName: "Upstream/Downstream",
    category: "General",
    text: "Upstream and downstream equipment may also require LOTO before performing service.",
  },
  {
    id: "plc-controlled-equipment",
    shortName: "PLC Controlled Equipment",
    category: "Electrical",
    text: "Electricity is controlled via PLC. Ensure with the Mill Operator that the Scale is switched OFF.",
  },
  {
    id: "interconnected-equipment",
    shortName: "Interconnected Equipment",
    category: "Mechanical",
    text: "Beware of pinch points. Nearby, interconnected, and adjacent machinery must also be de-energized and locked out.",
  },
];

export const LOTO_DEFAULT_PRINT_PURPOSE =
  "To protect authorized employees against unexpected or unplanned activation of equipment or energy while servicing equipment.";

export const LOTO_DEFAULT_PRINT_SCOPE =
  "Utilize this procedure for all scheduled PM shutdowns, any maintenance task that requires you to place your body in harms way of the equipment, or if you have to leave the area while the equipment is in service.";

export const LOTO_DEFAULT_PRINT_ENFORCEMENT =
  "Failure to properly follow lockout-tagout procedure may result in corrective action up to and including termination.";

export const LOTO_DEFAULT_SHUTDOWN_SEQUENCE: LotoSequenceStepForm[] = [
  {
    step: "Notify Employees",
    description:
      "Notify all affected employees that servicing or maintenance is required on a machine or equipment, and that the machine or equipment must be shut down and locked out to perform the servicing or maintenance.",
  },
  {
    step: "Review Lockout Procedure",
    description:
      "The authorized employee shall refer to the company procedure to identify the type and magnitude of the energy that the machine or equipment utilizes, shall understand the hazards of the energy, and shall know the methods to control the energy.",
  },
  {
    step: "Perform Machine Stop",
    description:
      "If the machine or equipment is operating, shut it down by the normal stopping procedure (depress stop button, open toggle switch, etc.).",
  },
  {
    step: "Isolate Energy",
    description:
      "De-activate the energy isolating device(s) so that the machine or equipment is isolated from the energy source(s).",
  },
  {
    step: "Lockout Energy",
    description: "Lock out the energy isolating device(s) with assigned individual lock(s).",
  },
  {
    step: "Dissipate Energy",
    description:
      "Stored or residual energy (such as that in capacitors, springs, elevated machine members, rotating flywheels, hydraulic systems, and air, gas, steam, or water pressure, etc.) must be dissipated or restrained by methods such as grounding, repositioning, blocking, bleeding down, etc.",
  },
  {
    step: "Attempt Restart",
    description:
      'Ensure that the equipment is disconnected from the energy source(s) by first checking that no personnel are exposed, then verify the isolation of the equipment by operating the push button or other normal operating control(s) or by testing to make certain the equipment will not operate. Caution: Return operating control(s) to neutral or "off" position after verifying the isolation of the equipment.',
  },
];

export const LOTO_DEFAULT_RESTORE_SEQUENCE: LotoSequenceStepForm[] = [
  {
    step: "Check Machine",
    description:
      "Check the machine or equipment and the immediate area around the machine or equipment to ensure that nonessential items have been removed and that the machine or equipment components are operationally intact.",
  },
  {
    step: "Check Area",
    description:
      "Check the work area to ensure that all employees have been safely positioned or removed from the area.",
  },
  {
    step: "Verify Machine",
    description: "Verify that the controls are in neutral.",
  },
  {
    step: "Remove Lockout",
    description:
      "Remove the lockout devices and reenergize the machine or equipment. Note: The removal of some forms of blocking may require reenergization of the machine before safe removal.",
  },
  {
    step: "Notify Employees",
    description:
      "Notify affected employees that the servicing or maintenance is completed and the machine or equipment is ready for use.",
  },
];

function sequenceFromPayload(
  raw: unknown,
  fallback: LotoSequenceStepForm[],
): LotoSequenceStepForm[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback.map((row) => ({ ...row }));
  const rows: LotoSequenceStepForm[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    const step = text(row.step) || text(row.title) || text(row.name);
    const description = text(row.description) || text(row.text) || text(row.instruction);
    if (!step && !description) continue;
    rows.push({ step: step || "Step", description });
  }
  return rows.length > 0 ? rows : fallback.map((row) => ({ ...row }));
}

export function emptyLotoStepForm(): LotoStepForm {
  return {
    energySourceName: "",
    energyMagnitude: "",
    isolationLocationText: "",
    lockoutDeviceName: "",
    isolationAction: "",
    verificationMethodName: "",
    descriptionCode: "",
    customDescription: "",
    printedProcedureDescription: "",
    stepImageUrl: "",
    stepImageFileName: "",
    stepImagePreviewUrl: "",
    stepImageAnnotations: [],
    stepImages: [],
  };
}

export function emptyLotoProcedureForm(): LotoProcedureFormState {
  return {
    title: "",
    equipmentName: "",
    equipmentId: "",
    equipmentExternalId: "",
    equipmentTypeName: "",
    siteId: "",
    siteName: "",
    departmentId: "",
    departmentName: "",
    divisionName: "",
    areaName: "",
    procedureNumber: "",
    revision: "1",
    scope: "",
    precautions: [],
    steps: [emptyLotoStepForm()],
    restorationLabel: "Guards replaced / personnel clear",
    equipmentImageUrl: "",
    equipmentImageCaption: "",
    equipmentImageFileName: "",
    equipmentImagePreviewUrl: "",
    equipmentImageAnnotations: [],
    equipmentImages: [],
    printPurpose: LOTO_DEFAULT_PRINT_PURPOSE,
    printScopeStatement: LOTO_DEFAULT_PRINT_SCOPE,
    printEnforcement: LOTO_DEFAULT_PRINT_ENFORCEMENT,
    shutdownSequence: LOTO_DEFAULT_SHUTDOWN_SEQUENCE.map((row) => ({ ...row })),
    restoreSequence: LOTO_DEFAULT_RESTORE_SEQUENCE.map((row) => ({ ...row })),
  };
}

function verificationTextFromStep(row: Record<string, unknown>): string {
  const payload = asRecord(row.sourcePayload);
  const fromPayload = text(payload.verificationMethodName) || text(payload.verification);
  if (fromPayload) return fromPayload;
  const instruction = text(row.instruction);
  const prefix = "Verify zero energy:";
  if (instruction.toLowerCase().startsWith(prefix.toLowerCase())) {
    return instruction.slice(prefix.length).trim();
  }
  return "";
}

function notesToPrecautions(raw: unknown): LotoPrecautionSelection[] {
  return lotoNormalizeNotes(raw).map((note) => ({
    id: note.id,
    shortName: note.label,
    text: note.text,
  }));
}

function buildPrintedDescription(step: LotoStepForm): string {
  if (step.printedProcedureDescription.trim()) return step.printedProcedureDescription.trim();
  return [
    step.isolationLocationText && `Location: ${step.isolationLocationText}`,
    step.descriptionCode && `Description: ${step.descriptionCode}`,
    step.customDescription && `Detail: ${step.customDescription}`,
    step.lockoutDeviceName && `Device: ${step.lockoutDeviceName}`,
    step.isolationAction && `Method: ${step.isolationAction}`,
    step.verificationMethodName && `Verification: ${step.verificationMethodName}`,
  ]
    .filter(Boolean)
    .join(" — ");
}

/** Map API procedure detail into the shared create/edit form. */
export function lotoProcedureFormFromDetail(
  detail: Record<string, unknown>,
): LotoProcedureFormState {
  const procedure = asRecord(detail.procedure ?? detail);
  const equipmentName = lotoProcedureEquipmentName(procedure);
  const areaName = lotoProcedureAreaName(procedure);
  const rawSteps = Array.isArray(detail.steps) ? detail.steps : [];
  const payloadSteps = Array.isArray(procedure.steps) ? procedure.steps : [];
  const isolationSteps = rawSteps.map((raw) => asRecord(raw)).filter((row) => !row.isVerification);

  let steps: LotoStepForm[] = isolationSteps.map((row) => {
    const payload = asRecord(row.sourcePayload);
    const verifyRow = rawSteps
      .map((raw) => asRecord(raw))
      .find(
        (candidate) =>
          candidate.isVerification &&
          (text(candidate.isolationPointId) === text(row.isolationPointId) ||
            Number(candidate.stepNumber) === Number(row.stepNumber) + 1),
      );
    return {
      energySourceName:
        text(payload.energySourceName) || text(payload.energyType) || text(row.energyType) || "",
      energyMagnitude:
        text(payload.energyMagnitude) || text(payload.magnitude) || text(row.magnitude),
      isolationLocationText:
        text(payload.isolationLocationText) ||
        text(payload.locationDescription) ||
        text(row.locationDescription),
      lockoutDeviceName: text(payload.lockoutDeviceName) || text(payload.label) || text(row.label),
      isolationAction:
        text(payload.isolationAction) || text(payload.isolationMethod) || text(row.isolationMethod),
      verificationMethodName: verifyRow
        ? verificationTextFromStep(verifyRow)
        : text(payload.verificationMethodName),
      descriptionCode: text(payload.descriptionCode) || text(payload.code),
      customDescription: text(payload.customDescription) || text(payload.customText),
      printedProcedureDescription:
        text(payload.printedProcedureDescription) ||
        text(payload.printedDescription) ||
        text(row.instruction),
      stepImageUrl: text(payload.stepImageUrl) || text(payload.stepImageStorageKey),
      stepImageFileName: text(payload.stepImageFileName),
      stepImagePreviewUrl: "",
      stepImageAnnotations: normalizeLotoImageArrows(
        payload.stepImageAnnotations ?? row.stepImageAnnotations,
      ),
      stepImages: normalizeLotoPhotoForms(payload.stepImages ?? row.stepImages, {
        imageUrl: text(payload.stepImageUrl) || text(payload.stepImageStorageKey),
        fileName: text(payload.stepImageFileName),
        annotations: payload.stepImageAnnotations ?? row.stepImageAnnotations,
      }),
    };
  });

  if (steps.length === 0 && payloadSteps.length > 0) {
    steps = payloadSteps.map((raw) => {
      const row = asRecord(raw);
      return {
        energySourceName: text(row.energySourceName) || text(row.energyType),
        energyMagnitude: text(row.energyMagnitude) || text(row.magnitude),
        isolationLocationText: text(row.isolationLocationText) || text(row.locationDescription),
        lockoutDeviceName: text(row.lockoutDeviceName) || text(row.label),
        isolationAction: text(row.isolationAction) || text(row.isolationMethod),
        verificationMethodName: text(row.verificationMethodName),
        descriptionCode: text(row.descriptionCode) || text(row.code),
        customDescription: text(row.customDescription) || text(row.customText),
        printedProcedureDescription:
          text(row.printedProcedureDescription) || text(row.printedDescription),
        stepImageUrl: text(row.stepImageUrl) || text(row.stepImageStorageKey),
        stepImageFileName: text(row.stepImageFileName),
        stepImagePreviewUrl: "",
        stepImageAnnotations: normalizeLotoImageArrows(row.stepImageAnnotations),
        stepImages: normalizeLotoPhotoForms(row.stepImages, {
          imageUrl: text(row.stepImageUrl) || text(row.stepImageStorageKey),
          fileName: text(row.stepImageFileName),
          annotations: row.stepImageAnnotations,
        }),
      };
    });
  }

  if (steps.length === 0) {
    steps = [emptyLotoStepForm()];
  }

  steps = steps.map((step) => syncStepLegacyPhotoFields(step));

  return {
    title: text(procedure.title) || text(detail.title),
    equipmentName: equipmentName === "—" ? "" : equipmentName,
    equipmentId: text(procedure.equipmentId) || text(detail.equipmentId),
    equipmentExternalId:
      lotoProcedureEquipmentExternalId(procedure) || lotoProcedureEquipmentExternalId(detail),
    equipmentTypeName: lotoProcedureEquipmentType(procedure) || lotoProcedureEquipmentType(detail),
    siteId: text(procedure.siteId) || text(detail.siteId),
    siteName:
      lotoProcedureSiteName(procedure) !== "—"
        ? lotoProcedureSiteName(procedure)
        : lotoProcedureSiteName(detail) !== "—"
          ? lotoProcedureSiteName(detail)
          : "",
    departmentId:
      text(procedure.departmentId) ||
      text(detail.departmentId) ||
      text(asRecord(procedure.source_payload ?? procedure.sourcePayload).departmentId) ||
      text(asRecord(detail.source_payload ?? detail.sourcePayload).departmentId),
    departmentName:
      lotoProcedureDepartmentName(procedure) !== "—"
        ? lotoProcedureDepartmentName(procedure)
        : lotoProcedureDepartmentName(detail) !== "—"
          ? lotoProcedureDepartmentName(detail)
          : "",
    divisionName:
      lotoProcedureDivisionName(procedure) !== "—"
        ? lotoProcedureDivisionName(procedure)
        : lotoProcedureDivisionName(detail) !== "—"
          ? lotoProcedureDivisionName(detail)
          : "",
    areaName: areaName === "—" ? "" : areaName,
    procedureNumber: text(procedure.procedureNumber) || text(detail.procedureNumber),
    revision: text(procedure.revision) || text(detail.revision) || "1",
    scope:
      plainText(detail.scope) ||
      plainText(procedure.scope) ||
      plainText(detail.description) ||
      plainText(procedure.description) ||
      plainText(detail.workDescription) ||
      plainText(procedure.workDescription),
    precautions: notesToPrecautions(detail.notes ?? procedure.notes),
    steps,
    restorationLabel:
      lotoNormalizeRestorationChecks(detail.restorationChecks ?? procedure.restorationChecks)[0]
        ?.label || "Guards replaced / personnel clear",
    ...(() => {
      const sourcePayload = asRecord(procedure.source_payload ?? procedure.sourcePayload);
      const detailPayload = asRecord(detail.source_payload ?? detail.sourcePayload);
      const equipmentImageUrl =
        text(procedure.equipmentImageUrl) ||
        text(procedure.equipmentImageStorageKey) ||
        text(detail.equipmentImageUrl) ||
        text(sourcePayload.equipmentImageUrl) ||
        text(sourcePayload.equipmentImageStorageKey) ||
        text(detailPayload.equipmentImageUrl);
      const equipmentImageCaption =
        text(procedure.equipmentImageCaption) ||
        text(detail.equipmentImageCaption) ||
        text(sourcePayload.equipmentImageCaption);
      const equipmentImageFileName =
        text(procedure.equipmentImageFileName) || text(sourcePayload.equipmentImageFileName);
      const equipmentImageAnnotations = normalizeLotoImageArrows(
        procedure.equipmentImageAnnotations ??
          detail.equipmentImageAnnotations ??
          sourcePayload.equipmentImageAnnotations,
      );
      return syncEquipmentLegacyPhotoFields({
        equipmentImages: normalizeLotoPhotoForms(
          procedure.equipmentImages ??
            detail.equipmentImages ??
            sourcePayload.equipmentImages ??
            detailPayload.equipmentImages,
          {
            imageUrl: equipmentImageUrl,
            fileName: equipmentImageFileName,
            annotations: equipmentImageAnnotations,
            caption: equipmentImageCaption,
          },
        ),
        equipmentImageUrl,
        equipmentImageFileName,
        equipmentImagePreviewUrl: "",
        equipmentImageAnnotations,
        equipmentImageCaption,
      });
    })(),
    printPurpose:
      plainText(procedure.printPurpose) ||
      plainText(detail.printPurpose) ||
      plainText(asRecord(procedure.source_payload ?? procedure.sourcePayload).printPurpose) ||
      LOTO_DEFAULT_PRINT_PURPOSE,
    printScopeStatement:
      plainText(procedure.printScopeStatement) ||
      plainText(detail.printScopeStatement) ||
      plainText(
        asRecord(procedure.source_payload ?? procedure.sourcePayload).printScopeStatement,
      ) ||
      LOTO_DEFAULT_PRINT_SCOPE,
    printEnforcement:
      plainText(procedure.printEnforcement) ||
      plainText(detail.printEnforcement) ||
      plainText(asRecord(procedure.source_payload ?? procedure.sourcePayload).printEnforcement) ||
      LOTO_DEFAULT_PRINT_ENFORCEMENT,
    shutdownSequence: sequenceFromPayload(
      procedure.shutdownSequence ??
        detail.shutdownSequence ??
        asRecord(procedure.source_payload ?? procedure.sourcePayload).shutdownSequence,
      LOTO_DEFAULT_SHUTDOWN_SEQUENCE,
    ),
    restoreSequence: sequenceFromPayload(
      procedure.restoreSequence ??
        detail.restoreSequence ??
        asRecord(procedure.source_payload ?? procedure.sourcePayload).restoreSequence,
      LOTO_DEFAULT_RESTORE_SEQUENCE,
    ),
  };
}

/** Build create/update API payload from the shared form. */
export function lotoProcedurePayloadFromForm(
  form: LotoProcedureFormState,
): Record<string, unknown> {
  const equipmentName = form.equipmentName.trim();
  const title = form.title.trim() || (equipmentName ? `${equipmentName} LOTO` : "");
  const today = new Date().toISOString().slice(0, 10);
  const siteName = form.siteName.trim();
  const departmentName = form.departmentName.trim();
  const divisionName = form.divisionName.trim();
  const areaName = form.areaName.trim();
  return {
    title,
    equipmentName,
    equipmentId: form.equipmentId.trim() || null,
    equipmentExternalId: form.equipmentExternalId.trim() || null,
    equipmentTypeName: form.equipmentTypeName.trim() || null,
    equipmentTypeNameSnapshot: form.equipmentTypeName.trim() || null,
    siteId: form.siteId.trim() || null,
    siteName: siteName || null,
    siteNameSnapshot: siteName || null,
    departmentId: form.departmentId.trim() || null,
    departmentName: departmentName || null,
    departmentNameSnapshot: departmentName || null,
    divisionName: divisionName || null,
    divisionNameSnapshot: divisionName || null,
    areaName: areaName || null,
    areaNameSnapshot: areaName || null,
    procedureNumber: form.procedureNumber.trim() || undefined,
    revision: form.revision.trim() || "1",
    scope: form.scope.trim(),
    notes: form.precautions.map((note, index) => ({
      id: note.id || `precaution-${index}`,
      category: note.category || "General",
      shortName: note.shortName,
      text: note.text,
      sortOrder: index,
    })),
    steps: form.steps.map((step, index) => {
      const printed = buildPrintedDescription(step);
      const descriptionCode = step.descriptionCode.trim();
      const energySourceName =
        step.energySourceName.trim() ||
        descriptionCode ||
        step.customDescription.trim() ||
        "Energy";
      const synced = syncStepLegacyPhotoFields(step);
      return {
        sortOrder: index,
        stepNumber: index + 1,
        energySourceName,
        energyMagnitude: step.energyMagnitude.trim() || descriptionCode || null,
        isolationLocationText: step.isolationLocationText.trim(),
        lockoutDeviceName: step.lockoutDeviceName.trim(),
        isolationAction: step.isolationAction.trim(),
        verificationMethodName: step.verificationMethodName.trim(),
        descriptionCode,
        customDescription: step.customDescription.trim(),
        printedProcedureDescription: printed,
        instruction: printed,
        stepImageUrl: synced.stepImageUrl.trim() || null,
        stepImageFileName: synced.stepImageFileName.trim() || null,
        stepImageAnnotations: synced.stepImageAnnotations,
        stepImages: lotoPhotoFormsToPayload(synced.stepImages),
      };
    }),
    restorationChecks: form.restorationLabel.trim()
      ? [
          {
            sortOrder: 0,
            checkKey: "clearance",
            label: form.restorationLabel.trim(),
            completed: false,
          },
        ]
      : [],
    ...(() => {
      const synced = syncEquipmentLegacyPhotoFields(form);
      return {
        equipmentImageUrl: synced.equipmentImageUrl.trim() || null,
        equipmentImageCaption: synced.equipmentImageCaption.trim() || null,
        equipmentImageFileName: synced.equipmentImageFileName.trim() || null,
        equipmentImageAnnotations: synced.equipmentImageAnnotations,
        equipmentImages: lotoPhotoFormsToPayload(synced.equipmentImages),
      };
    })(),
    printPurpose: form.printPurpose.trim() || LOTO_DEFAULT_PRINT_PURPOSE,
    printScopeStatement: form.printScopeStatement.trim() || LOTO_DEFAULT_PRINT_SCOPE,
    printEnforcement: form.printEnforcement.trim() || LOTO_DEFAULT_PRINT_ENFORCEMENT,
    shutdownSequence: form.shutdownSequence
      .map((row) => ({
        step: row.step.trim(),
        description: row.description.trim(),
      }))
      .filter((row) => row.step || row.description),
    restoreSequence: form.restoreSequence
      .map((row) => ({
        step: row.step.trim(),
        description: row.description.trim(),
      }))
      .filter((row) => row.step || row.description),
    leftFooter: siteName || null,
    centerFooter: areaName || null,
    rightFooter: today,
  };
}

/** Lockout detail page. Ids stay in the query string (static export). */
export function lotoLockoutHref(id: string): string {
  return `/modules/lockout-tagout/lockout/?id=${encodeURIComponent(id)}`;
}

export type LotoEnergyItem = {
  id: string;
  energyType: string;
  magnitude: string;
  description: string;
};
export type LotoIsolationItem = {
  id: string;
  label: string;
  locationDescription: string;
  isolationMethod: string;
};
export type LotoStepItem = {
  id: string;
  stepNumber: number;
  stepPhase: string;
  instruction: string;
  /** Free-text "Enter your own description" from the procedure form. */
  customDescription: string;
  descriptionCode: string;
  energySourceName: string;
  isVerification: boolean;
  /** Primary / legacy step photo. */
  stepImageUrl: string;
  stepImageAnnotations: LotoImageArrow[];
  /** All step photos (includes primary as index 0 when present). */
  stepImages: LotoPhotoDisplay[];
};

export type LotoNoteItem = { id: string; label: string; text: string };
export type LotoRestorationItem = { id: string; label: string; completed: boolean };
export type LotoAttachmentItem = {
  id: string;
  filename: string;
  url: string;
  contentType: string;
};

export type LotoProcedureDisplay = {
  equipmentName: string;
  equipmentTypeName: string;
  equipmentExternalId: string;
  siteName: string;
  departmentName: string;
  divisionName: string;
  areaName: string;
  procedureNumber: string;
  revision: string;
  scope: string;
  status: string;
  title: string;
  /** Primary / legacy equipment photo. */
  equipmentImageUrl: string;
  equipmentImageCaption: string;
  equipmentImageAnnotations: LotoImageArrow[];
  /** All equipment photos (includes primary as index 0 when present). */
  equipmentImages: LotoPhotoDisplay[];
  reviewReturnNotes: string;
  reviewReturnedAt: string;
  reviewReturnedByName: string;
  notes: LotoNoteItem[];
  restorationChecks: LotoRestorationItem[];
  attachments: LotoAttachmentItem[];
  tags: string[];
  energySources: LotoEnergyItem[];
  isolationPoints: LotoIsolationItem[];
  steps: LotoStepItem[];
};

export type LotoLockoutItems = {
  energySources: LotoEnergyItem[];
  isolationPoints: LotoIsolationItem[];
  steps: LotoStepItem[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function splitLines(block: string): string[] {
  return block
    .split(/\r?\n|;/)
    .map((line) => line.replace(/^\s*\d+[).:\s-]+/, "").trim())
    .filter(Boolean);
}

export function lotoProcedureEquipmentType(row: Record<string, unknown>): string {
  return (
    text(row.equipmentTypeName) ||
    text(row.equipmentTypeNameSnapshot) ||
    text(row.equipmentType) ||
    ""
  );
}

export function lotoProcedureEquipmentExternalId(row: Record<string, unknown>): string {
  return text(row.equipmentExternalId) || text(row.equipmentNumber) || text(row.assetTag) || "";
}

export function lotoNormalizeNotes(raw: unknown): LotoNoteItem[] {
  if (typeof raw === "string" && raw.trim()) {
    return [{ id: "note-0", label: "Note", text: raw.trim() }];
  }
  if (!Array.isArray(raw)) return [];
  const notes: LotoNoteItem[] = [];
  for (const [i, item] of raw.entries()) {
    if (typeof item === "string" && item.trim()) {
      notes.push({ id: `note-${i}`, label: "Note", text: item.trim() });
      continue;
    }
    const row = asRecord(item);
    const body =
      text(row.text) ||
      text(row.body) ||
      text(row.note) ||
      text(row.content) ||
      text(row.shortName);
    if (!body) continue;
    notes.push({
      id: text(row.id) || `note-${i}`,
      label: text(row.shortName) || text(row.category) || text(row.title) || "Note",
      text: body,
    });
  }
  return notes;
}

export function lotoNormalizeRestorationChecks(raw: unknown): LotoRestorationItem[] {
  if (!Array.isArray(raw)) return [];
  const checks: LotoRestorationItem[] = [];
  for (const [i, item] of raw.entries()) {
    if (typeof item === "string" && item.trim()) {
      checks.push({ id: `restore-${i}`, label: item.trim(), completed: false });
      continue;
    }
    const row = asRecord(item);
    const label =
      text(row.label) ||
      text(row.text) ||
      text(row.instruction) ||
      text(row.checkLabel) ||
      text(row.name);
    if (!label) continue;
    checks.push({
      id: text(row.id) || text(row.checkKey) || `restore-${i}`,
      label,
      completed: Boolean(row.completed ?? row.done ?? row.checked),
    });
  }
  return checks;
}

export function lotoNormalizeAttachments(raw: unknown): LotoAttachmentItem[] {
  if (!Array.isArray(raw)) return [];
  const attachments: LotoAttachmentItem[] = [];
  for (const [i, item] of raw.entries()) {
    const row = asRecord(item);
    const filename = text(row.filename) || text(row.name) || text(row.title);
    const url = text(row.url) || text(row.storageKey) || text(row.downloadUrl);
    if (!filename && !url) continue;
    attachments.push({
      id: text(row.id) || `attachment-${i}`,
      filename: filename || `Attachment ${i + 1}`,
      url,
      contentType: text(row.contentType) || text(row.mimeType),
    });
  }
  return attachments;
}

export function lotoNormalizeTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((tag) => text(tag)).filter(Boolean);
  const single = text(raw);
  return single ? [single] : [];
}

function mapEnergyRows(rows: unknown[]): LotoEnergyItem[] {
  return rows.map((raw, i) => {
    const item = asRecord(raw);
    const magnitude = text(item.magnitude) || text(item.energyMagnitude);
    const description = text(item.description) || text(item.energyNotes);
    return {
      id: text(item.id) || `energy-${i}`,
      energyType:
        text(item.energyType) || text(item.type) || text(item.energySourceName) || "Energy",
      magnitude: magnitude || (!magnitude && description ? description : ""),
      description: magnitude ? description : "",
    };
  });
}

function mapIsolationRows(rows: unknown[]): LotoIsolationItem[] {
  return rows.map((raw, i) => {
    const item = asRecord(raw);
    return {
      id: text(item.id) || `iso-${i}`,
      label:
        text(item.label) ||
        text(item.name) ||
        text(item.lockoutDeviceName) ||
        `Isolation point ${i + 1}`,
      locationDescription:
        text(item.locationDescription) ||
        text(item.isolationLocationText) ||
        text(item.location) ||
        text(item.deviceType),
      isolationMethod:
        text(item.isolationMethod) || text(item.isolationAction) || text(item.method),
    };
  });
}

function stepPhotoFieldsFromRow(
  row: Record<string, unknown>,
  nested?: Record<string, unknown>,
): Pick<LotoStepItem, "stepImageUrl" | "stepImageAnnotations" | "stepImages"> {
  const payload = nested ?? {};
  const stepImages = lotoPhotosToDisplay(row.stepImages ?? payload.stepImages, {
    imageUrl:
      text(row.stepImageUrl) ||
      text(row.stepImageStorageKey) ||
      text(payload.stepImageUrl) ||
      text(payload.stepImageStorageKey),
    fileName: text(row.stepImageFileName) || text(payload.stepImageFileName),
    annotations: row.stepImageAnnotations ?? payload.stepImageAnnotations,
  });
  const primary = stepImages[0];
  return {
    stepImageUrl: primary?.imageUrl ?? "",
    stepImageAnnotations: primary?.annotations ?? [],
    stepImages,
  };
}

function mapStepRows(rows: unknown[]): LotoStepItem[] {
  return rows.map((raw, i) => {
    const item = asRecord(raw);
    const payload = asRecord(item.sourcePayload ?? item.source_payload);
    return {
      id: text(item.id) || `step-${i}`,
      stepNumber: Number(item.stepNumber ?? i + 1) || i + 1,
      stepPhase: text(item.stepPhase) || "STEP",
      instruction: text(item.instruction) || text(item.description),
      customDescription:
        text(item.customDescription) ||
        text(item.customText) ||
        text(payload.customDescription) ||
        text(payload.customText),
      descriptionCode:
        text(item.descriptionCode) ||
        text(item.code) ||
        text(payload.descriptionCode) ||
        text(payload.code),
      energySourceName:
        text(item.energySourceName) ||
        text(item.energyType) ||
        text(payload.energySourceName) ||
        text(payload.energyType),
      isVerification: Boolean(item.isVerification),
      ...stepPhotoFieldsFromRow(item, payload),
    };
  });
}

/** Derive energy / isolation / steps from Firebase-style procedure step objects. */
export function deriveProcedureItemsFromPayloadSteps(rawSteps: unknown[]): LotoLockoutItems {
  const energySources: LotoEnergyItem[] = [];
  const isolationPoints: LotoIsolationItem[] = [];
  const steps: LotoStepItem[] = [];
  let stepNo = 1;
  for (const [i, raw] of rawSteps.entries()) {
    const row = asRecord(raw);
    // Already-normalized control steps (from child tables) — keep as-is.
    if (
      text(row.instruction) &&
      (text(row.stepPhase) || row.isVerification != null) &&
      !text(row.energySourceName)
    ) {
      const nested = asRecord(row.sourcePayload ?? row.source_payload);
      steps.push({
        id: text(row.id) || `step-${i}`,
        stepNumber: Number(row.stepNumber ?? stepNo) || stepNo,
        stepPhase: text(row.stepPhase) || "STEP",
        instruction: text(row.instruction),
        customDescription:
          text(row.customDescription) ||
          text(row.customText) ||
          text(nested.customDescription) ||
          text(nested.customText),
        descriptionCode:
          text(row.descriptionCode) ||
          text(row.code) ||
          text(nested.descriptionCode) ||
          text(nested.code),
        energySourceName:
          text(row.energySourceName) ||
          text(row.energyType) ||
          text(nested.energySourceName) ||
          text(nested.energyType),
        isVerification: Boolean(row.isVerification),
        ...stepPhotoFieldsFromRow(row, nested),
      });
      stepNo += 1;
      continue;
    }
    const customDescription = text(row.customDescription) || text(row.customText);
    const energyType =
      text(row.energySourceName) ||
      text(row.energyType) ||
      text(row.energySource) ||
      text(row.descriptionCode);
    const magnitude = text(row.energyMagnitude) || text(row.magnitude) || text(row.descriptionCode);
    const description = text(row.energyNotes) || customDescription || text(row.description);
    const location =
      text(row.isolationLocationText) || text(row.locationDescription) || text(row.location);
    const method = text(row.isolationAction) || text(row.isolationMethod) || text(row.method);
    const label =
      text(row.lockoutDeviceName) ||
      text(row.label) ||
      text(row.deviceName) ||
      energyType ||
      `Point ${i + 1}`;
    const printed = text(row.printedProcedureDescription) || text(row.printedDescription);
    const instruction =
      text(row.instruction) ||
      text(row.text) ||
      printed ||
      [
        energyType && `Isolate ${energyType}`,
        magnitude && `(${magnitude})`,
        location && `at ${location}`,
        method && `by ${method}`,
        label && label !== energyType && `using ${label}`,
      ]
        .filter(Boolean)
        .join(" ");
    const verification =
      text(row.verificationMethodName) ||
      (typeof row.verification === "string" ? text(row.verification) : "") ||
      text(row.verificationMethod);
    if (!energyType && !instruction && !label && !location && !verification) continue;
    if (energyType) {
      energySources.push({
        id: `energy-${i}`,
        energyType,
        magnitude: magnitude === energyType ? "" : magnitude,
        description,
      });
    }
    isolationPoints.push({
      id: `iso-${i}`,
      label,
      locationDescription: location,
      isolationMethod: method,
    });
    steps.push({
      id: `step-${i}`,
      stepNumber: stepNo,
      stepPhase: text(row.stepPhase) || "ISOLATION",
      instruction: instruction || `Isolation step ${i + 1}`,
      customDescription,
      descriptionCode: text(row.descriptionCode) || text(row.code),
      energySourceName: energyType,
      isVerification: false,
      ...stepPhotoFieldsFromRow(row),
    });
    stepNo += 1;
    if (verification) {
      steps.push({
        id: `verify-${i}`,
        stepNumber: stepNo,
        stepPhase: "VERIFICATION",
        instruction: `Verify zero energy: ${verification}`,
        customDescription: "",
        descriptionCode: text(row.descriptionCode) || text(row.code),
        energySourceName: energyType,
        isVerification: true,
        stepImageUrl: "",
        stepImageAnnotations: [],
        stepImages: [],
      });
      stepNo += 1;
    }
  }
  return { energySources, isolationPoints, steps };
}

/**
 * Flatten procedure detail for dashboard / detail pages.
 * Prefers normalized child arrays; falls back to Firebase payload step shapes.
 */
/** When child-table steps omit photos, copy them from procedure payload steps. */
function mergeStepPhotosFromPayload(
  steps: LotoStepItem[],
  payloadSteps: unknown[],
): LotoStepItem[] {
  if (steps.length === 0 || payloadSteps.length === 0) return steps;
  const byNumber = new Map<number, ReturnType<typeof stepPhotoFieldsFromRow>>();
  for (const [i, raw] of payloadSteps.entries()) {
    const row = asRecord(raw);
    const nested = asRecord(row.sourcePayload ?? row.source_payload);
    const photos = stepPhotoFieldsFromRow(row, nested);
    if (!photos.stepImages.some((p) => isDisplayableLotoImageUrl(p.imageUrl))) continue;
    const num = Number(row.stepNumber ?? i + 1) || i + 1;
    byNumber.set(num, photos);
    // Also key isolation rows without a stable number by index.
    byNumber.set(-(i + 1), photos);
  }
  if (byNumber.size === 0) return steps;

  return steps.map((step, index) => {
    if (step.stepImages.some((p) => isDisplayableLotoImageUrl(p.imageUrl))) return step;
    const photos = byNumber.get(step.stepNumber) ?? byNumber.get(-(index + 1)) ?? null;
    if (!photos) return step;
    return {
      ...step,
      stepImageUrl: photos.stepImageUrl,
      stepImageAnnotations: photos.stepImageAnnotations,
      stepImages: photos.stepImages,
    };
  });
}

export function extractProcedureDisplay(
  detail: Record<string, unknown> | null | undefined,
): LotoProcedureDisplay {
  const source = detail ?? {};
  const procedure = asRecord(source.procedure ?? source);
  const energyRaw = Array.isArray(source.energySources) ? source.energySources : [];
  const isolationRaw = Array.isArray(source.isolationPoints) ? source.isolationPoints : [];
  const stepsRaw = Array.isArray(source.steps) ? source.steps : [];
  const sourcePayload = asRecord(procedure.source_payload ?? procedure.sourcePayload);
  const detailPayload = asRecord(source.source_payload ?? source.sourcePayload);
  const payloadSteps = Array.isArray(procedure.steps)
    ? procedure.steps
    : Array.isArray(sourcePayload.steps)
      ? sourcePayload.steps
      : Array.isArray(detailPayload.steps)
        ? detailPayload.steps
        : [];

  let energySources = mapEnergyRows(energyRaw);
  let isolationPoints = mapIsolationRows(isolationRaw);
  let steps = mapStepRows(stepsRaw);

  const childrenEmpty =
    energySources.length === 0 && isolationPoints.length === 0 && steps.length === 0;
  if (childrenEmpty) {
    const derived = deriveProcedureItemsFromPayloadSteps(
      stepsRaw.length > 0 ? stepsRaw : payloadSteps,
    );
    energySources = derived.energySources;
    isolationPoints = derived.isolationPoints;
    steps = derived.steps;
  } else {
    // Child rows sometimes store instructions without the embedded photo data URLs
    // that still live on procedure.sourcePayload.steps — merge them back for display.
    steps = mergeStepPhotosFromPayload(steps, payloadSteps);
  }

  return {
    equipmentName: lotoProcedureEquipmentName(procedure) || lotoProcedureEquipmentName(source),
    equipmentTypeName: lotoProcedureEquipmentType(procedure) || lotoProcedureEquipmentType(source),
    equipmentExternalId:
      lotoProcedureEquipmentExternalId(procedure) || lotoProcedureEquipmentExternalId(source),
    siteName: lotoProcedureSiteName(procedure) || lotoProcedureSiteName(source),
    departmentName: lotoProcedureDepartmentName(procedure) || lotoProcedureDepartmentName(source),
    divisionName: lotoProcedureDivisionName(procedure) || lotoProcedureDivisionName(source),
    areaName: lotoProcedureAreaName(procedure) || lotoProcedureAreaName(source),
    procedureNumber: text(procedure.procedureNumber) || text(source.procedureNumber),
    revision: text(procedure.revision) || text(source.revision) || "1",
    scope:
      plainText(source.scope) ||
      plainText(procedure.scope) ||
      plainText(source.description) ||
      plainText(procedure.description) ||
      plainText(source.workDescription) ||
      plainText(procedure.workDescription),
    status: text(procedure.status) || text(source.status),
    title: text(procedure.title) || text(source.title),
    ...(() => {
      const sourcePayload = asRecord(procedure.source_payload ?? procedure.sourcePayload);
      const detailPayload = asRecord(source.source_payload ?? source.sourcePayload);
      const equipmentImages = lotoPhotosToDisplay(
        procedure.equipmentImages ??
          source.equipmentImages ??
          sourcePayload.equipmentImages ??
          detailPayload.equipmentImages,
        {
          imageUrl:
            text(procedure.equipmentImageUrl) ||
            text(procedure.equipmentImageStorageKey) ||
            text(source.equipmentImageUrl) ||
            text(source.equipmentImageStorageKey),
          fileName: text(procedure.equipmentImageFileName) || text(source.equipmentImageFileName),
          annotations: procedure.equipmentImageAnnotations ?? source.equipmentImageAnnotations,
          caption: text(procedure.equipmentImageCaption) || text(source.equipmentImageCaption),
        },
      );
      const primary = equipmentImages[0];
      return {
        equipmentImageUrl: primary?.imageUrl ?? "",
        equipmentImageCaption:
          text(procedure.equipmentImageCaption) ||
          text(source.equipmentImageCaption) ||
          primary?.caption ||
          "",
        equipmentImageAnnotations: primary?.annotations ?? [],
        equipmentImages,
      };
    })(),
    reviewReturnNotes:
      plainText(asRecord(procedure.source_payload ?? procedure.sourcePayload).reviewReturnNotes) ||
      plainText(procedure.reviewReturnNotes) ||
      plainText(source.reviewReturnNotes),
    reviewReturnedAt:
      plainText(asRecord(procedure.source_payload ?? procedure.sourcePayload).reviewReturnedAt) ||
      plainText(procedure.reviewReturnedAt) ||
      plainText(source.reviewReturnedAt),
    reviewReturnedByName:
      plainText(
        asRecord(procedure.source_payload ?? procedure.sourcePayload).reviewReturnedByName,
      ) ||
      plainText(procedure.reviewReturnedByName) ||
      plainText(source.reviewReturnedByName),
    notes: lotoNormalizeNotes(source.notes ?? procedure.notes),
    restorationChecks: lotoNormalizeRestorationChecks(
      source.restorationChecks ?? procedure.restorationChecks,
    ),
    attachments: lotoNormalizeAttachments(source.attachments ?? procedure.attachments),
    tags: lotoNormalizeTags(source.tags ?? procedure.tags),
    energySources,
    isolationPoints,
    steps,
  };
}

/**
 * Pull energy sources, isolation points, and control steps off a lockout row.
 * Prefers explicit arrays (issued from a procedure), then Firebase `details`.
 */
export function extractLockoutItems(
  row: Record<string, unknown> | null | undefined,
): LotoLockoutItems {
  const source = row ?? {};
  const details = asRecord(source.details);

  let energySources: LotoEnergyItem[] = [];
  if (Array.isArray(source.energySources) && source.energySources.length > 0) {
    energySources = mapEnergyRows(source.energySources);
  } else {
    const listed = text(details.energySources || details.energyTypes);
    const primary = text(details.primaryEnergyType);
    const types = listed
      ? listed
          .split(/[,/|]/)
          .map((part) => part.trim())
          .filter(Boolean)
      : primary
        ? [primary]
        : [];
    energySources = types.map((energyType, i) => ({
      id: `energy-${i}`,
      energyType,
      magnitude: primary && energyType.toLowerCase() === primary.toLowerCase() ? "Primary" : "",
      description: "",
    }));
  }

  let isolationPoints: LotoIsolationItem[] = [];
  if (Array.isArray(source.isolationPoints) && source.isolationPoints.length > 0) {
    isolationPoints = mapIsolationRows(source.isolationPoints);
  } else {
    const controlPoints = text(details.energyControlPoints);
    if (controlPoints) {
      isolationPoints = controlPoints
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, i) => {
          const parts = line
            .split("|")
            .map((part) => part.trim())
            .filter(Boolean);
          return {
            id: `iso-${i}`,
            label: parts[0] || `Isolation point ${i + 1}`,
            locationDescription: parts.slice(1).join(" · "),
            isolationMethod: "",
          };
        });
    } else {
      const device = text(details.isolationDeviceType);
      const placement = text(details.lockTagPlacement);
      if (device || placement) {
        isolationPoints = [
          {
            id: "iso-0",
            label: device || "Isolation device",
            locationDescription: placement,
            isolationMethod: "",
          },
        ];
      }
    }
  }

  let steps: LotoStepItem[] = [];
  if (Array.isArray(source.steps) && source.steps.length > 0) {
    const first = asRecord(source.steps[0]);
    if (text(first.energySourceName) || text(first.lockoutDeviceName)) {
      const derived = deriveProcedureItemsFromPayloadSteps(source.steps);
      return {
        energySources: energySources.length > 0 ? energySources : derived.energySources,
        isolationPoints: isolationPoints.length > 0 ? isolationPoints : derived.isolationPoints,
        steps: derived.steps,
      };
    }
    steps = mapStepRows(source.steps);
  } else {
    const blocks: Array<{ phase: string; text: string; verification?: boolean }> = [
      { phase: "SHUTDOWN", text: text(details.shutdownSteps) },
      { phase: "ISOLATION", text: text(details.isolationSteps) },
      {
        phase: "VERIFICATION",
        text: text(details.verificationMethod || details.verificationMethodSelect),
        verification: true,
      },
      { phase: "RESTART", text: text(details.startupSteps) },
    ];
    let n = 1;
    for (const block of blocks) {
      if (!block.text) continue;
      const lines =
        block.phase === "VERIFICATION" && !block.text.includes("\n")
          ? [`Verify zero energy: ${block.text}`]
          : splitLines(block.text);
      for (const instruction of lines) {
        steps.push({
          id: `step-${n}`,
          stepNumber: n,
          stepPhase: block.phase,
          instruction,
          customDescription: "",
          descriptionCode: "",
          energySourceName: "",
          isVerification: Boolean(block.verification),
          stepImageUrl: "",
          stepImageAnnotations: [],
          stepImages: [],
        });
        n += 1;
      }
    }
  }

  return { energySources, isolationPoints, steps };
}

export function lockoutAuthorizedEmployee(row: Record<string, unknown>): string {
  return (
    text(row.authorizedEmployee) || text(row.workerName) || text(asRecord(row.details).preparedBy)
  );
}

export function lockoutEquipmentName(row: Record<string, unknown>): string {
  const details = asRecord(row.details);
  return (
    text(row.equipmentName) ||
    text(row.equipmentUnit) ||
    text(details.equipmentName) ||
    text(details.machineType)
  );
}

export function isOpenLockoutStatus(status: unknown): boolean {
  const key = upper(status);
  return (
    key === "ISSUED" ||
    key === "VERIFIED" ||
    key === "OPEN" ||
    key === "COMPLIANT" ||
    key === "ACTIVE"
  );
}

export function lotoStats(
  procedures: ReadonlyArray<{ status?: unknown }>,
  lockouts: ReadonlyArray<{ status?: unknown }> = [],
): LotoStats {
  const drafts = procedures.filter((row) => {
    const status = upper(row.status);
    return status === "DRAFT" || status === "NEEDS_CORRECTION";
  }).length;
  const active = procedures.filter((row) => {
    const status = upper(row.status);
    return status === "ACTIVE" || status === "APPROVED";
  }).length;
  const reviews = procedures.filter((row) => {
    const status = upper(row.status);
    return status === "IN_REVIEW" || status === "PENDING_APPROVAL" || status === "REVIEW_DUE";
  }).length;
  const openLockouts = lockouts.filter((row) => isOpenLockoutStatus(row.status)).length;
  return {
    procedures: procedures.length,
    drafts,
    active,
    reviews,
    openLockouts,
  };
}
