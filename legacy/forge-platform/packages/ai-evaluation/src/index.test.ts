import { describe, expect, it } from "vitest";
import { validateProviderNarrative } from "./index.js";
import type { AiSourceManifest } from "@forge/ai-contracts";

const manifest: AiSourceManifest = {
  recordType: "neris_incident",
  recordId: "019f9e06-0000-7000-8000-000000000020",
  sourceHash: "hashhash12",
  excludedFieldIds: [],
  fields: [
    {
      fieldId: "incident_type",
      category: "incident_type",
      label: "Type",
      classification: "INTERNAL",
      included: true,
      redacted: false,
      valuePreview: "Structure Fire",
    },
  ],
};

describe("validateProviderNarrative", () => {
  it("rejects schema mismatch", () => {
    const result = validateProviderNarrative(JSON.stringify({ narrative: "x" }), manifest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe("SCHEMA_MISMATCH");
  });

  it("accepts valid structured response", () => {
    const body = {
      narrative: "Units responded to a Structure Fire.",
      missingInformation: [],
      conflicts: [],
      warnings: [],
      unsupportedClaims: [],
      sourceReferences: ["incident_type"],
      qualityChecks: {
        chronological: true,
        clear: true,
        professional: true,
        factsOnly: true,
      },
    };
    const result = validateProviderNarrative(JSON.stringify(body), manifest);
    expect(result.ok).toBe(true);
  });
});
