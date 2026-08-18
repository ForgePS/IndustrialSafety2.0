import { describe, expect, it } from "vitest";
import { extractFormFields, parseFormFieldsInput } from "./forms-module";

describe("forms-module", () => {
  it("extracts fields from schemaJson", () => {
    const fields = extractFormFields({
      schemaJson: {
        fields: [
          { id: "ppe", label: "PPE worn", type: "checkbox" },
          { name: "location", title: "Location", type: "text", required: true },
        ],
      },
    });
    expect(fields).toEqual([
      { id: "ppe", label: "PPE worn", type: "checkbox" },
      { id: "location", label: "Location", type: "text", required: true },
    ]);
  });

  it("reads nested section questions and select options", () => {
    const fields = extractFormFields({
      sourcePayload: {
        sections: [
          {
            fields: [
              {
                id: "severity",
                label: "Severity",
                type: "select",
                options: ["Low", "High"],
              },
            ],
          },
        ],
      },
    });
    expect(fields[0]).toMatchObject({
      id: "severity",
      type: "select",
      options: ["Low", "High"],
    });
  });

  it("falls back to default operational fields", () => {
    const fields = extractFormFields({ title: "Blank template" });
    expect(fields.map((f) => f.id)).toEqual([
      "submittedBy",
      "location",
      "recordDate",
      "notes",
    ]);
  });

  it("parses builder lines into fields", () => {
    expect(parseFormFieldsInput("Hazard|textarea\nStatus|select|Open|Closed")).toEqual([
      { id: "field-1", label: "Hazard", type: "textarea" },
      { id: "field-2", label: "Status", type: "select", options: ["Open", "Closed"] },
    ]);
  });
});
