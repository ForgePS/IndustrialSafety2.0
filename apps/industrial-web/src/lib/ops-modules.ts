/** IND-3 core operations modules with AWS workspace UIs. */
export const IND3_OPS_MODULES = [
  "personnel",
  "training",
  "forms",
  "inspections",
  "incidents",
  "jsas",
  "observations",
] as const;

export type Ind3OpsModule = (typeof IND3_OPS_MODULES)[number];

export function isInd3OpsModule(module: string): module is Ind3OpsModule {
  return (IND3_OPS_MODULES as readonly string[]).includes(module);
}

export type OpsCreateFieldType = "text" | "email" | "tel" | "date" | "textarea" | "checkbox";

export type OpsCreateField = {
  name: string;
  label: string;
  required?: boolean;
  type?: OpsCreateFieldType;
  /** Renders the field inside a labelled fieldset; ungrouped fields come first. */
  group?: string;
};

/** Create-form groups in render order, preserving first appearance. */
export function groupCreateFields(
  fields: readonly OpsCreateField[],
): Array<{ group: string | null; fields: OpsCreateField[] }> {
  const order: Array<string | null> = [];
  const byGroup = new Map<string | null, OpsCreateField[]>();
  for (const field of fields) {
    const key = field.group ?? null;
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
      order.push(key);
    }
    byGroup.get(key)!.push(field);
  }
  return order.map((group) => ({ group, fields: byGroup.get(group)! }));
}

export const OPS_MODULE_CONFIG: Record<
  Ind3OpsModule,
  {
    code: string;
    flagKey: string;
    viewPerm: string;
    managePerm: string;
    listPath: string;
    createPath: string;
    titleField: string;
    createFields: OpsCreateField[];
    /**
     * When set, the workspace links here instead of rendering the inline create
     * form. Modules whose intake needs lookups, sections or signature capture
     * get a dedicated page rather than a second, diverging copy of the fields.
     */
    createHref?: string;
  }
> = {
  personnel: {
    code: "PERSONNEL",
    flagKey: "industrial.module.personnel.enabled",
    viewPerm: "industrial.personnel.view",
    managePerm: "industrial.personnel.manage",
    listPath: "/api/v1/industrial/personnel",
    createPath: "/api/v1/industrial/personnel",
    titleField: "displayName",
    createHref: "/modules/personnel/new/",
    // Add Person template parity with the legacy personnel record (migration 0043).
    // createHref above means these are not rendered today; they remain the
    // fallback inline form and are covered by personnel-template.test.ts.
    createFields: [
      { name: "employeeNumber", label: "Employee number", group: "Identity" },
      { name: "firstName", label: "First name", required: true, group: "Identity" },
      { name: "middleName", label: "Middle name", group: "Identity" },
      { name: "lastName", label: "Last name", required: true, group: "Identity" },
      { name: "suffix", label: "Suffix", group: "Identity" },
      { name: "preferredName", label: "Preferred name", group: "Identity" },
      { name: "status", label: "Status", group: "Identity" },

      { name: "email", label: "Email", type: "email", group: "Contact" },
      { name: "phone", label: "Phone", type: "tel", group: "Contact" },
      { name: "companyEmail", label: "Company email", type: "email", group: "Contact" },
      { name: "companyPhone", label: "Company phone", type: "tel", group: "Contact" },

      { name: "allergies", label: "Allergies", type: "textarea", group: "Medical" },
      {
        name: "medicalHistory",
        label: "Pertinent medical history",
        type: "textarea",
        group: "Medical",
      },

      { name: "emergencyContact1Name", label: "Contact 1 — Name", group: "Emergency contact" },
      {
        name: "emergencyContact1Phone",
        label: "Contact 1 — Phone",
        type: "tel",
        group: "Emergency contact",
      },
      {
        name: "emergencyContact1Relationship",
        label: "Contact 1 — Relationship",
        group: "Emergency contact",
      },
      { name: "emergencyContact2Name", label: "Contact 2 — Name", group: "Emergency contact" },
      {
        name: "emergencyContact2Phone",
        label: "Contact 2 — Phone",
        type: "tel",
        group: "Emergency contact",
      },
      {
        name: "emergencyContact2Relationship",
        label: "Contact 2 — Relationship",
        group: "Emergency contact",
      },

      { name: "jobTitle", label: "Job title", group: "Assignment" },
      { name: "departmentName", label: "Department", group: "Assignment" },
      { name: "divisionName", label: "Division", group: "Assignment" },
      { name: "supervisorName", label: "Supervisor", group: "Assignment" },
      { name: "hireDate", label: "Hire date", type: "date", group: "Assignment" },

      { name: "fileBase", label: "File base", group: "Records" },
      { name: "userAuthId", label: "User auth ID", group: "Records" },
      { name: "digitalSource", label: "Digital source", group: "Records" },
      { name: "signatureUrl", label: "Signature URL", group: "Records" },

      {
        name: "isCompanyDriver",
        label: "Company or contract driver",
        type: "checkbox",
        group: "Driver",
      },

      { name: "notes", label: "Notes", type: "textarea", group: "Notes" },
    ],
  },
  training: {
    code: "TRAINING",
    flagKey: "industrial.module.training.enabled",
    viewPerm: "industrial.training.view",
    managePerm: "industrial.training.manage",
    listPath: "/api/v1/industrial/training",
    createPath: "/api/v1/industrial/training",
    titleField: "title",
    createFields: [
      { name: "title", label: "Training title", required: true },
      { name: "courseCode", label: "Course code" },
      { name: "instructorName", label: "Instructor" },
      { name: "notes", label: "Notes" },
    ],
  },
  forms: {
    code: "FORMS",
    flagKey: "industrial.module.forms.enabled",
    viewPerm: "industrial.forms.view",
    managePerm: "industrial.forms.manage",
    listPath: "/api/v1/industrial/forms",
    createPath: "/api/v1/industrial/forms",
    titleField: "name",
    createFields: [
      { name: "name", label: "Form name", required: true },
      { name: "category", label: "Category" },
    ],
  },
  inspections: {
    code: "INSPECTIONS",
    flagKey: "industrial.module.inspections.enabled",
    viewPerm: "industrial.inspections.view",
    managePerm: "industrial.inspections.manage",
    listPath: "/api/v1/industrial/inspections",
    createPath: "/api/v1/industrial/inspections",
    titleField: "title",
    createFields: [
      { name: "title", label: "Inspection title", required: true },
      { name: "inspectionDate", label: "Inspection date" },
    ],
  },
  incidents: {
    code: "INCIDENTS",
    flagKey: "industrial.module.incidents.enabled",
    viewPerm: "industrial.incidents.view",
    managePerm: "industrial.incidents.manage",
    listPath: "/api/v1/industrial/incidents",
    createPath: "/api/v1/industrial/incidents",
    titleField: "title",
    createFields: [
      { name: "title", label: "Incident title", required: true },
      { name: "category", label: "Category" },
      { name: "severity", label: "Severity" },
      { name: "location", label: "Location" },
      { name: "description", label: "Description" },
    ],
  },
  jsas: {
    code: "JSAS",
    flagKey: "industrial.module.jsa.enabled",
    viewPerm: "industrial.jsa.view",
    managePerm: "industrial.jsa.manage",
    listPath: "/api/v1/industrial/jsas",
    createPath: "/api/v1/industrial/jsas",
    titleField: "title",
    createFields: [
      { name: "title", label: "JSA title", required: true },
      { name: "task", label: "Task" },
      { name: "location", label: "Location" },
    ],
  },
  observations: {
    code: "OBSERVATIONS",
    flagKey: "industrial.module.observations.enabled",
    viewPerm: "industrial.observations.view",
    managePerm: "industrial.observations.manage",
    listPath: "/api/v1/industrial/observations",
    createPath: "/api/v1/industrial/observations",
    titleField: "description",
    createFields: [
      { name: "description", label: "Description", required: true },
      { name: "observationType", label: "Type" },
      { name: "category", label: "Category" },
      { name: "location", label: "Location" },
      { name: "riskLevel", label: "Risk level" },
    ],
  },
};
