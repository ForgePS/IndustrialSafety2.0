import { describe, expect, it } from "vitest";
import { parseFormCatalogImportPayload } from "./form-catalog-import.js";

describe("form-catalog-import", () => {
  it("parses a direct single-form payload", () => {
    const { templates, submissions, dryRun } = parseFormCatalogImportPayload({
      title: "Safety checklist",
      category: "Safety",
      fields: [
        { id: "location", label: "Location", type: "text", required: true },
        { id: "notes", label: "Notes", type: "textarea" },
      ],
    });
    expect(dryRun).toBe(false);
    expect(templates).toHaveLength(1);
    expect(templates[0]?.title).toBe("Safety checklist");
    expect(templates[0]?.schemaJson.fields).toHaveLength(2);
    expect(submissions).toHaveLength(0);
  });

  it("parses Firebase freeze template rows", () => {
    const { templates } = parseFormCatalogImportPayload({
      formTemplates: [
        {
          sourceDocumentId: "tpl-1",
          sourceCollection: "formTemplates",
          data: {
            name: "MVR Consent",
            fields: [{ id: "sig", label: "Signature", type: "signature" }],
          },
        },
      ],
    });
    expect(templates).toHaveLength(1);
    expect(templates[0]?.linkId).toBe("tpl-1");
    expect(templates[0]?.title).toBe("MVR Consent");
  });

  it("includes submissions when formSubmissions array is present", () => {
    const { submissions, includeSubmissions } = parseFormCatalogImportPayload({
      formTemplates: [{ title: "A", fields: [] }],
      formSubmissions: [
        {
          sourceDocumentId: "sub-1",
          data: { templateId: "tpl-1", responses: { location: "Plant 1" } },
        },
      ],
    });
    expect(includeSubmissions).toBe(true);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]?.templateLinkId).toBe("tpl-1");
  });
});
