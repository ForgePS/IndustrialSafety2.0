import { describe, expect, it } from "vitest";
import { redactSourceManifest } from "./index.js";
import type { AiSourceManifest } from "@forge/ai-contracts";

describe("redactSourceManifest", () => {
  it("blocks SSN and restricted fields without logging values", () => {
    const manifest: AiSourceManifest = {
      recordType: "neris_incident",
      recordId: "019f9e06-0000-7000-8000-000000000010",
      sourceHash: "abc12345hashvalue",
      excludedFieldIds: [],
      fields: [
        {
          fieldId: "patient_ssn",
          category: "personnel",
          label: "SSN",
          classification: "RESTRICTED",
          included: true,
          redacted: false,
          valuePreview: "123-45-6789",
        },
        {
          fieldId: "address",
          category: "location",
          label: "Address",
          classification: "INTERNAL",
          included: true,
          redacted: false,
          valuePreview: "100 Main",
        },
      ],
    };
    const result = redactSourceManifest(manifest);
    expect(result.blockedFieldIds).toContain("patient_ssn");
    expect(result.manifest.fields.find((f) => f.fieldId === "patient_ssn")?.included).toBe(false);
    expect(
      result.manifest.fields.find((f) => f.fieldId === "patient_ssn")?.valuePreview,
    ).toBeUndefined();
    expect(result.manifest.fields.find((f) => f.fieldId === "address")?.included).toBe(true);
    expect(JSON.stringify(result.auditSummary)).not.toContain("123-45-6789");
  });
});
