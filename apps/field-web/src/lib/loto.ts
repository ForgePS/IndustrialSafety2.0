/** Slim LOTO helpers for Field execute UI (mirrors industrial-web snapshot logic). */

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function upper(value: unknown): string {
  return text(value).toUpperCase();
}

export function isExecutableProcedureStatus(status: unknown): boolean {
  const key = upper(status);
  return key === "ACTIVE" || key === "APPROVED";
}

export function isOpenLockoutStatus(status: unknown): boolean {
  const key = upper(status);
  return key === "ISSUED" || key === "VERIFIED" || key === "OPEN";
}

export function canIssueLockout(status: unknown): boolean {
  return isExecutableProcedureStatus(status);
}

/** Author can optionally submit DRAFT or corrected procedures for EHS review. */
export function lotoCanSubmitForReview(status: unknown): boolean {
  const key = upper(status);
  return key === "DRAFT" || key === "NEEDS_CORRECTION";
}

/** Author can activate a procedure without EHS review when higher validation is not needed. */
export function lotoCanActivateDirect(status: unknown): boolean {
  return lotoCanSubmitForReview(status);
}

/** EHS Director can approve or send back while the procedure is in review. */
export function lotoCanEhsReview(status: unknown): boolean {
  const key = upper(status);
  return key === "IN_REVIEW" || key === "PENDING_APPROVAL";
}

export function lotoIsNeedsCorrection(status: unknown): boolean {
  return upper(status) === "NEEDS_CORRECTION";
}

export function isDisplayableLotoImageUrl(url: unknown): boolean {
  const value = text(url);
  return (
    value.startsWith("data:image/") ||
    value.startsWith("https://") ||
    value.startsWith("http://")
  );
}

export function lotoStatusLabel(status: unknown): string {
  const key = upper(status);
  if (key === "IN_REVIEW") return "In review";
  if (key === "PENDING_APPROVAL") return "Pending approval";
  if (!key) return "Unknown";
  return key.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function lotoProcedureEquipmentName(row: Record<string, unknown>): string {
  return (
    text(row.equipmentName) ||
    text(row.equipmentUnit) ||
    text(row.equipment) ||
    text(row.title) ||
    "—"
  );
}

export function lotoProcedureEquipmentType(row: Record<string, unknown>): string {
  return (
    text(row.equipmentTypeName) ||
    text(row.equipmentTypeNameSnapshot) ||
    text(row.equipmentType) ||
    ""
  );
}

export function lotoProcedureSiteName(row: Record<string, unknown>): string {
  const type = lotoProcedureEquipmentType(row);
  for (const value of [
    text(row.siteName),
    text(row.siteNameSnapshot),
    text(row.site),
    text(row.leftFooter),
  ]) {
    if (!value) continue;
    if (type && value.toLowerCase() === type.toLowerCase()) continue;
    return value;
  }
  return "—";
}

export function lotoProcedureSiteId(row: Record<string, unknown>): string {
  const payload = asRecord(row.source_payload ?? row.sourcePayload);
  return text(row.siteId) || text(payload.siteId) || "";
}

export function lotoProcedureDepartmentId(row: Record<string, unknown>): string {
  const payload = asRecord(row.source_payload ?? row.sourcePayload);
  return text(row.departmentId) || text(payload.departmentId) || "";
}

export function lotoProcedureAreaName(row: Record<string, unknown>): string {
  const type = lotoProcedureEquipmentType(row);
  for (const value of [
    text(row.areaName),
    text(row.areaNameSnapshot),
    text(row.area),
    text(row.processLine),
  ]) {
    if (!value) continue;
    if (type && value.toLowerCase() === type.toLowerCase()) continue;
    return value;
  }
  return "—";
}

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

export function lotoProcedureNumber(row: Record<string, unknown>): string {
  return text(row.procedureNumber) || text(row.number) || "";
}

/** Empty location/department means all (All Locations / All departments).
 * Division is not used for LOTO list filtering — Industrial web scopes by site + department only.
 */
export function matchesLotoOrgScope(
  row: Record<string, unknown>,
  scope: { locationId?: string; locationName?: string; divisionName?: string; departmentId?: string },
): boolean {
  const locationId = text(scope.locationId);
  const locationName = text(scope.locationName);
  const departmentId = text(scope.departmentId);

  if (locationId || locationName) {
    const rowSiteId = lotoProcedureSiteId(row);
    if (rowSiteId) {
      if (locationId && rowSiteId !== locationId) return false;
    } else if (locationName) {
      const rowSite = lotoProcedureSiteName(row);
      if (rowSite !== "—" && rowSite.toLowerCase() !== locationName.toLowerCase()) {
        const needle = locationName.toLowerCase();
        if (!rowSite.toLowerCase().includes(needle) && !needle.includes(rowSite.toLowerCase())) {
          return false;
        }
      }
    }
  }
  if (departmentId) {
    const rowDeptId = lotoProcedureDepartmentId(row);
    if (rowDeptId && rowDeptId !== departmentId) return false;
  }
  return true;
}

/** Sort procedures by Location → Division → Department → equipment name. */
export function compareLotoProceduresByOrg(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): number {
  const siteCmp = lotoProcedureSiteName(a).localeCompare(lotoProcedureSiteName(b), undefined, {
    sensitivity: "base",
  });
  if (siteCmp !== 0) return siteCmp;
  const divCmp = lotoProcedureDivisionName(a).localeCompare(
    lotoProcedureDivisionName(b),
    undefined,
    { sensitivity: "base" },
  );
  if (divCmp !== 0) return divCmp;
  const deptCmp = lotoProcedureDepartmentName(a).localeCompare(
    lotoProcedureDepartmentName(b),
    undefined,
    { sensitivity: "base" },
  );
  if (deptCmp !== 0) return deptCmp;
  return lotoProcedureEquipmentName(a).localeCompare(lotoProcedureEquipmentName(b), undefined, {
    sensitivity: "base",
  });
}

export function filterAndSortLotoProcedures(
  rows: ReadonlyArray<Record<string, unknown>>,
  scope: { locationId?: string; locationName?: string; divisionName?: string; departmentId?: string },
): Array<Record<string, unknown>> {
  return [...rows]
    .filter((row) => matchesLotoOrgScope(row, scope))
    .sort(compareLotoProceduresByOrg);
}

export function lotoProcedureEquipmentExternalId(row: Record<string, unknown>): string {
  return text(row.equipmentExternalId) || text(row.equipmentNumber) || text(row.assetTag) || "";
}

export function lockoutAuthorizedEmployee(row: Record<string, unknown>): string {
  const details = asRecord(row.details);
  return (
    text(row.authorizedEmployee) ||
    text(row.workerName) ||
    text(details.authorizedEmployee) ||
    text(details.workerName) ||
    ""
  );
}

export function lockoutEquipmentName(row: Record<string, unknown>): string {
  const details = asRecord(row.details);
  return (
    text(row.equipmentName) ||
    text(details.equipmentName) ||
    text(row.title) ||
    "—"
  );
}

export type FieldLotoEnergyItem = {
  id: string;
  energyType: string;
  magnitude: string;
  description: string;
};

export type FieldLotoIsolationItem = {
  id: string;
  label: string;
  locationDescription: string;
  isolationMethod: string;
};

export type FieldLotoStepItem = {
  id: string;
  stepNumber: number;
  stepPhase: string;
  instruction: string;
  isVerification: boolean;
  customDescription: string;
  stepImageUrl: string;
};

export type FieldLotoNoteItem = { id: string; label: string; text: string };
export type FieldLotoRestorationItem = { id: string; label: string; completed: boolean };
export type FieldLotoAttachmentItem = {
  id: string;
  filename: string;
  url: string;
  contentType: string;
};

export type FieldLotoProcedureDisplay = {
  id: string;
  title: string;
  status: string;
  equipmentName: string;
  equipmentTypeName: string;
  equipmentExternalId: string;
  siteName: string;
  divisionName: string;
  departmentName: string;
  areaName: string;
  procedureNumber: string;
  revision: string;
  scope: string;
  equipmentImageUrl: string;
  equipmentImageCaption: string;
  reviewReturnNotes: string;
  energySources: FieldLotoEnergyItem[];
  isolationPoints: FieldLotoIsolationItem[];
  steps: FieldLotoStepItem[];
  notes: FieldLotoNoteItem[];
  restorationChecks: FieldLotoRestorationItem[];
  attachments: FieldLotoAttachmentItem[];
  tags: string[];
};

export type FieldLotoLockoutSnapshot = {
  id: string;
  status: string;
  procedureId: string;
  authorizedEmployee: string;
  affectedEmployees: string;
  lockTagId: string;
  tryStartRequired: boolean;
  issuedAt: string;
  verifiedAt: string;
  closedAt: string;
};

export function normalizeNotes(raw: unknown): FieldLotoNoteItem[] {
  if (typeof raw === "string" && raw.trim()) {
    return [{ id: "note-0", label: "Precaution", text: raw.trim() }];
  }
  if (!Array.isArray(raw)) return [];
  const notes: FieldLotoNoteItem[] = [];
  for (const [i, item] of raw.entries()) {
    if (typeof item === "string" && item.trim()) {
      notes.push({ id: `note-${i}`, label: "Precaution", text: item.trim() });
      continue;
    }
    const row = asRecord(item);
    const body =
      text(row.text) || text(row.body) || text(row.note) || text(row.content) || text(row.shortName);
    if (!body) continue;
    notes.push({
      id: text(row.id) || `note-${i}`,
      label: text(row.shortName) || text(row.category) || text(row.title) || "Precaution",
      text: body,
    });
  }
  return notes;
}

export function normalizeRestorationChecks(raw: unknown): FieldLotoRestorationItem[] {
  if (!Array.isArray(raw)) return [];
  const checks: FieldLotoRestorationItem[] = [];
  for (const [i, item] of raw.entries()) {
    if (typeof item === "string" && item.trim()) {
      checks.push({ id: `restore-${i}`, label: item.trim(), completed: false });
      continue;
    }
    const row = asRecord(item);
    const label =
      text(row.label) || text(row.text) || text(row.instruction) || text(row.checkLabel) || text(row.name);
    if (!label) continue;
    checks.push({
      id: text(row.id) || text(row.checkKey) || `restore-${i}`,
      label,
      completed: Boolean(row.completed ?? row.done ?? row.checked),
    });
  }
  return checks;
}

export function normalizeAttachments(raw: unknown): FieldLotoAttachmentItem[] {
  if (!Array.isArray(raw)) return [];
  const attachments: FieldLotoAttachmentItem[] = [];
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

export function extractLockoutSnapshot(row: Record<string, unknown> | null | undefined): FieldLotoLockoutSnapshot | null {
  if (!row) return null;
  const details = asRecord(row.details);
  const payload = asRecord(row.sourcePayload ?? row.source_payload);
  const id = text(row.id);
  if (!id) return null;
  const tryStartRaw = row.tryStartRequired ?? details.tryStartRequired ?? payload.tryStartRequired;
  return {
    id,
    status: text(row.status),
    procedureId: text(row.procedureId) || text(details.procedureId),
    authorizedEmployee: lockoutAuthorizedEmployee(row),
    affectedEmployees:
      text(row.affectedEmployees) ||
      text(details.affectedEmployees) ||
      text(details.affectedEmployeeNames),
    lockTagId: text(row.lockTagId) || text(details.lockTagId),
    tryStartRequired: tryStartRaw !== false,
    issuedAt: text(row.issuedAt) || text(details.issuedAt),
    verifiedAt: text(row.verifiedAt) || text(details.verifiedAt),
    closedAt: text(row.closedAt) || text(details.closedAt),
  };
}

function mapEnergyRows(raw: unknown[]): FieldLotoEnergyItem[] {
  return raw.map((item, i) => {
    const row = asRecord(item);
    const payload = asRecord(row.sourcePayload);
    return {
      id: text(row.id) || `energy-${i}`,
      energyType:
        text(row.energyType) ||
        text(payload.energySourceName) ||
        text(payload.energyType) ||
        "Energy",
      magnitude: text(row.magnitude) || text(payload.energyMagnitude) || text(payload.magnitude),
      description:
        text(row.description) ||
        text(payload.printedProcedureDescription) ||
        text(payload.customDescription),
    };
  });
}

function mapIsolationRows(raw: unknown[]): FieldLotoIsolationItem[] {
  return raw.map((item, i) => {
    const row = asRecord(item);
    const payload = asRecord(row.sourcePayload);
    return {
      id: text(row.id) || `iso-${i}`,
      label: text(row.label) || text(payload.lockoutDeviceName) || `Point ${i + 1}`,
      locationDescription:
        text(row.locationDescription) ||
        text(payload.isolationLocationText) ||
        text(payload.locationDescription),
      isolationMethod:
        text(row.isolationMethod) ||
        text(payload.isolationAction) ||
        text(payload.isolationMethod),
    };
  });
}

function mapStepRows(raw: unknown[]): FieldLotoStepItem[] {
  return raw.map((item, i) => {
    const row = asRecord(item);
    const payload = asRecord(row.sourcePayload);
    const instruction =
      text(row.instruction) ||
      text(payload.printedProcedureDescription) ||
      text(payload.customDescription) ||
      `Step ${i + 1}`;
    return {
      id: text(row.id) || `step-${i}`,
      stepNumber: Number(row.stepNumber ?? i + 1) || i + 1,
      stepPhase: text(row.stepPhase) || (row.isVerification ? "VERIFICATION" : "ISOLATION"),
      instruction,
      isVerification: Boolean(row.isVerification) || upper(row.stepPhase) === "VERIFICATION",
      customDescription:
        text(row.customDescription) ||
        text(payload.customDescription) ||
        text(payload.customText),
      stepImageUrl:
        text(row.stepImageUrl) ||
        text(payload.stepImageUrl) ||
        text(payload.stepImageStorageKey),
    };
  });
}

function deriveFromPayloadSteps(raw: unknown[]): {
  energySources: FieldLotoEnergyItem[];
  isolationPoints: FieldLotoIsolationItem[];
  steps: FieldLotoStepItem[];
} {
  const energySources: FieldLotoEnergyItem[] = [];
  const isolationPoints: FieldLotoIsolationItem[] = [];
  const steps: FieldLotoStepItem[] = [];
  let stepNo = 1;
  raw.forEach((item, i) => {
    const row = asRecord(item);
    const energy =
      text(row.energySourceName) || text(row.energyType) || text(row.energySource);
    const device = text(row.lockoutDeviceName) || text(row.label) || text(row.deviceName);
    const location =
      text(row.isolationLocationText) ||
      text(row.locationDescription) ||
      text(row.location);
    const method = text(row.isolationAction) || text(row.isolationMethod);
    const verification = text(row.verificationMethodName) || text(row.verification);
    const instruction =
      text(row.printedProcedureDescription) ||
      text(row.printedDescription) ||
      text(row.instruction) ||
      text(row.customDescription) ||
      [location && `Location: ${location}`, method && `Method: ${method}`, device && `Device: ${device}`]
        .filter(Boolean)
        .join(" — ") ||
      `Isolation step ${i + 1}`;

    if (energy) {
      energySources.push({
        id: `payload-energy-${i}`,
        energyType: energy,
        magnitude: text(row.energyMagnitude) || text(row.magnitude),
        description: instruction,
      });
    }
    if (device || location || method) {
      isolationPoints.push({
        id: `payload-iso-${i}`,
        label: device || `Point ${i + 1}`,
        locationDescription: location,
        isolationMethod: method,
      });
    }
    const customDescription = text(row.customDescription) || text(row.customText);
    const stepImageUrl = text(row.stepImageUrl) || text(row.stepImageStorageKey);
    steps.push({
      id: `payload-step-${i}`,
      stepNumber: stepNo,
      stepPhase: "ISOLATION",
      instruction,
      isVerification: false,
      customDescription,
      stepImageUrl,
    });
    stepNo += 1;
    if (verification) {
      steps.push({
        id: `payload-verify-${i}`,
        stepNumber: stepNo,
        stepPhase: "VERIFICATION",
        instruction: `Verify zero energy: ${verification}`,
        isVerification: true,
        customDescription: "",
        stepImageUrl: "",
      });
      stepNo += 1;
    }
  });
  return { energySources, isolationPoints, steps };
}

export function extractProcedureDisplay(
  detail: Record<string, unknown> | null | undefined,
): FieldLotoProcedureDisplay {
  const source = detail ?? {};
  const procedure = asRecord(source.procedure ?? source);
  const energyRaw = Array.isArray(source.energySources) ? source.energySources : [];
  const isolationRaw = Array.isArray(source.isolationPoints) ? source.isolationPoints : [];
  const stepsRaw = Array.isArray(source.steps) ? source.steps : [];
  const payloadSteps = Array.isArray(procedure.steps) ? procedure.steps : [];

  let energySources = mapEnergyRows(energyRaw);
  let isolationPoints = mapIsolationRows(isolationRaw);
  let steps = mapStepRows(stepsRaw);

  if (energySources.length === 0 && isolationPoints.length === 0 && steps.length === 0) {
    const derived = deriveFromPayloadSteps(stepsRaw.length > 0 ? stepsRaw : payloadSteps);
    energySources = derived.energySources;
    isolationPoints = derived.isolationPoints;
    steps = derived.steps;
  }

  return {
    id: text(procedure.id) || text(source.id),
    title: text(procedure.title) || text(source.title) || lotoProcedureEquipmentName(procedure),
    status: text(procedure.status) || text(source.status),
    equipmentName: lotoProcedureEquipmentName(procedure) || lotoProcedureEquipmentName(source),
    equipmentTypeName:
      lotoProcedureEquipmentType(procedure) || lotoProcedureEquipmentType(source),
    equipmentExternalId:
      lotoProcedureEquipmentExternalId(procedure) || lotoProcedureEquipmentExternalId(source),
    siteName: lotoProcedureSiteName(procedure) || lotoProcedureSiteName(source),
    divisionName: lotoProcedureDivisionName(procedure) || lotoProcedureDivisionName(source),
    departmentName: lotoProcedureDepartmentName(procedure) || lotoProcedureDepartmentName(source),
    areaName: lotoProcedureAreaName(procedure) || lotoProcedureAreaName(source),
    procedureNumber: lotoProcedureNumber(procedure) || lotoProcedureNumber(source),
    revision: text(procedure.revision) || text(source.revision) || "1",
    scope: text(source.scope) || text(procedure.scope) || text(procedure.description),
    equipmentImageUrl:
      text(procedure.equipmentImageUrl) ||
      text(source.equipmentImageUrl) ||
      text(asRecord(procedure.source_payload ?? procedure.sourcePayload).equipmentImageUrl) ||
      text(asRecord(source.source_payload ?? source.sourcePayload).equipmentImageUrl),
    equipmentImageCaption:
      text(procedure.equipmentImageCaption) ||
      text(source.equipmentImageCaption) ||
      text(asRecord(procedure.source_payload ?? procedure.sourcePayload).equipmentImageCaption) ||
      text(asRecord(source.source_payload ?? source.sourcePayload).equipmentImageCaption),
    reviewReturnNotes:
      text(procedure.reviewReturnNotes) ||
      text(source.reviewReturnNotes) ||
      text(asRecord(procedure.source_payload ?? procedure.sourcePayload).reviewReturnNotes) ||
      text(asRecord(source.source_payload ?? source.sourcePayload).reviewReturnNotes),
    energySources,
    isolationPoints,
    steps,
    notes: normalizeNotes(source.notes ?? procedure.notes),
    restorationChecks: normalizeRestorationChecks(
      source.restorationChecks ?? procedure.restorationChecks,
    ),
    attachments: normalizeAttachments(source.attachments ?? procedure.attachments),
    tags: Array.isArray(source.tags)
      ? source.tags.map((tag) => text(tag)).filter(Boolean)
      : Array.isArray(procedure.tags)
        ? procedure.tags.map((tag) => text(tag)).filter(Boolean)
        : [],
  };
}

/** Checklist items for the field runner (isolation + verification steps). */
export function checklistFromDisplay(display: FieldLotoProcedureDisplay): FieldLotoStepItem[] {
  if (display.steps.length > 0) return display.steps;
  return display.isolationPoints.map((point, i) => ({
    id: point.id || `iso-check-${i}`,
    stepNumber: i + 1,
    stepPhase: "ISOLATION",
    instruction: [point.label, point.locationDescription, point.isolationMethod]
      .filter(Boolean)
      .join(" — "),
    isVerification: false,
    customDescription: "",
    stepImageUrl: "",
  }));
}

export function profileDisplayName(profile: {
  displayName?: string;
  preferredName?: string | null;
  firstName?: string;
  lastName?: string;
} | null): string {
  if (!profile) return "";
  return (
    text(profile.displayName) ||
    text(profile.preferredName) ||
    [text(profile.firstName), text(profile.lastName)].filter(Boolean).join(" ")
  );
}

export const LOTO_ENERGY_TYPES = [
  "Electrical",
  "Mechanical",
  "Hydraulic",
  "Pneumatic",
  "Chemical",
  "Thermal",
  "Gravity",
  "Stored energy",
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

export type FieldLotoStepDraft = {
  energySourceName: string;
  energyMagnitude: string;
  isolationLocationText: string;
  lockoutDeviceName: string;
  isolationAction: string;
  verificationMethodName: string;
  customDescription: string;
  descriptionCode: string;
};

export function emptyFieldLotoStep(): FieldLotoStepDraft {
  return {
    energySourceName: "Electrical",
    energyMagnitude: "",
    isolationLocationText: "",
    lockoutDeviceName: "Lock and Hasp",
    isolationAction: "Isolate and lock out",
    verificationMethodName: "Try start / zero energy",
    customDescription: "",
    descriptionCode: "",
  };
}

export function fieldLotoCreatePayload(input: {
  equipmentName: string;
  siteId?: string;
  siteName?: string;
  divisionName?: string;
  departmentId?: string;
  departmentName?: string;
  areaName?: string;
  steps: readonly FieldLotoStepDraft[];
  restorationLabel?: string;
  status?: string;
  revision?: string;
}): Record<string, unknown> {
  const equipmentName = text(input.equipmentName);
  const siteId = text(input.siteId);
  const siteName = text(input.siteName);
  const divisionName = text(input.divisionName);
  const departmentId = text(input.departmentId);
  const departmentName = text(input.departmentName);
  const areaName = text(input.areaName);
  const restorationLabel = text(input.restorationLabel);
  const steps = input.steps
    .map((step) => ({
      energySourceName: text(step.energySourceName) || "Energy",
      energyMagnitude: text(step.energyMagnitude),
      isolationLocationText: text(step.isolationLocationText),
      lockoutDeviceName: text(step.lockoutDeviceName),
      isolationAction: text(step.isolationAction),
      verificationMethodName: text(step.verificationMethodName) || "Try start / zero energy",
      customDescription: text(step.customDescription),
      descriptionCode: text(step.descriptionCode),
    }))
    .filter(
      (step) =>
        step.energySourceName ||
        step.isolationLocationText ||
        step.isolationAction ||
        step.lockoutDeviceName ||
        step.customDescription,
    );
  return {
    title: equipmentName ? `${equipmentName} LOTO` : "LOTO procedure",
    equipmentName,
    siteId: siteId || null,
    siteName: siteName || null,
    siteNameSnapshot: siteName || null,
    divisionName: divisionName || null,
    divisionNameSnapshot: divisionName || null,
    departmentId: departmentId || null,
    departmentName: departmentName || null,
    departmentNameSnapshot: departmentName || null,
    areaName: areaName || null,
    areaNameSnapshot: areaName || null,
    revision: text(input.revision) || "1",
    // Match industrial-web create: new procedures are drafts unless explicitly activated.
    status: text(input.status) || "DRAFT",
    scope: [siteName, divisionName, departmentName, areaName].filter(Boolean).join(" / "),
    restorationChecks: restorationLabel
      ? [{ sortOrder: 0, checkKey: "clearance", label: restorationLabel, completed: false }]
      : [],
    steps: steps.map((step, index) => {
      const printed = [
        step.energySourceName && `Isolate ${step.energySourceName}`,
        step.energyMagnitude && `(${step.energyMagnitude})`,
        step.isolationLocationText && `at ${step.isolationLocationText}`,
        step.isolationAction && `by ${step.isolationAction}`,
        step.lockoutDeviceName && `using ${step.lockoutDeviceName}`,
      ]
        .filter(Boolean)
        .join(" ");
      return {
        sortOrder: index,
        stepNumber: index + 1,
        ...step,
        printedProcedureDescription: printed,
        instruction: printed,
      };
    }),
  };
}

/** Prefill the Field create/edit form from a procedure detail payload. */
export function fieldLotoDraftFromDetail(detail: Record<string, unknown>): {
  equipmentName: string;
  siteId: string;
  siteName: string;
  divisionName: string;
  departmentId: string;
  departmentName: string;
  areaName: string;
  restorationLabel: string;
  revision: string;
  status: string;
  steps: FieldLotoStepDraft[];
} {
  const display = extractProcedureDisplay(detail);
  const procedure = asRecord(detail.procedure ?? detail);
  const payload = asRecord(procedure.source_payload ?? procedure.sourcePayload ?? detail.sourcePayload);
  const rawSteps = Array.isArray(detail.steps)
    ? detail.steps
    : Array.isArray(procedure.steps)
      ? procedure.steps
      : [];

  const drafts: FieldLotoStepDraft[] = [];
  for (const raw of rawSteps) {
    const row = asRecord(raw);
    if (row.isVerification) continue;
    const stepPayload = asRecord(row.sourcePayload);
    drafts.push({
      energySourceName:
        text(stepPayload.energySourceName) ||
        text(stepPayload.energyType) ||
        text(row.energyType) ||
        "Electrical",
      energyMagnitude:
        text(stepPayload.energyMagnitude) || text(stepPayload.magnitude) || text(row.magnitude),
      isolationLocationText:
        text(stepPayload.isolationLocationText) ||
        text(stepPayload.locationDescription) ||
        text(row.locationDescription),
      lockoutDeviceName:
        text(stepPayload.lockoutDeviceName) ||
        text(stepPayload.label) ||
        text(row.label) ||
        "Lock and Hasp",
      isolationAction:
        text(stepPayload.isolationAction) ||
        text(stepPayload.isolationMethod) ||
        text(row.isolationMethod) ||
        "Isolate and lock out",
      verificationMethodName:
        text(stepPayload.verificationMethodName) ||
        text(stepPayload.verification) ||
        "Try start / zero energy",
      customDescription:
        text(stepPayload.customDescription) ||
        text(stepPayload.customText) ||
        text(row.customDescription),
      descriptionCode: text(stepPayload.descriptionCode) || text(row.descriptionCode),
    });
  }

  if (drafts.length === 0) {
    for (const point of display.isolationPoints) {
      drafts.push({
        energySourceName: "Electrical",
        energyMagnitude: "",
        isolationLocationText: point.locationDescription,
        lockoutDeviceName: point.label || "Lock and Hasp",
        isolationAction: point.isolationMethod || "Isolate and lock out",
        verificationMethodName: "Try start / zero energy",
        customDescription: "",
        descriptionCode: "",
      });
    }
  }

  return {
    equipmentName: display.equipmentName === "—" ? "" : display.equipmentName,
    siteId: lotoProcedureSiteId(procedure) || lotoProcedureSiteId(detail) || text(payload.siteId),
    siteName: display.siteName === "—" ? "" : display.siteName,
    divisionName: display.divisionName === "—" ? "" : display.divisionName,
    departmentId:
      lotoProcedureDepartmentId(procedure) ||
      lotoProcedureDepartmentId(detail) ||
      text(payload.departmentId),
    departmentName: display.departmentName === "—" ? "" : display.departmentName,
    areaName: display.areaName === "—" ? "" : display.areaName,
    restorationLabel: display.restorationChecks[0]?.label || "Guards replaced / personnel clear",
    revision: display.revision || "1",
    status: display.status || "DRAFT",
    steps: drafts.length > 0 ? drafts : [emptyFieldLotoStep()],
  };
}

/**
 * Build a PATCH payload that keeps industrial-web fields (photos, printable page-2
 * sequences, notes, department, etc.) when Field only edits the slim form.
 */
export function fieldLotoUpdatePayload(
  input: {
    equipmentName: string;
    siteId?: string;
    siteName?: string;
    divisionName?: string;
    departmentId?: string;
    departmentName?: string;
    areaName?: string;
    steps: readonly FieldLotoStepDraft[];
    restorationLabel?: string;
    status?: string;
    revision?: string;
  },
  existingDetail: Record<string, unknown>,
): Record<string, unknown> {
  const base = fieldLotoCreatePayload(input);
  const procedure = asRecord(existingDetail.procedure ?? existingDetail);
  const existingRoot = { ...asRecord(procedure), ...asRecord(existingDetail) };
  const existingPayload = asRecord(
    existingRoot.source_payload ?? existingRoot.sourcePayload ?? existingRoot,
  );

  const preserveKeys = [
    "equipmentImageUrl",
    "equipmentImageCaption",
    "equipmentImageFileName",
    "equipmentImageStorageKey",
    "equipmentId",
    "equipmentExternalId",
    "equipmentTypeName",
    "equipmentTypeNameSnapshot",
    "procedureNumber",
    "notes",
    "precautions",
    "printPurpose",
    "printScopeStatement",
    "printEnforcement",
    "shutdownSequence",
    "restoreSequence",
    "leftFooter",
    "centerFooter",
    "rightFooter",
  ] as const;

  for (const key of preserveKeys) {
    if (base[key] != null && base[key] !== "") continue;
    const fromPayload = existingPayload[key];
    const fromRoot = existingRoot[key];
    if (fromPayload !== undefined && fromPayload !== null && fromPayload !== "") {
      base[key] = fromPayload;
    } else if (fromRoot !== undefined && fromRoot !== null && fromRoot !== "") {
      base[key] = fromRoot;
    }
  }

  const existingSteps = Array.isArray(existingDetail.steps)
    ? existingDetail.steps
    : Array.isArray(procedure.steps)
      ? procedure.steps
      : Array.isArray(existingPayload.steps)
        ? existingPayload.steps
        : [];
  const isolationExisting = existingSteps
    .map((raw) => asRecord(raw))
    .filter((row) => !row.isVerification);

  const nextSteps = Array.isArray(base.steps) ? (base.steps as Array<Record<string, unknown>>) : [];
  base.steps = nextSteps.map((step, index) => {
    const prior = isolationExisting[index] ?? {};
    const priorPayload = asRecord(prior.sourcePayload);
    return {
      ...step,
      stepImageUrl:
        text(priorPayload.stepImageUrl) ||
        text(prior.stepImageUrl) ||
        text(priorPayload.stepImageStorageKey) ||
        null,
      stepImageFileName:
        text(priorPayload.stepImageFileName) || text(prior.stepImageFileName) || null,
      descriptionCode:
        text(step.descriptionCode as string) ||
        text(priorPayload.descriptionCode) ||
        text(prior.descriptionCode),
      customDescription:
        text(step.customDescription as string) ||
        text(priorPayload.customDescription) ||
        text(prior.customDescription),
      printedProcedureDescription:
        text(step.printedProcedureDescription as string) ||
        text(priorPayload.printedProcedureDescription) ||
        text(prior.instruction),
    };
  });

  return base;
}
