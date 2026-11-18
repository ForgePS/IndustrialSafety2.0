import { EMERGENCY_SMS_SIGNUP_QR_TARGET } from "@forge/contracts";
import {
  inspectionFrequencyLabel,
  parseQrActionConfig,
  qrActionConfigEnabled,
  type InspectionFrequency,
  type QrActionConfig,
} from "./qr-action-config.js";

export type ScanActionKind =
  | "navigate"
  | "report_issue"
  | "view_history"
  | "mark_out_of_service"
  | "return_to_service"
  | "start_inspection";

export type ScanActionDef = {
  id: string;
  label: string;
  description?: string;
  href: string;
  requiresVerification: boolean;
  permission?: string;
  /** Allowed after employee-number verification without Forge login. */
  fieldWorkerAllowed?: boolean;
  kind?: ScanActionKind;
  frequency?: InspectionFrequency;
  templateId?: string;
};

const ASSET_TARGET_TYPES = new Set([
  "EQUIPMENT",
  "MACHINE",
  "VEHICLE",
  "TOOL",
  "LOCATION",
  "INSPECTION_POINT",
]);

function isAssetTarget(targetType: string): boolean {
  return ASSET_TARGET_TYPES.has(targetType);
}

function buildInspectionHref(input: {
  targetType: string;
  targetId: string;
  qrLinkId?: string;
  frequency?: InspectionFrequency;
  templateId?: string;
}): string {
  const inspQs = new URLSearchParams({ tab: "start" });
  inspQs.set("targetType", input.targetType);
  inspQs.set("targetId", input.targetId);
  if (input.qrLinkId) inspQs.set("qrLinkId", input.qrLinkId);
  if (input.frequency) inspQs.set("frequency", input.frequency);
  if (input.templateId) inspQs.set("templateId", input.templateId);
  return `/modules/inspections?${inspQs.toString()}`;
}

function addFrequencyInspections(
  actions: ScanActionDef[],
  input: {
    targetType: string;
    targetId: string;
    qrLinkId?: string;
    actionConfig: QrActionConfig;
  },
) {
  const frequencies: InspectionFrequency[] = ["DAILY", "WEEKLY", "MONTHLY"];
  const configKey: Record<InspectionFrequency, keyof QrActionConfig> = {
    DAILY: "dailyInspection",
    WEEKLY: "weeklyInspection",
    MONTHLY: "monthlyInspection",
  };

  let added = false;
  for (const frequency of frequencies) {
    if (!qrActionConfigEnabled(input.actionConfig, configKey[frequency], true)) continue;
    const templateId = input.actionConfig.inspectionTemplates?.[frequency];
    actions.push({
      id: `${frequency.toLowerCase()}_inspection`,
      label: inspectionFrequencyLabel(frequency),
      description: "Run a checklist for this asset",
      href: buildInspectionHref({
        targetType: input.targetType,
        targetId: input.targetId,
        ...(input.qrLinkId ? { qrLinkId: input.qrLinkId } : {}),
        frequency,
        ...(templateId ? { templateId } : {}),
      }),
      requiresVerification: true,
      permission: "industrial.qr.inspection.perform",
      fieldWorkerAllowed: true,
      kind: "start_inspection",
      frequency,
      ...(templateId ? { templateId } : {}),
    });
    added = true;
  }

  if (!added) {
    actions.push({
      id: "start_inspection",
      label: "Start inspection",
      description: "Run a checklist for this asset",
      href: buildInspectionHref({
        targetType: input.targetType,
        targetId: input.targetId,
        ...(input.qrLinkId ? { qrLinkId: input.qrLinkId } : {}),
      }),
      requiresVerification: true,
      permission: "industrial.qr.inspection.perform",
      fieldWorkerAllowed: true,
      kind: "start_inspection",
    });
  }
}

function addLinkedSafetyActions(
  actions: ScanActionDef[],
  input: {
    targetType: string;
    targetId: string;
    actionConfig: QrActionConfig;
  },
) {
  const lotoId =
    input.actionConfig.lotoProcedureId ||
    (input.targetType === "LOTO_PROCEDURE" ? input.targetId : "");
  if (lotoId && qrActionConfigEnabled(input.actionConfig, "viewLoto", true)) {
    actions.push({
      id: "open_loto",
      label: "View LOTO procedure",
      description: "Lockout / tagout steps for this asset",
      href: `/modules/loto/procedure?procedureId=${encodeURIComponent(lotoId)}`,
      // Public LOTO stickers must open without employee/sign-in gates.
      requiresVerification: false,
      permission: "industrial.loto.view",
      fieldWorkerAllowed: true,
      kind: "navigate",
    });
  }

  const jsaId = input.actionConfig.jsaId || (input.targetType === "JSA" ? input.targetId : "");
  if (jsaId && qrActionConfigEnabled(input.actionConfig, "viewJsa", true)) {
    actions.push({
      id: "open_jsa",
      label: "View JSA / JHA",
      description: "Job safety analysis for this work",
      href: `/modules/jsas?recordId=${encodeURIComponent(jsaId)}`,
      requiresVerification: true,
      permission: "industrial.jsa.view",
      fieldWorkerAllowed: true,
      kind: "navigate",
    });
  }

  const documentId =
    input.actionConfig.documentId || (input.targetType === "DOCUMENT" ? input.targetId : "");
  if (documentId && qrActionConfigEnabled(input.actionConfig, "viewDocuments", true)) {
    actions.push({
      id: "open_document",
      label: "Documents",
      description: "Operating manuals and procedures",
      href: `/modules/documents?recordId=${encodeURIComponent(documentId)}`,
      requiresVerification: true,
      permission: "documents.view",
      fieldWorkerAllowed: true,
      kind: "navigate",
    });
  } else if (
    isAssetTarget(input.targetType) &&
    qrActionConfigEnabled(input.actionConfig, "viewDocuments", false)
  ) {
    actions.push({
      id: "open_documents",
      label: "Documents",
      description: "Authorized documents for this asset",
      href: "/modules/documents",
      requiresVerification: true,
      permission: "documents.view",
      fieldWorkerAllowed: true,
      kind: "navigate",
    });
  }

  const chemicalId = input.actionConfig.chemicalSafetyId;
  if (chemicalId && qrActionConfigEnabled(input.actionConfig, "viewSds", true)) {
    actions.push({
      id: "open_sds",
      label: "SDS / chemical safety",
      description: "Safety data and required PPE",
      href: `/modules/chemical-safety?recordId=${encodeURIComponent(chemicalId)}`,
      requiresVerification: true,
      permission: "industrial.chemical_safety.view",
      fieldWorkerAllowed: true,
      kind: "navigate",
    });
  }

  const trainingId =
    input.actionConfig.trainingAssignmentId ||
    (input.targetType === "TRAINING" ? input.targetId : "");
  if (trainingId && qrActionConfigEnabled(input.actionConfig, "viewTraining", true)) {
    actions.push({
      id: "open_training",
      label: "Required training",
      description: "Start assigned training for this asset",
      href: `/training/portal?assignmentId=${encodeURIComponent(trainingId)}`,
      requiresVerification: true,
      permission: "industrial.training.view",
      fieldWorkerAllowed: true,
      kind: "navigate",
    });
  } else if (
    (isAssetTarget(input.targetType) || input.targetType === "TRAINING") &&
    qrActionConfigEnabled(input.actionConfig, "viewTraining", input.targetType === "TRAINING")
  ) {
    actions.push({
      id: "open_training_portal",
      label: "Required training",
      description: "Open the employee training portal",
      href: "/training/portal",
      requiresVerification: true,
      permission: "industrial.training.view",
      fieldWorkerAllowed: true,
      kind: "navigate",
    });
  }
}

export function buildScanActions(input: {
  targetType: string | null | undefined;
  targetId: string | null | undefined;
  accessMode: string;
  actionConfig?: unknown;
  qrLinkId?: string;
  assetOutOfService?: boolean;
  /** When true on VEHICLE targets, expose DVIR pre/post trip instead of generic daily inspections. */
  dotRegulated?: boolean;
  publicToken?: string | null;
  /** Plaintext vehicle DVIR token for public `/dvir/{token}` stickers / scan actions. */
  dvirPublicToken?: string | null;
}): ScanActionDef[] {
  const targetType = String(input.targetType ?? "")
    .trim()
    .toUpperCase();
  const targetId = String(input.targetId ?? "").trim();
  const accessMode = String(input.accessMode ?? "AUTHENTICATED_ONLY")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
  const actionConfig = parseQrActionConfig(input.actionConfig);
  const qrLinkId = String(input.qrLinkId ?? "").trim() || undefined;
  const publicToken = String(input.publicToken ?? "").trim();
  const assetOutOfService = Boolean(input.assetOutOfService);
  const dotRegulated = Boolean(input.dotRegulated);

  // The SMS signup page renders its own form; it has no asset actions.
  if (targetType === EMERGENCY_SMS_SIGNUP_QR_TARGET) return [];

  const actions: ScanActionDef[] = [];

  const publicAccess =
    accessMode === "PUBLIC_FORM_ONLY" ||
    accessMode === "PUBLIC_ACTION" ||
    accessMode === "PUBLIC_READ" ||
    accessMode === "PUBLIC_LIMITED";

  if (qrActionConfigEnabled(actionConfig, "reportIssue", true)) {
    actions.push({
      id: "report_issue",
      label: "Report an issue",
      description: "Log a hazard or equipment problem",
      href: "#report-issue",
      // Public LOTO / public-action stickers allow anonymous problem reports.
      requiresVerification: !publicAccess,
      permission: "industrial.qr.issue.create",
      fieldWorkerAllowed: true,
      kind: "report_issue",
    });
  }

  // DOT-regulated fleet units: primary workflow is DVIR pre/post trip, not generic checklists.
  if (targetType === "VEHICLE" && targetId && dotRegulated && !assetOutOfService) {
    const dvirToken = String(input.dvirPublicToken ?? "").trim();
    const preHref = dvirToken
      ? `/dvir/${encodeURIComponent(dvirToken)}?tripType=PRE_TRIP`
      : `/modules/dot?vehicleId=${encodeURIComponent(targetId)}&tripType=PRE_TRIP`;
    const postHref = dvirToken
      ? `/dvir/${encodeURIComponent(dvirToken)}?tripType=POST_TRIP`
      : `/modules/dot?vehicleId=${encodeURIComponent(targetId)}&tripType=POST_TRIP`;
    actions.push({
      id: "dvir_pre_trip",
      label: "Pre-trip inspection",
      description: "Driver vehicle inspection report (DVIR)",
      href: preHref,
      // Public fleet check stickers open the DVIR form without employee gate.
      requiresVerification: !publicAccess,
      permission: "industrial.qr.inspection.perform",
      fieldWorkerAllowed: true,
      kind: "navigate",
    });
    actions.push({
      id: "dvir_post_trip",
      label: "Post-trip inspection",
      description: "Driver vehicle inspection report (DVIR)",
      href: postHref,
      requiresVerification: !publicAccess,
      permission: "industrial.qr.inspection.perform",
      fieldWorkerAllowed: true,
      kind: "navigate",
    });
  }

  if (isAssetTarget(targetType) && targetId) {
    const skipGenericInspections = targetType === "VEHICLE" && dotRegulated;
    if (!skipGenericInspections) {
      addFrequencyInspections(actions, {
        targetType,
        targetId,
        ...(qrLinkId ? { qrLinkId } : {}),
        actionConfig,
      });
    }
  }

  if (
    isAssetTarget(targetType) &&
    targetId &&
    qrActionConfigEnabled(actionConfig, "equipmentHistory", true)
  ) {
    actions.push({
      id: "equipment_history",
      label: "View equipment history",
      description: "Inspections, issues, and status changes",
      href: "#history",
      requiresVerification: true,
      permission: "industrial.qr.history.view",
      fieldWorkerAllowed: true,
      kind: "view_history",
    });
  }

  if (
    isAssetTarget(targetType) &&
    targetId &&
    !assetOutOfService &&
    qrActionConfigEnabled(actionConfig, "markOutOfService", true)
  ) {
    actions.push({
      id: "mark_out_of_service",
      label: "Mark out of service",
      description: "Prevent use until verified safe",
      href: "#out-of-service",
      requiresVerification: true,
      permission: "industrial.qr.asset.out_of_service",
      fieldWorkerAllowed: true,
      kind: "mark_out_of_service",
    });
  }

  if (
    isAssetTarget(targetType) &&
    targetId &&
    assetOutOfService &&
    qrActionConfigEnabled(actionConfig, "returnToService", true)
  ) {
    actions.push({
      id: "return_to_service",
      label: "Return to service",
      description: "Verify corrective work and clear OOS status",
      href: "#return-to-service",
      requiresVerification: true,
      permission: "industrial.qr.asset.return_to_service",
      fieldWorkerAllowed: true,
      kind: "return_to_service",
    });
  }

  addLinkedSafetyActions(actions, { targetType, targetId, actionConfig });

  if (targetType === "FORM") {
    actions.push({
      id: "open_forms",
      label: "Open forms",
      href: "/modules/forms",
      requiresVerification: true,
      permission: "industrial.forms.view",
      kind: "navigate",
    });
  }

  if (targetType === "VEHICLE" && targetId) {
    actions.push({
      id: "fleet_asset",
      label: "Fleet asset",
      href: `/modules/fleet/asset?vehicleId=${encodeURIComponent(targetId)}`,
      requiresVerification: true,
      permission: "industrial.fleet.view",
      kind: "navigate",
    });
  }

  if (targetType === "SUPPLY_REQUEST_STATION" && publicToken) {
    actions.push({
      id: "supply_request_portal",
      label: "Request safety supplies",
      href: `/safety-supplies/request/q/${encodeURIComponent(publicToken)}`,
      requiresVerification: false,
      fieldWorkerAllowed: true,
      kind: "navigate",
    });
  }

  if (
    (targetType === "SAFETY_SUPPLY" ||
      targetType === "SUPPLY_ITEM" ||
      targetType === "SUPPLY_LOCATION" ||
      targetType === "SUPPLY_KIT" ||
      targetType === "SUPPLY_SERIAL") &&
    targetId
  ) {
    const tab =
      targetType === "SUPPLY_LOCATION"
        ? "locations"
        : targetType === "SUPPLY_KIT"
          ? "kits"
          : targetType === "SUPPLY_SERIAL"
            ? "ppe"
            : "inventory";
    actions.push({
      id: "safety_supplies",
      label: "Safety Supplies",
      href: `/modules/safety-supplies?tab=${tab}&targetId=${encodeURIComponent(targetId)}`,
      requiresVerification: true,
      permission: "industrial.supplies.view",
      fieldWorkerAllowed: true,
      kind: "navigate",
    });
    actions.push({
      id: "supply_issue",
      label: "Issue supply",
      href: `/modules/safety-supplies?tab=issue&targetId=${encodeURIComponent(targetId)}`,
      requiresVerification: true,
      permission: "industrial.supplies.issue",
      fieldWorkerAllowed: true,
      kind: "navigate",
    });
    actions.push({
      id: "supply_receive",
      label: "Receive supply",
      href: `/modules/safety-supplies?tab=receive&targetId=${encodeURIComponent(targetId)}`,
      requiresVerification: true,
      permission: "industrial.supplies.receive",
      fieldWorkerAllowed: true,
      kind: "navigate",
    });
  }

  if (targetType === "EQUIPMENT" || targetType === "MACHINE") {
    actions.push({
      id: "equipment_registry",
      label: "Equipment record",
      href: "/modules/equipment",
      requiresVerification: true,
      permission: "industrial.equipment.view",
      kind: "navigate",
    });
  }

  if (accessMode === "PUBLIC_FORM_ONLY" || accessMode === "PUBLIC_ACTION") {
    return actions.filter(
      (action) =>
        action.kind === "report_issue" ||
        action.id === "open_loto" ||
        action.id === "dvir_pre_trip" ||
        action.id === "dvir_post_trip",
    );
  }

  if (accessMode === "PUBLIC_READ" || accessMode === "PUBLIC_LIMITED") {
    return actions.filter(
      (action) =>
        action.id === "open_sds" ||
        action.id === "open_document" ||
        action.id === "open_documents" ||
        action.id === "open_loto" ||
        action.kind === "report_issue",
    );
  }

  return actions;
}

export function filterScanActionsForViewer(
  actions: ScanActionDef[],
  viewer: {
    verifiedEmployee: boolean;
    permissions: ReadonlySet<string>;
  },
): ScanActionDef[] {
  return actions.filter((action) => {
    if (!action.requiresVerification) return true;
    if (viewer.verifiedEmployee && action.fieldWorkerAllowed) return true;
    if (action.permission) {
      return (
        viewer.permissions.has(action.permission) ||
        viewer.permissions.has("industrial.admin") ||
        viewer.permissions.has("industrial.access")
      );
    }
    return viewer.verifiedEmployee;
  });
}
