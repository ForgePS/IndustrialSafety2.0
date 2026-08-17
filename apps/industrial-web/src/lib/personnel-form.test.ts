import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAX_SIGNATURE_DATA_URL_LENGTH,
  PERSONNEL_FORM_SECTIONS,
  buildPersonnelPayload,
  buildPersonnelUpdatePayload,
  emptyPersonnelForm,
  isAcceptableSignature,
  normalizePersonnelStatus,
  personnelDisplayName,
  personnelFieldByName,
  personnelFormFields,
  personnelFormFromRecord,
  personnelPayloadKeys,
  suggestionsFor,
  validatePersonnelForm,
} from "./personnel-form";
import {
  EMPTY_LOOKUPS,
  lookupPath,
  normalizeLookupRows,
  resolveLookupLabel,
} from "./personnel-lookups";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = [
  path.resolve(
    HERE,
    "../../../../packages/database/drizzle/0043_industrial_personnel_add_person_template_s1.sql",
  ),
  path.resolve(
    HERE,
    "../../../../packages/database/drizzle/0044_industrial_personnel_company_contact_s1.sql",
  ),
  path.resolve(
    HERE,
    "../../../../packages/database/drizzle/0045_industrial_personnel_medical_emergency_s1.sql",
  ),
];

function migrationColumns(): string[] {
  const columns: string[] = [];
  for (const file of MIGRATIONS) {
    const sql = readFileSync(file, "utf8");
    for (const m of sql.matchAll(/ADD COLUMN IF NOT EXISTS "([a-z_]+)"/g)) {
      columns.push(m[1]!);
    }
  }
  // company_name remains a column for imports, but Assignment no longer collects it.
  return columns.filter((c) => c !== "company_name");
}

function toCamelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

describe("Add Person form model", () => {
  it("reads the migration column list", () => {
    expect(migrationColumns().length).toBeGreaterThan(0);
  });

  it.each(migrationColumns())("can submit a value for %s", (column) => {
    // departmentName and jobTitle arrive via their lookup's nameField rather
    // than a field of their own, so assert against payload keys.
    expect(personnelPayloadKeys()).toContain(toCamelCase(column));
  });

  it("keeps first name, last name and status required", () => {
    const required = personnelFormFields()
      .filter((f) => f.required)
      .map((f) => f.name);
    expect(required).toEqual(["status", "firstName", "lastName"]);
  });

  it("replaces the Identity file-base slot with a Status select", () => {
    const identity = PERSONNEL_FORM_SECTIONS.find((s) => s.id === "identity");
    expect(identity?.fields?.map((f) => f.name)).toContain("status");
    expect(identity?.fields?.map((f) => f.name)).not.toContain("fileBase");
    expect(personnelFieldByName("status")?.type).toBe("select");
    expect(personnelFieldByName("status")?.options?.map((o) => o.value)).toEqual([
      "Active",
      "Inactive",
      "Terminated",
      "Leave",
    ]);
  });

  it("keeps file base under Records so the column stays reachable", () => {
    const records = PERSONNEL_FORM_SECTIONS.find((s) => s.id === "records");
    expect(records?.fields?.map((f) => f.name)).toContain("fileBase");
  });

  it("has no duplicate field names across sections", () => {
    const names = personnelFormFields().map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every section a non-empty title and at least one field", () => {
    expect(PERSONNEL_FORM_SECTIONS.length).toBeGreaterThan(0);
    for (const section of PERSONNEL_FORM_SECTIONS) {
      expect(section.title, `${section.id} needs a title`).not.toBe("");
      const fieldCount = section.columns
        ? section.columns.reduce((n, c) => n + c.fields.length, 0)
        : (section.fields?.length ?? 0);
      expect(fieldCount, `${section.id} needs fields`).toBeGreaterThan(0);
    }
  });

  it("declares a source for every lookup field", () => {
    for (const field of personnelFormFields()) {
      if (field.type !== "lookup") continue;
      expect(field.source, `${field.name} needs a lookup source`).toBeTruthy();
    }
  });

  it("routes department and position lookups to their name columns", () => {
    expect(personnelFieldByName("departmentId")?.nameField).toBe("departmentName");
    expect(personnelFieldByName("positionId")?.nameField).toBe("jobTitle");
  });

  it("does not give the site lookup a name column, since personnel has none", () => {
    expect(personnelFieldByName("siteId")?.nameField).toBeUndefined();
  });

  it("gives every lookup with a name column a fallback label to type under", () => {
    for (const field of personnelFormFields()) {
      if (field.type !== "lookup" || !field.nameField) continue;
      expect(field.fallbackLabel, `${field.name} needs a fallbackLabel`).toBeTruthy();
    }
  });

  it("uses email and tel types for personal and company contact fields", () => {
    expect(personnelFieldByName("email")?.type).toBe("email");
    expect(personnelFieldByName("phone")?.type).toBe("tel");
    expect(personnelFieldByName("companyEmail")?.type).toBe("email");
    expect(personnelFieldByName("companyPhone")?.type).toBe("tel");
  });

  it("keeps company contact fields in the Contact section", () => {
    const contact = PERSONNEL_FORM_SECTIONS.find((s) => s.id === "contact");
    expect(contact?.fields?.map((f) => f.name)).toEqual([
      "email",
      "phone",
      "companyEmail",
      "companyPhone",
    ]);
  });

  it("exposes a Medical section with allergies and pertinent history", () => {
    const medical = PERSONNEL_FORM_SECTIONS.find((s) => s.id === "medical");
    expect(medical?.fields?.map((f) => f.name)).toEqual(["allergies", "medicalHistory"]);
    expect(personnelFieldByName("allergies")?.type).toBe("textarea");
    expect(personnelFieldByName("medicalHistory")?.label).toBe("Pertinent medical history");
  });

  it("places Medical directly under Contact", () => {
    const ids = PERSONNEL_FORM_SECTIONS.map((s) => s.id);
    expect(ids.indexOf("medical")).toBe(ids.indexOf("contact") + 1);
  });

  it("drops Company from Assignment and makes Division a select", () => {
    const assignment = PERSONNEL_FORM_SECTIONS.find((s) => s.id === "assignment");
    const names = assignment?.fields?.map((f) => f.name) ?? [];
    expect(names).not.toContain("companyName");
    expect(names).toContain("divisionName");
    expect(personnelFieldByName("divisionName")?.type).toBe("select");
    expect(personnelFieldByName("supervisorName")?.readOnly).toBe(true);
  });

  it("lays out emergency contacts as Contact 1 | Contact 2 columns", () => {
    const emergency = PERSONNEL_FORM_SECTIONS.find((s) => s.id === "emergency");
    expect(emergency?.columns?.map((c) => c.title)).toEqual(["Contact 1", "Contact 2"]);
    expect(emergency?.columns?.[0]?.fields.map((f) => f.name)).toEqual([
      "emergencyContact1Name",
      "emergencyContact1Phone",
      "emergencyContact1Relationship",
    ]);
    expect(emergency?.columns?.[1]?.fields.map((f) => f.name)).toEqual([
      "emergencyContact2Name",
      "emergencyContact2Phone",
      "emergencyContact2Relationship",
    ]);
    expect(emergency?.columns?.[0]?.fields.map((f) => f.label)).toEqual([
      "Name",
      "Phone",
      "Relationship",
    ]);
  });

  it("uses a checkbox for the driver flag and a textarea for notes", () => {
    expect(personnelFieldByName("isCompanyDriver")?.type).toBe("checkbox");
    expect(personnelFieldByName("notes")?.type).toBe("textarea");
  });
});

describe("validatePersonnelForm", () => {
  it("reports status and both names when the form is empty", () => {
    expect(validatePersonnelForm({})).toEqual(["Status", "First name", "Last name"]);
  });

  it("treats whitespace as missing", () => {
    expect(validatePersonnelForm({ status: "Active", firstName: "   ", lastName: "Bogy" })).toEqual([
      "First name",
    ]);
  });

  it("passes once status and both names are present", () => {
    expect(
      validatePersonnelForm({ status: "Active", firstName: "Tim", lastName: "Bogy" }),
    ).toEqual([]);
  });
});

describe("emptyPersonnelForm", () => {
  it("defaults status to Active", () => {
    expect(emptyPersonnelForm()).toEqual({ status: "Active" });
  });
});

describe("personnelFormFromRecord", () => {
  it("hydrates form fields and normalizes status casing", () => {
    const values = personnelFormFromRecord({
      firstName: "Aaliyah",
      lastName: "Shelton",
      status: "active",
      hireDate: "2026-02-25T00:00:00.000Z",
      isCompanyDriver: true,
      departmentName: "STUTTGART",
      middleName: "Z",
    });
    expect(values).toMatchObject({
      firstName: "Aaliyah",
      lastName: "Shelton",
      status: "Active",
      hireDate: "2026-02-25",
      isCompanyDriver: true,
      departmentName: "STUTTGART",
      middleName: "Z",
    });
  });

  it("defaults missing status to Active", () => {
    expect(normalizePersonnelStatus("")).toBe("Active");
    expect(personnelFormFromRecord({}).status).toBe("Active");
  });
});

describe("buildPersonnelPayload", () => {
  it("includes status when selected", () => {
    expect(buildPersonnelPayload({ status: "Inactive" }).status).toBe("Inactive");
  });

  it("omits blank and whitespace-only values so columns stay null", () => {
    const payload = buildPersonnelPayload({
      firstName: "Tim",
      lastName: "Bogy",
      middleName: "",
      suffix: "   ",
    });
    expect(payload).toMatchObject({ firstName: "Tim", lastName: "Bogy" });
    expect(payload).not.toHaveProperty("middleName");
    expect(payload).not.toHaveProperty("suffix");
  });

  it("trims values it does send", () => {
    expect(buildPersonnelPayload({ firstName: "  Tim  " }).firstName).toBe("Tim");
  });

  it("omits the driver flag unless ticked, letting the column default apply", () => {
    expect(buildPersonnelPayload({})).not.toHaveProperty("isCompanyDriver");
    expect(buildPersonnelPayload({ isCompanyDriver: false })).not.toHaveProperty(
      "isCompanyDriver",
    );
    expect(buildPersonnelPayload({ isCompanyDriver: true }).isCompanyDriver).toBe(true);
  });

  it("sends the resolved label alongside a lookup id", () => {
    const payload = buildPersonnelPayload({ departmentId: "dep-1" }, (source, id) =>
      source === "departments" && id === "dep-1" ? "Milling" : undefined,
    );
    expect(payload).toMatchObject({ departmentId: "dep-1", departmentName: "Milling" });
  });

  it("maps the position lookup onto jobTitle", () => {
    const payload = buildPersonnelPayload({ positionId: "pos-1" }, () => "Millwright");
    expect(payload).toMatchObject({ positionId: "pos-1", jobTitle: "Millwright" });
  });

  it("still sends the id when the label cannot be resolved", () => {
    const payload = buildPersonnelPayload({ departmentId: "dep-9" }, () => undefined);
    expect(payload.departmentId).toBe("dep-9");
    expect(payload).not.toHaveProperty("departmentName");
  });

  it("sends the site id with no companion name", () => {
    const payload = buildPersonnelPayload({ siteId: "site-1" }, () => "Stuttgart");
    expect(payload.siteId).toBe("site-1");
    expect(payload).not.toHaveProperty("siteName");
  });

  // The positions catalog is empty for some tenants, so the paired name column
  // has to stay reachable by typing.
  it("accepts a typed job title when no position is selected", () => {
    const payload = buildPersonnelPayload({ jobTitle: "Millwright" });
    expect(payload.jobTitle).toBe("Millwright");
    expect(payload).not.toHaveProperty("positionId");
  });

  it("accepts a typed department name when no department is selected", () => {
    const payload = buildPersonnelPayload({ departmentName: "Milling" });
    expect(payload.departmentName).toBe("Milling");
    expect(payload).not.toHaveProperty("departmentId");
  });

  it("prefers the resolved label over a stale typed name", () => {
    const payload = buildPersonnelPayload(
      { positionId: "pos-1", jobTitle: "Typed" },
      () => "Millwright",
    );
    expect(payload).toMatchObject({ positionId: "pos-1", jobTitle: "Millwright" });
  });

  it("keeps a typed name out of the payload when it is blank", () => {
    expect(buildPersonnelPayload({ jobTitle: "   " })).not.toHaveProperty("jobTitle");
  });
});

describe("buildPersonnelUpdatePayload", () => {
  it("always sends the driver flag so unticking clears it", () => {
    expect(buildPersonnelUpdatePayload({}).isCompanyDriver).toBe(false);
    expect(buildPersonnelUpdatePayload({ isCompanyDriver: true }).isCompanyDriver).toBe(true);
  });

  it("sends blank strings so cleared fields can null out on PATCH", () => {
    const payload = buildPersonnelUpdatePayload({
      firstName: "Ada",
      lastName: "",
      phone: "   ",
      status: "Active",
    });
    expect(payload.firstName).toBe("Ada");
    expect(payload.lastName).toBe("");
    expect(payload.phone).toBe("");
    expect(payload.status).toBe("Active");
  });
});

describe("personnelDisplayName", () => {
  it("joins first and last name", () => {
    expect(personnelDisplayName({ firstName: "Tim", lastName: "Bogy" })).toBe("Tim Bogy");
  });

  it("prefers the preferred name over the legal first name", () => {
    expect(
      personnelDisplayName({ firstName: "Timothy", preferredName: "Tim", lastName: "Bogy" }),
    ).toBe("Tim Bogy");
  });

  it("returns an empty string with nothing entered", () => {
    expect(personnelDisplayName({})).toBe("");
  });
});

describe("isAcceptableSignature", () => {
  it("accepts a small PNG data URL", () => {
    expect(isAcceptableSignature("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
  });

  it("rejects anything that is not an image data URL", () => {
    expect(isAcceptableSignature("https://example.com/sig.png")).toBe(false);
  });

  it("rejects an oversized capture", () => {
    const huge = `data:image/png;base64,${"A".repeat(MAX_SIGNATURE_DATA_URL_LENGTH)}`;
    expect(isAcceptableSignature(huge)).toBe(false);
  });
});

describe("suggestionsFor", () => {
  it("returns sorted distinct non-empty values", () => {
    const rows = [
      { companyName: "Producers" },
      { companyName: "Acme" },
      { companyName: "Producers" },
      { companyName: "  " },
      { companyName: 42 },
      {},
    ];
    expect(suggestionsFor(rows, "companyName")).toEqual(["Acme", "Producers"]);
  });

  it("honours the limit", () => {
    const rows = [{ x: "a" }, { x: "b" }, { x: "c" }];
    expect(suggestionsFor(rows, "x", 2)).toHaveLength(2);
  });
});

describe("lookupPath", () => {
  it("uses the flat API for sites, with no tenant needed", () => {
    expect(lookupPath("sites")).toBe("/api/v1/industrial/sites");
  });

  it("uses the tenant-scoped API for departments and positions", () => {
    expect(lookupPath("departments", "t-1")).toBe(
      "/api/v1/tenants/t-1/industrial/departments",
    );
    expect(lookupPath("positions", "t-1")).toBe("/api/v1/tenants/t-1/industrial/positions");
  });

  it("returns null when a tenant-scoped lookup has no tenant id", () => {
    expect(lookupPath("departments", null)).toBeNull();
    expect(lookupPath("positions", undefined)).toBeNull();
  });
});

describe("normalizeLookupRows", () => {
  it("reads a paginated envelope and a bare array alike", () => {
    const expected = [{ id: "a", label: "Alpha", siteId: null }];
    expect(normalizeLookupRows({ items: [{ id: "a", name: "Alpha" }] })).toEqual(expected);
    expect(normalizeLookupRows([{ id: "a", name: "Alpha" }])).toEqual(expected);
  });

  it("falls back through name, title and displayName", () => {
    expect(normalizeLookupRows([{ id: "a", title: "Titled" }])[0]!.label).toBe("Titled");
    expect(normalizeLookupRows([{ id: "a", displayName: "Shown" }])[0]!.label).toBe("Shown");
  });

  it("labels a nameless row with its id rather than dropping it", () => {
    expect(normalizeLookupRows([{ id: "a" }])[0]!.label).toBe("a");
  });

  it("drops rows with no usable id", () => {
    expect(normalizeLookupRows([{ name: "no id" }, { id: "", name: "blank" }])).toEqual([]);
  });

  it("excludes archived and non-active rows", () => {
    const rows = [
      { id: "a", name: "Active", status: "ACTIVE" },
      { id: "b", name: "Retired", status: "INACTIVE" },
      { id: "c", name: "Gone", archivedAt: "2026-01-01" },
    ];
    expect(normalizeLookupRows(rows).map((o) => o.id)).toEqual(["a"]);
  });

  it("keeps rows that report no status at all", () => {
    expect(normalizeLookupRows([{ id: "a", name: "Alpha" }])).toHaveLength(1);
  });

  it("sorts by label", () => {
    const rows = [
      { id: "b", name: "Beta" },
      { id: "a", name: "Alpha" },
    ];
    expect(normalizeLookupRows(rows).map((o) => o.label)).toEqual(["Alpha", "Beta"]);
  });

  it("tolerates junk payloads", () => {
    expect(normalizeLookupRows(null)).toEqual([]);
    expect(normalizeLookupRows({})).toEqual([]);
    expect(normalizeLookupRows([null, "x", 1])).toEqual([]);
  });
});

describe("resolveLookupLabel", () => {
  it("finds a label in the loaded options", () => {
    const lookups = { ...EMPTY_LOOKUPS, sites: [{ id: "s1", label: "Stuttgart" }] };
    expect(resolveLookupLabel(lookups, "sites", "s1")).toBe("Stuttgart");
  });

  it("returns undefined for an unknown id", () => {
    expect(resolveLookupLabel(EMPTY_LOOKUPS, "sites", "nope")).toBeUndefined();
  });
});
