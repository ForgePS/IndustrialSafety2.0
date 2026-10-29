import { describe, expect, it } from "vitest";
import { AliasColumnMapper, resolveAliasTarget } from "./column-mapper.js";
import type { TargetSchema } from "../interfaces.js";

const personnelSchema: TargetSchema = {
  ref: { productCode: "FORGE_INDUSTRIAL", moduleCode: "PERSONNEL", recordType: "personnel" },
  fields: [
    { field: "display_name", dataType: "string", required: true },
    { field: "employee_number", dataType: "string", required: false },
    { field: "email", dataType: "email", required: false },
    { field: "phone", dataType: "string", required: false },
    { field: "department", dataType: "string", required: false },
    { field: "position", dataType: "string", required: false },
    { field: "employment_type", dataType: "string", required: false },
    { field: "hire_date", dataType: "date", required: false },
    { field: "supervisor", dataType: "string", required: false },
    { field: "location", dataType: "string", required: false },
  ],
};

describe("AliasColumnMapper", () => {
  it("auto-maps common personnel spreadsheet headers", async () => {
    const mapper = new AliasColumnMapper();
    const headers = [
      "Employee Name",
      "Emp Number",
      "Department",
      "Position",
      "Supervisor",
      "Hire Date",
      "Cell Phone",
      "Email",
    ];
    const mappings = await mapper.suggest(headers, personnelSchema);
    const bySource = Object.fromEntries(mappings.map((m) => [m.sourceColumn, m.targetField]));
    expect(bySource["Employee Name"]).toBe("display_name");
    expect(bySource["Emp Number"]).toBe("employee_number");
    expect(bySource.Department).toBe("department");
    expect(bySource.Position).toBe("position");
    expect(bySource.Supervisor).toBe("supervisor");
    expect(bySource["Hire Date"]).toBe("hire_date");
    expect(bySource["Cell Phone"]).toBe("phone");
    expect(bySource.Email).toBe("email");
  });

  it("applies mappings onto staged rows", async () => {
    const mapper = new AliasColumnMapper();
    const mappings = await mapper.suggest(["Employee Name", "Email"], personnelSchema);
    const rows = await mapper.apply(
      [{ sourceRowKey: "1", raw: { "Employee Name": "Ada Lovelace", Email: "ada@example.com" } }],
      mappings,
    );
    expect(rows[0]?.mapped).toEqual({
      display_name: "Ada Lovelace",
      email: "ada@example.com",
    });
  });

  it("resolves badge and dept aliases", () => {
    const allowed = new Set(["employee_number", "department", "position"]);
    expect(resolveAliasTarget("Badge #", allowed)).toBe("employee_number");
    expect(resolveAliasTarget("Dept", allowed)).toBe("department");
    expect(resolveAliasTarget("Job Title", allowed)).toBe("position");
  });
});
