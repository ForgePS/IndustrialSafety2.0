import { describe, expect, it } from "vitest";
import {
  buildFormAnswersPayload,
  extractFormFields,
  hydrateFormAnswers,
  isSignatureLabel,
  parseFormFieldsInput,
} from "./forms-module";

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

  it("treats Signature fields as signature pads", () => {
    const fields = extractFormFields({
      schemaJson: {
        fields: [
          { id: "empSig", label: "Employee Signature", type: "text" },
          { id: "sig", label: "Signature", type: "signature" },
          { id: "sigDate", label: "Signature date", type: "date" },
        ],
      },
    });
    expect(fields.map((f) => ({ id: f.id, type: f.type }))).toEqual([
      { id: "empSig", type: "signature" },
      { id: "sig", type: "signature" },
      { id: "sigDate", type: "date" },
    ]);
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

  it("hardcodes PRM MVR policy into the Policy & Employee Agreement field", () => {
    const fields = extractFormFields({
      title: "Acknowledgement for Driving Company Vehicles (MVR Consent)",
      sourceDocumentId: "z8DdbRny93Oi7TkWNQ3M",
      schemaJson: {
        fields: [{ id: "policy-text", label: "Policy & Employee Agreement", type: "content" }],
      },
    });
    expect(fields[0]?.type).toBe("content");
    expect(fields[0]?.content).toContain("Motor Vehicle Record (MVR)");
    expect(fields[0]?.content).toContain("Employee Agreement:");
  });

  it("turns Issuing State into a 50-state dropdown", () => {
    const fields = extractFormFields({
      schemaJson: {
        fields: [
          {
            id: "license-issuing-state",
            label: "Issuing State",
            type: "text",
            required: true,
          },
        ],
      },
    });
    expect(fields[0]?.type).toBe("select");
    expect(fields[0]?.options).toHaveLength(50);
    expect(fields[0]?.options?.[0]).toBe("AL — Alabama");
    expect(fields[0]?.options?.[49]).toBe("WY — Wyoming");
  });

  it("parses builder lines into fields", () => {
    expect(parseFormFieldsInput("Hazard|textarea\nStatus|select|Open|Closed\nSignature")).toEqual([
      { id: "field-1", label: "Hazard", type: "textarea" },
      { id: "field-2", label: "Status", type: "select", options: ["Open", "Closed"] },
      { id: "field-3", label: "Signature", type: "signature" },
    ]);
  });
});

describe("hydrateFormAnswers / buildFormAnswersPayload", () => {
  const fields = [
    { id: "notes", label: "Notes", type: "textarea" as const },
    { id: "ack", label: "Ack", type: "checkbox" as const },
    { id: "sig", label: "Signature", type: "signature" as const },
  ];

  it("hydrates stored answers into fill-form strings", () => {
    expect(
      hydrateFormAnswers(
        { notes: "Hello", ack: true, sig: "data:image/png;base64,AAA" },
        fields,
      ),
    ).toEqual({
      notes: "Hello",
      ack: "true",
      sig: "data:image/png;base64,AAA",
    });
  });

  it("builds API payloads from fill-form state", () => {
    expect(
      buildFormAnswersPayload(
        { notes: " Hello ", ack: "true", sig: "data:image/png;base64,AAA" },
        fields,
      ),
    ).toEqual({
      notes: "Hello",
      ack: true,
      sig: "data:image/png;base64,AAA",
    });
  });
});

describe("isSignatureLabel", () => {
  it("matches signature labels but not signature dates", () => {
    expect(isSignatureLabel("Signature")).toBe(true);
    expect(isSignatureLabel("Employee signature")).toBe(true);
    expect(isSignatureLabel("Sign here")).toBe(true);
    expect(isSignatureLabel("Signature date")).toBe(false);
    expect(isSignatureLabel("Date of signature")).toBe(false);
    expect(isSignatureLabel("Notes")).toBe(false);
  });
});
