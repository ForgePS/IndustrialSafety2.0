import { describe, expect, it } from "vitest";
import { SchemaRowValidator, summarizeValidation } from "./schema-validator.js";
import type { TargetSchema } from "../interfaces.js";

const schema: TargetSchema = {
  ref: { productCode: "FORGE_INDUSTRIAL", moduleCode: "PERSONNEL", recordType: "personnel" },
  fields: [
    { field: "display_name", dataType: "string", required: true },
    { field: "email", dataType: "email", required: false },
    { field: "hire_date", dataType: "date", required: false },
  ],
};

describe("SchemaRowValidator", () => {
  it("flags missing required, invalid email, and invalid date", async () => {
    const validator = new SchemaRowValidator();
    const results = await validator.validate(
      [
        {
          sourceRowKey: "1",
          raw: {},
          mapped: { display_name: "Ok", email: "ok@ex.com", hire_date: "2020-01-15" },
        },
        { sourceRowKey: "2", raw: {}, mapped: { email: "bad" } },
        { sourceRowKey: "3", raw: {}, mapped: { display_name: "X", hire_date: "not-a-date" } },
      ],
      schema,
    );
    const summary = summarizeValidation(results);
    expect(summary.totalRows).toBe(3);
    expect(summary.ready).toBe(1);
    expect(summary.cannotImport).toBe(2);
    expect(results[1]?.issues.some((i) => i.rule === "required")).toBe(true);
    expect(results[1]?.issues.some((i) => i.rule === "email")).toBe(true);
    expect(results[2]?.issues.some((i) => i.rule === "date")).toBe(true);
  });
});
