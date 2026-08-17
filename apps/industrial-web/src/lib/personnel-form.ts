/**
 * Field model for the standalone Add Person page.
 *
 * Kept separate from OPS_MODULE_CONFIG.personnel (the compact inline create
 * form) because this page needs section grouping, lookup-backed selects and a
 * signature pad that the generic ops workspace has no concept of. Column names
 * still match migration 0043 so both paths POST the same payload shape.
 */

export type PersonnelFieldType =
  | "text"
  | "email"
  | "tel"
  | "date"
  | "textarea"
  | "checkbox"
  | "lookup"
  | "suggest"
  | "select"
  | "signature";

/** Catalogs the page can populate a <select> from. */
export type PersonnelLookupSource = "sites" | "departments" | "positions";

export type PersonnelSelectOption = { value: string; label: string };

/**
 * Matches createPersonnel's default ("Active") and the inactive/terminated
 * archive triggers in updatePersonnel. Keep labels human-readable; values are
 * what land in industrial_personnel.status.
 */
export const PERSONNEL_STATUS_OPTIONS: readonly PersonnelSelectOption[] = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
  { value: "Terminated", label: "Terminated" },
  { value: "Leave", label: "Leave" },
];

export const DEFAULT_PERSONNEL_STATUS = "Active";

export type PersonnelField = {
  /** Payload key. For a lookup this is the FK column. */
  name: string;
  label: string;
  type?: PersonnelFieldType;
  required?: boolean;
  placeholder?: string;
  /** Rendered as hint text under the control. */
  help?: string;
  /** Fixed options for type "select". Dynamic options (division) are merged at render. */
  options?: readonly PersonnelSelectOption[];
  /** Input is shown but not editable (e.g. auto-filled supervisor). */
  readOnly?: boolean;
  /** Which catalog to load, for type "lookup". */
  source?: PersonnelLookupSource;
  /**
   * Payload key that also receives the selected row's name, for lookups whose
   * chosen label is stored on personnel as free text alongside the FK.
   */
  nameField?: string;
  /**
   * Label used when a lookup has no rows and falls back to a text input bound
   * to nameField. Some tenants have an empty positions catalog, and without a
   * fallback the underlying column would be unreachable.
   */
  fallbackLabel?: string;
  /** Spans both columns of the grid. */
  wide?: boolean;
};

export type PersonnelSection = {
  id: string;
  title: string;
  description?: string;
  /** Boxicons name (Sneat ships boxicons) shown in the section card header. */
  icon?: string;
  /** Flat field list for a standard two-up grid. */
  fields?: PersonnelField[];
  /**
   * Side-by-side columns (e.g. Emergency Contact 1 | Contact 2). When set,
   * these replace `fields` for rendering; payload flattening still walks them.
   */
  columns?: Array<{ id: string; title: string; fields: PersonnelField[] }>;
};

/**
 * Division is a select populated from the tenant division catalog
 * (tenant_settings industrial/personnel.divisions) plus any division_name
 * values already on the roster.
 */
export const PERSONNEL_FORM_SECTIONS: readonly PersonnelSection[] = [
  {
    id: "identity",
    title: "Identity",
    description: "Legal name as it should appear on training and compliance records.",
    icon: "bx-user",
    fields: [
      { name: "employeeNumber", label: "Employee number" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: PERSONNEL_STATUS_OPTIONS,
        required: true,
      },
      { name: "firstName", label: "First name", required: true },
      { name: "middleName", label: "Middle name" },
      { name: "lastName", label: "Last name", required: true },
      { name: "suffix", label: "Suffix", placeholder: "Jr, Sr, III" },
      { name: "preferredName", label: "Preferred name", help: "Shown in day-to-day screens." },
    ],
  },
  {
    id: "contact",
    title: "Contact",
    icon: "bx-phone",
    fields: [
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "companyEmail", label: "Company email", type: "email" },
      { name: "companyPhone", label: "Company phone", type: "tel" },
    ],
  },
  {
    id: "medical",
    title: "Medical",
    description: "Optional. Used for on-site response; treat as sensitive.",
    icon: "bx-plus-medical",
    fields: [
      { name: "allergies", label: "Allergies", type: "textarea", wide: true },
      {
        name: "medicalHistory",
        label: "Pertinent medical history",
        type: "textarea",
        wide: true,
      },
    ],
  },
  {
    id: "emergency",
    title: "Emergency contact",
    description: "Primary and secondary people to reach in an emergency.",
    icon: "bx-bell",
    columns: [
      {
        id: "contact1",
        title: "Contact 1",
        fields: [
          { name: "emergencyContact1Name", label: "Name" },
          { name: "emergencyContact1Phone", label: "Phone", type: "tel" },
          { name: "emergencyContact1Relationship", label: "Relationship" },
        ],
      },
      {
        id: "contact2",
        title: "Contact 2",
        fields: [
          { name: "emergencyContact2Name", label: "Name" },
          { name: "emergencyContact2Phone", label: "Phone", type: "tel" },
          { name: "emergencyContact2Relationship", label: "Relationship" },
        ],
      },
    ],
  },
  {
    id: "assignment",
    title: "Assignment",
    description: "Where this person works and who they report to.",
    icon: "bx-buildings",
    fields: [
      { name: "siteId", label: "Location", type: "lookup", source: "sites" },
      {
        name: "divisionName",
        label: "Division",
        type: "select",
        help: "Choose a division for this location.",
      },
      {
        name: "departmentId",
        label: "Department",
        type: "lookup",
        source: "departments",
        nameField: "departmentName",
        fallbackLabel: "Department",
      },
      {
        name: "positionId",
        label: "Position",
        type: "lookup",
        source: "positions",
        nameField: "jobTitle",
        fallbackLabel: "Job title",
      },
      {
        name: "supervisorName",
        label: "Supervisor",
        readOnly: true,
        help: "Filled automatically from Division, Location and Department.",
      },
      { name: "hireDate", label: "Hire date", type: "date" },
    ],
  },
  {
    id: "records",
    title: "Records and access",
    icon: "bx-id-card",
    fields: [
      { name: "fileBase", label: "File base", help: "Legacy record prefix, if the person has one." },
      { name: "userAuthId", label: "User auth ID", help: "Links this record to a login account." },
      { name: "digitalSource", label: "Digital source", placeholder: "kiosk, import, web" },
    ],
  },
  {
    id: "driver",
    title: "Driver",
    icon: "bx-car",
    fields: [
      {
        name: "isCompanyDriver",
        label: "Company or contract driver",
        type: "checkbox",
        help: "Enables DOT and fleet requirements for this person.",
        wide: true,
      },
    ],
  },
  {
    id: "notes",
    title: "Notes",
    icon: "bx-notepad",
    fields: [{ name: "notes", label: "Notes", type: "textarea", wide: true }],
  },
  {
    id: "signature",
    title: "Signature",
    description: "Optional. Captured signatures are stored on the personnel record.",
    icon: "bx-pen",
    fields: [{ name: "signatureUrl", label: "Signature", type: "signature", wide: true }],
  },
];

export type PersonnelFormValues = Record<string, string | boolean | undefined>;

/** Starting values for a blank Add Person form. */
export function emptyPersonnelForm(): PersonnelFormValues {
  return { status: DEFAULT_PERSONNEL_STATUS };
}

function asFormString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** Map a status from the API onto one of PERSONNEL_STATUS_OPTIONS. */
export function normalizePersonnelStatus(raw: unknown): string {
  const value = asFormString(raw);
  if (value === "") return DEFAULT_PERSONNEL_STATUS;
  const match = PERSONNEL_STATUS_OPTIONS.find(
    (option) => option.value.toLowerCase() === value.toLowerCase(),
  );
  return match?.value ?? value;
}

/**
 * Hydrate the Add/Edit form from a personnel GET payload. Companion name
 * fields (departmentName, jobTitle) are filled when present so the free-text
 * fallback still works when a catalog is empty.
 */
export function personnelFormFromRecord(record: Record<string, unknown>): PersonnelFormValues {
  const values: PersonnelFormValues = emptyPersonnelForm();

  for (const field of personnelFormFields()) {
    if (field.type === "checkbox") {
      values[field.name] = record[field.name] === true || record[field.name] === "true";
      continue;
    }

    if (field.name === "status") {
      values.status = normalizePersonnelStatus(record.status);
      continue;
    }

    let text = asFormString(record[field.name]);
    if (field.type === "date" && text !== "") {
      const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
      if (match) text = match[1]!;
    }
    if (text !== "") values[field.name] = text;

    if (field.nameField) {
      const named = asFormString(record[field.nameField]);
      if (named !== "") values[field.nameField] = named;
    }
  }

  return values;
}

/** Every field across all sections, in render order. */
export function personnelFormFields(): PersonnelField[] {
  return PERSONNEL_FORM_SECTIONS.flatMap((s) =>
    s.columns ? s.columns.flatMap((c) => c.fields) : (s.fields ?? []),
  );
}

export function personnelFieldByName(name: string): PersonnelField | undefined {
  return personnelFormFields().find((f) => f.name === name);
}

/** Payload keys the form can produce, including lookup name companions. */
export function personnelPayloadKeys(): string[] {
  const keys = new Set<string>();
  for (const field of personnelFormFields()) {
    keys.add(field.name);
    if (field.nameField) keys.add(field.nameField);
  }
  return [...keys];
}

function asString(value: string | boolean | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Labels of required fields the user has not filled in. */
export function validatePersonnelForm(values: PersonnelFormValues): string[] {
  return personnelFormFields()
    .filter((f) => f.required && asString(values[f.name]) === "")
    .map((f) => f.label);
}

/** Display name the API would derive, useful for an optimistic summary. */
export function personnelDisplayName(values: PersonnelFormValues): string {
  const preferred = asString(values.preferredName);
  const first = preferred || asString(values.firstName);
  const last = asString(values.lastName);
  return [first, last].filter(Boolean).join(" ");
}

export type LookupNameResolver = (
  source: PersonnelLookupSource,
  id: string,
) => string | undefined;

/**
 * Build the POST body. Blank fields are omitted rather than sent as empty
 * strings so the columns stay null, matching the API's insert mapping. The
 * driver flag is only sent when ticked because the column defaults to false.
 */
export function buildPersonnelPayload(
  values: PersonnelFormValues,
  resolveLookupName?: LookupNameResolver,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const field of personnelFormFields()) {
    if (field.type === "checkbox") {
      if (values[field.name] === true || values[field.name] === "true") {
        payload[field.name] = true;
      }
      continue;
    }

    if (field.type === "lookup" && field.nameField) {
      const id = asString(values[field.name]);
      if (id !== "") {
        payload[field.name] = id;
        // Carry the human-readable label next to the FK so imported and
        // hand-entered records read the same way on the roster.
        const name = field.source ? resolveLookupName?.(field.source, id) : undefined;
        if (name) payload[field.nameField] = name;
        continue;
      }
      // No selection: accept a name typed into the text fallback so the column
      // stays reachable when the catalog is empty.
      const typed = asString(values[field.nameField]);
      if (typed !== "") payload[field.nameField] = typed;
      continue;
    }

    const value = asString(values[field.name]);
    if (value === "") continue;
    payload[field.name] = value;
  }

  return payload;
}

/**
 * PATCH body for the dedicated edit screen. Unlike create, blank strings are
 * sent so a cleared field can null out the column, and the driver flag is
 * always present so unticking it actually clears the bit.
 */
export function buildPersonnelUpdatePayload(
  values: PersonnelFormValues,
  resolveLookupName?: LookupNameResolver,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const field of personnelFormFields()) {
    if (field.type === "checkbox") {
      payload[field.name] = values[field.name] === true || values[field.name] === "true";
      continue;
    }

    if (field.type === "lookup" && field.nameField) {
      const id = asString(values[field.name]);
      if (id !== "") {
        payload[field.name] = id;
        const name = field.source ? resolveLookupName?.(field.source, id) : undefined;
        payload[field.nameField] = name ?? asString(values[field.nameField]);
        continue;
      }
      payload[field.name] = "";
      payload[field.nameField] = asString(values[field.nameField]);
      continue;
    }

    if (field.type === "lookup") {
      payload[field.name] = asString(values[field.name]);
      continue;
    }

    payload[field.name] = asString(values[field.name]);
  }

  return payload;
}

/** Rough cap so a stray high-resolution capture cannot bloat the row. */
export const MAX_SIGNATURE_DATA_URL_LENGTH = 200_000;

export function isAcceptableSignature(dataUrl: string): boolean {
  return (
    dataUrl.startsWith("data:image/") && dataUrl.length <= MAX_SIGNATURE_DATA_URL_LENGTH
  );
}

/**
 * Distinct non-empty values for a free-text field across existing records,
 * used to offer <datalist> suggestions for company and division.
 */
export function suggestionsFor(
  rows: ReadonlyArray<Record<string, unknown>>,
  key: string,
  limit = 25,
): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = row[key];
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (value === "") continue;
    seen.add(value);
    if (seen.size >= limit) break;
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}
