import { describe, expect, it } from "vitest";
import {
  assertTemplateVersionMutable,
  extractTemplateVariableKeys,
  layoutKind,
  mergeTemplateFieldValues,
  stripHtmlToText,
  substituteTemplateVariables,
  validateRequiredTemplateFields,
} from "./industrial-print-templates.js";

describe("print template helpers", () => {
  it("substitutes {{variables}} without executing expressions", () => {
    expect(
      substituteTemplateVariables("Hello {{employee.first_name}} ({{missing}})", {
        "employee.first_name": "Ada",
      }),
    ).toBe("Hello Ada ()");
    expect(
      substituteTemplateVariables("Keep {{unknown}}", {}, { keepUnknown: true }),
    ).toBe("Keep {{unknown}}");
  });

  it("extracts variable keys and merges required field defaults", () => {
    expect(extractTemplateVariableKeys("{{a}} and {{b.c}}")).toEqual(["a", "b.c"]);
    const values = mergeTemplateFieldValues({
      fields: [
        { fieldKey: "title", required: true, defaultValue: "Default" },
        { fieldKey: "asset", required: false, defaultValue: null },
      ],
      fieldValues: { asset: "EQ-1" },
    });
    expect(values.title).toBe("Default");
    expect(values.asset).toBe("EQ-1");
    expect(values["date.current"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(
      validateRequiredTemplateFields({
        fields: [{ fieldKey: "title", required: true }],
        values: { title: "" },
      }),
    ).toEqual(["title"]);
  });

  it("blocks edits to non-draft versions and classifies layout kind", () => {
    expect(() => assertTemplateVersionMutable("PUBLISHED")).toThrow(/cannot be edited/i);
    expect(() => assertTemplateVersionMutable("DRAFT")).not.toThrow();
    expect(layoutKind({ kind: "HTML", html: "<p>x</p>" })).toBe("HTML");
    expect(layoutKind({ html: "<p>x</p>" })).toBe("HTML");
    expect(layoutKind({ kind: "FIELDS" })).toBe("FIELDS");
    expect(stripHtmlToText("<h1>Hi</h1><p>Line<br/>Two</p>")).toContain("Hi");
  });
});
