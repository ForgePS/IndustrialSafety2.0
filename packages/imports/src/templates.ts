/**
 * Product-neutral import template metadata for S2.
 * Does not generate CSV/XLSX files.
 */

export type ImportTemplateField = {
  fieldKey: string;
  displayName: string;
  dataType: "string" | "number" | "boolean" | "date" | "uuid";
  required: boolean;
  sensitive: boolean;
};

export type ImportTemplateMeta = {
  templateKey: string;
  displayName: string;
  description: string;
  productKey: string;
  moduleKey: string;
  recordCategory: string;
  supportedSourceTypes: Array<"csv" | "xlsx" | "json" | "zip" | "api" | "manual">;
  fields: ImportTemplateField[];
  schemaVersion: number;
};

export const IMPORT_TEMPLATES: readonly ImportTemplateMeta[] = [
  {
    templateKey: "generic.records.v1",
    displayName: "Generic records import",
    description: "Product-neutral control-plane template for shared import jobs.",
    productKey: "FORGE_RMS",
    moduleKey: "CORE",
    recordCategory: "generic_record",
    supportedSourceTypes: ["csv", "xlsx", "json", "manual"],
    schemaVersion: 1,
    fields: [
      {
        fieldKey: "external_id",
        displayName: "External ID",
        dataType: "string",
        required: true,
        sensitive: false,
      },
      {
        fieldKey: "display_name",
        displayName: "Display name",
        dataType: "string",
        required: true,
        sensitive: false,
      },
      {
        fieldKey: "notes",
        displayName: "Notes",
        dataType: "string",
        required: false,
        sensitive: false,
      },
    ],
  },
  {
    templateKey: "generic.personnel.stub.v1",
    displayName: "Generic personnel stub",
    description: "Neutral personnel-shaped fields without product-specific adapters.",
    productKey: "FORGE_RMS",
    moduleKey: "PERSONNEL",
    recordCategory: "personnel_stub",
    supportedSourceTypes: ["csv", "xlsx", "manual"],
    schemaVersion: 1,
    fields: [
      {
        fieldKey: "employee_number",
        displayName: "Employee number",
        dataType: "string",
        required: true,
        sensitive: false,
      },
      {
        fieldKey: "full_name",
        displayName: "Full name",
        dataType: "string",
        required: true,
        sensitive: false,
      },
      {
        fieldKey: "work_email",
        displayName: "Work email",
        dataType: "string",
        required: false,
        sensitive: true,
      },
    ],
  },
  {
    templateKey: "industrial.personnel.v1",
    displayName: "Industrial personnel",
    description: "Import employees into Forge Industrial Personnel.",
    productKey: "FORGE_INDUSTRIAL",
    moduleKey: "PERSONNEL",
    recordCategory: "personnel",
    supportedSourceTypes: ["csv", "xlsx", "manual"],
    schemaVersion: 1,
    fields: [
      { fieldKey: "display_name", displayName: "Employee Name", dataType: "string", required: true, sensitive: false },
      { fieldKey: "employee_number", displayName: "Employee ID", dataType: "string", required: false, sensitive: false },
      { fieldKey: "email", displayName: "Email", dataType: "string", required: false, sensitive: true },
      { fieldKey: "phone", displayName: "Mobile Phone", dataType: "string", required: false, sensitive: true },
      { fieldKey: "department", displayName: "Department", dataType: "string", required: false, sensitive: false },
      { fieldKey: "position", displayName: "Position", dataType: "string", required: false, sensitive: false },
      { fieldKey: "employment_type", displayName: "Employment Type", dataType: "string", required: false, sensitive: false },
      { fieldKey: "hire_date", displayName: "Hire Date", dataType: "date", required: false, sensitive: false },
      { fieldKey: "supervisor", displayName: "Supervisor", dataType: "string", required: false, sensitive: false },
      { fieldKey: "location", displayName: "Location", dataType: "string", required: false, sensitive: false },
    ],
  },
  {
    templateKey: "industrial.fleet.v1",
    displayName: "Industrial fleet vehicles",
    description: "Import vehicles into Forge Industrial Fleet.",
    productKey: "FORGE_INDUSTRIAL",
    moduleKey: "FLEET",
    recordCategory: "fleet_vehicle",
    supportedSourceTypes: ["csv", "xlsx", "manual"],
    schemaVersion: 1,
    fields: [
      { fieldKey: "year", displayName: "Year", dataType: "number", required: false, sensitive: false },
      { fieldKey: "make", displayName: "Make", dataType: "string", required: false, sensitive: false },
      { fieldKey: "model", displayName: "Model", dataType: "string", required: false, sensitive: false },
      { fieldKey: "color", displayName: "Color", dataType: "string", required: false, sensitive: false },
      { fieldKey: "vin", displayName: "VIN Number", dataType: "string", required: false, sensitive: false },
      { fieldKey: "license_plate", displayName: "License", dataType: "string", required: false, sensitive: false },
      { fieldKey: "renewal_date", displayName: "Renewal Date", dataType: "date", required: false, sensitive: false },
      { fieldKey: "location", displayName: "Location", dataType: "string", required: false, sensitive: false },
      { fieldKey: "assigned_driver", displayName: "Assigned Driver", dataType: "string", required: false, sensitive: false },
      { fieldKey: "county_assessed", displayName: "County Assessed", dataType: "string", required: false, sensitive: false },
      { fieldKey: "insured", displayName: "Insured", dataType: "boolean", required: false, sensitive: false },
      { fieldKey: "mileage", displayName: "Mileage", dataType: "number", required: false, sensitive: false },
      { fieldKey: "notes", displayName: "Notes", dataType: "string", required: false, sensitive: false },
      { fieldKey: "vehicle_fringe", displayName: "Not on Vehicle Fringe SS", dataType: "boolean", required: false, sensitive: false },
      { fieldKey: "asset_type", displayName: "Asset Type", dataType: "string", required: false, sensitive: false },
      { fieldKey: "form_2290", displayName: "Form 2290", dataType: "string", required: false, sensitive: false },
      { fieldKey: "irp", displayName: "IRP", dataType: "string", required: false, sensitive: false },
      { fieldKey: "commute_use", displayName: "Commute Use", dataType: "string", required: false, sensitive: false },
      { fieldKey: "registration_renewal_month", displayName: "Registration Renewal Month", dataType: "string", required: false, sensitive: false },
    ],
  },
] as const;

export function listImportTemplates(filters?: {
  productKey?: string;
  moduleKey?: string;
  recordCategory?: string;
}): ImportTemplateMeta[] {
  return IMPORT_TEMPLATES.filter((t) => {
    if (filters?.productKey && t.productKey !== filters.productKey) return false;
    if (filters?.moduleKey && t.moduleKey !== filters.moduleKey) return false;
    if (filters?.recordCategory && t.recordCategory !== filters.recordCategory) return false;
    return true;
  }).map((t) => ({ ...t, fields: t.fields.map((f) => ({ ...f })) }));
}

export function getImportTemplate(templateKey: string): ImportTemplateMeta | undefined {
  const found = IMPORT_TEMPLATES.find((t) => t.templateKey === templateKey);
  return found ? { ...found, fields: found.fields.map((f) => ({ ...f })) } : undefined;
}
