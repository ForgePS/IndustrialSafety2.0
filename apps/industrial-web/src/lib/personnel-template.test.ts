import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OPS_MODULE_CONFIG, groupCreateFields } from "./ops-modules";

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

/**
 * The Add Person template only works end to end if the column exists, the API
 * maps it, and the form posts it under the same name. The migrations are the
 * source of truth for the column list, so assert the form against them: a column
 * with no field is invisible, and a field with no column silently degrades to a
 * sourcePayload-only value that cannot be filtered or reported on.
 */
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

describe("personnel Add Person template", () => {
  const fieldNames = OPS_MODULE_CONFIG.personnel.createFields.map((f) => f.name);

  it("reads the migration column list", () => {
    expect(migrationColumns().length).toBeGreaterThan(0);
  });

  it.each(migrationColumns())("exposes a form field for %s", (column) => {
    expect(fieldNames).toContain(toCamelCase(column));
  });

  it("keeps first and last name required", () => {
    const required = OPS_MODULE_CONFIG.personnel.createFields
      .filter((f) => f.required)
      .map((f) => f.name);
    expect(required).toEqual(["firstName", "lastName"]);
  });

  it("exposes status in Identity and keeps fileBase under Records", () => {
    const byName = new Map(OPS_MODULE_CONFIG.personnel.createFields.map((f) => [f.name, f]));
    expect(byName.get("status")?.group).toBe("Identity");
    expect(byName.get("fileBase")?.group).toBe("Records");
  });

  it("uses a checkbox for the driver flag and a textarea for notes", () => {
    const byName = new Map(OPS_MODULE_CONFIG.personnel.createFields.map((f) => [f.name, f]));
    expect(byName.get("isCompanyDriver")?.type).toBe("checkbox");
    expect(byName.get("notes")?.type).toBe("textarea");
  });

  it("drops the pre-0043 department field in favour of the departmentName column", () => {
    expect(fieldNames).toContain("departmentName");
    expect(fieldNames).not.toContain("department");
  });

  it("has no duplicate field names", () => {
    expect(new Set(fieldNames).size).toBe(fieldNames.length);
  });
});

describe("groupCreateFields", () => {
  it("preserves group order by first appearance and keeps field order", () => {
    const grouped = groupCreateFields([
      { name: "a", label: "A", group: "One" },
      { name: "b", label: "B", group: "Two" },
      { name: "c", label: "C", group: "One" },
    ]);
    expect(grouped.map((g) => g.group)).toEqual(["One", "Two"]);
    expect(grouped[0]!.fields.map((f) => f.name)).toEqual(["a", "c"]);
  });

  it("keeps ungrouped fields in a null group", () => {
    const grouped = groupCreateFields([{ name: "a", label: "A" }]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.group).toBeNull();
  });

  it("covers every personnel field exactly once", () => {
    const fields = OPS_MODULE_CONFIG.personnel.createFields;
    const grouped = groupCreateFields(fields).flatMap((g) => g.fields);
    expect(grouped).toHaveLength(fields.length);
  });
});
