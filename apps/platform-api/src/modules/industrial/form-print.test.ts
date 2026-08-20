import { describe, expect, it } from "vitest";
import {
  buildFormSubmissionPrintableHtml,
  enrichPrintFieldsForDefinition,
  flattenFormResponses,
  resolveFormAnswers,
  unwrapJsonRecord,
} from "./form-print.js";
import { PRODUCERS_MVR_POLICY_TEXT } from "./producers-mvr-policy.js";

describe("form-print helpers", () => {
  it("unwraps double-encoded JSON payloads", () => {
    const inner = { templateName: "MVR Consent", responses: { a: "1" } };
    expect(unwrapJsonRecord(JSON.stringify(JSON.stringify(inner)))).toEqual(inner);
  });

  it("flattens signature response envelopes to image data URLs", () => {
    expect(
      flattenFormResponses({
        "employee-signature": {
          method: "draw",
          image: "data:image/png;base64,AAA",
          signedByName: "Ada",
        },
        "employee-signature-date": "2026-07-15",
      }),
    ).toEqual({
      "employee-signature": "data:image/png;base64,AAA",
      "employee-signature-date": "2026-07-15",
    });
  });

  it("resolves answers from source_payload.responses when column is empty", () => {
    expect(
      resolveFormAnswers(
        {},
        {
          responses: { notes: "Hello" },
        },
      ),
    ).toEqual({ notes: "Hello" });
  });

  it("puts company logo at the top of printable HTML", () => {
    const html = buildFormSubmissionPrintableHtml({
      title: "MVR Consent",
      status: "SUBMITTED",
      submittedAt: "2026-07-15T18:34:24.889Z",
      fields: [{ id: "notes", label: "Notes" }],
      answers: { notes: "Signed" },
      branding: {
        logoUrl: "https://example.com/logo.png",
        reportIdentity: "Producers Rice Mill Reports",
        documentFooter: "Producers Rice Mill, Inc.",
        companyName: "Producers Rice Mill",
      },
    });
    expect(html).toContain('class="logo"');
    expect(html).toContain("https://example.com/logo.png");
    expect(html.indexOf('class="logo"')).toBeLessThan(html.indexOf("<h1>MVR Consent</h1>"));
    expect(html).toContain("Producers Rice Mill Reports");
  });

  it("injects hardcoded PRM MVR policy into printable fields", () => {
    const fields = enrichPrintFieldsForDefinition(
      [{ id: "policy-text", label: "Policy & Employee Agreement", kind: "content", content: "" }],
      {
        title: "Acknowledgement for Driving Company Vehicles (MVR Consent)",
        sourceDocumentId: "z8DdbRny93Oi7TkWNQ3M",
      },
    );
    expect(fields[0]?.content).toBe(PRODUCERS_MVR_POLICY_TEXT);
    const html = buildFormSubmissionPrintableHtml({
      title: "MVR Consent",
      fields,
      answers: {},
      branding: {
        logoUrl: null,
        reportIdentity: "Producers Rice Mill Reports",
        documentFooter: "Producers Rice Mill, Inc.",
        companyName: "Producers Rice Mill",
      },
    });
    expect(html).toContain("Motor Vehicle Record (MVR)");
    expect(html).toContain("minimum of 21 years of age");
    expect(html).toContain("Employee Agreement:");
  });
});
