export type InspectionFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export type QrActionConfig = {
  reportIssue?: boolean;
  dailyInspection?: boolean;
  weeklyInspection?: boolean;
  monthlyInspection?: boolean;
  equipmentHistory?: boolean;
  markOutOfService?: boolean;
  returnToService?: boolean;
  viewLoto?: boolean;
  viewJsa?: boolean;
  viewDocuments?: boolean;
  viewTraining?: boolean;
  viewSds?: boolean;
  inspectionTemplates?: Partial<Record<InspectionFrequency, string>>;
  /** Linked safety / training record ids (optional overrides of QR target). */
  lotoProcedureId?: string;
  jsaId?: string;
  documentId?: string;
  trainingAssignmentId?: string;
  chemicalSafetyId?: string;
};

const BOOL_KEYS: Array<{ key: keyof QrActionConfig; aliases: string[] }> = [
  { key: "reportIssue", aliases: ["reportIssue", "report_issue", "allowIssueReporting"] },
  { key: "dailyInspection", aliases: ["dailyInspection", "daily_inspection"] },
  { key: "weeklyInspection", aliases: ["weeklyInspection", "weekly_inspection"] },
  { key: "monthlyInspection", aliases: ["monthlyInspection", "monthly_inspection"] },
  { key: "equipmentHistory", aliases: ["equipmentHistory", "equipment_history", "allowHistoryAccess"] },
  { key: "markOutOfService", aliases: ["markOutOfService", "mark_out_of_service"] },
  { key: "returnToService", aliases: ["returnToService", "return_to_service"] },
  { key: "viewLoto", aliases: ["viewLoto", "view_loto", "loto", "allowLoto"] },
  { key: "viewJsa", aliases: ["viewJsa", "view_jsa", "jsa", "allowJsa"] },
  { key: "viewDocuments", aliases: ["viewDocuments", "view_documents", "documents", "allowDocuments"] },
  { key: "viewTraining", aliases: ["viewTraining", "view_training", "training", "allowTraining"] },
  { key: "viewSds", aliases: ["viewSds", "view_sds", "sds", "allowSds", "chemicalSafety"] },
];

const ID_KEYS: Array<{ key: keyof QrActionConfig; aliases: string[] }> = [
  { key: "lotoProcedureId", aliases: ["lotoProcedureId", "loto_procedure_id", "lotoId"] },
  { key: "jsaId", aliases: ["jsaId", "jsa_id"] },
  { key: "documentId", aliases: ["documentId", "document_id"] },
  {
    key: "trainingAssignmentId",
    aliases: ["trainingAssignmentId", "training_assignment_id", "requiredTrainingId"],
  },
  {
    key: "chemicalSafetyId",
    aliases: ["chemicalSafetyId", "chemical_safety_id", "sdsId"],
  },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readBool(record: Record<string, unknown>, aliases: string[]): boolean | undefined {
  for (const alias of aliases) {
    const value = record[alias];
    if (value === true || value === "true" || value === 1 || value === "1") return true;
    if (value === false || value === "false" || value === 0 || value === "0") return false;
  }
  return undefined;
}

function readId(record: Record<string, unknown>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const value = String(record[alias] ?? "").trim();
    if (value) return value;
  }
  return undefined;
}

export function parseQrActionConfig(raw: unknown): QrActionConfig {
  const record = asRecord(raw) ?? {};
  const config: QrActionConfig = {};
  for (const entry of BOOL_KEYS) {
    const value = readBool(record, entry.aliases);
    if (value !== undefined) (config as Record<string, unknown>)[entry.key] = value;
  }
  for (const entry of ID_KEYS) {
    const value = readId(record, entry.aliases);
    if (value) (config as Record<string, unknown>)[entry.key] = value;
  }

  const templatesRaw =
    asRecord(record.inspectionTemplates) ??
    asRecord(record.inspection_templates) ??
    asRecord(record.templates);
  if (templatesRaw) {
    const templates: Partial<Record<InspectionFrequency, string>> = {};
    for (const freq of ["DAILY", "WEEKLY", "MONTHLY"] as InspectionFrequency[]) {
      const id = String(templatesRaw[freq] ?? templatesRaw[freq.toLowerCase()] ?? "").trim();
      if (id) templates[freq] = id;
    }
    if (Object.keys(templates).length > 0) config.inspectionTemplates = templates;
  }

  return config;
}

export function qrActionConfigEnabled(
  config: QrActionConfig,
  key: keyof QrActionConfig,
  defaultValue = true,
): boolean {
  const value = config[key];
  if (typeof value === "boolean") return value;
  return defaultValue;
}

export function inspectionFrequencyLabel(freq: InspectionFrequency): string {
  switch (freq) {
    case "DAILY":
      return "Daily inspection";
    case "WEEKLY":
      return "Weekly inspection";
    case "MONTHLY":
      return "Monthly inspection";
    default:
      return "Inspection";
  }
}

/** Default toggles shown in admin UI when creating a QR link. */
export function defaultQrActionConfigFlags(): Record<
  | "reportIssue"
  | "dailyInspection"
  | "weeklyInspection"
  | "monthlyInspection"
  | "equipmentHistory"
  | "markOutOfService"
  | "returnToService"
  | "viewLoto"
  | "viewJsa"
  | "viewDocuments"
  | "viewTraining"
  | "viewSds",
  boolean
> {
  return {
    reportIssue: true,
    dailyInspection: true,
    weeklyInspection: true,
    monthlyInspection: true,
    equipmentHistory: true,
    markOutOfService: true,
    returnToService: true,
    viewLoto: true,
    viewJsa: true,
    viewDocuments: true,
    viewTraining: true,
    viewSds: true,
  };
}
