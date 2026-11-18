import { describe, expect, it } from "vitest";
import {
  StubAiNarrativeProvider,
  assembleSourceManifest,
  runNarrativeGenerationPipeline,
  assertRecordAllowsAiMutation,
} from "./index.js";

describe("assembleSourceManifest", () => {
  it("hashes included fields and respects category filters", () => {
    const manifest = assembleSourceManifest({
      recordType: "neris_incident",
      recordId: "019f9e06-0000-7000-8000-000000000001",
      includeCategories: ["location"],
      fields: [
        {
          fieldId: "address",
          category: "location",
          label: "Address",
          classification: "INTERNAL",
          value: "100 Main St",
        },
        {
          fieldId: "ssn",
          category: "personnel",
          label: "SSN",
          classification: "RESTRICTED",
          value: "000-00-0000",
        },
      ],
    });
    expect(manifest.fields.find((f) => f.fieldId === "address")?.included).toBe(true);
    expect(manifest.fields.find((f) => f.fieldId === "ssn")?.included).toBe(false);
    expect(manifest.sourceHash).toHaveLength(64);
  });
});

describe("runNarrativeGenerationPipeline", () => {
  it("produces an unreviewed draft via stub provider", async () => {
    const manifest = assembleSourceManifest({
      recordType: "neris_incident",
      recordId: "019f9e06-0000-7000-8000-000000000002",
      fields: [
        {
          fieldId: "incident_type",
          category: "incident_type",
          label: "Type",
          classification: "INTERNAL",
          value: "Structure Fire",
        },
      ],
    });
    const result = await runNarrativeGenerationPipeline({
      request: {
        product: "RMS",
        module: "NERIS",
        recordType: "neris_incident",
        recordId: manifest.recordId,
        requestType: "GENERATE_FROM_RECORD",
        tone: "NEUTRAL",
        detailLevel: "STANDARD",
        includeCategories: [],
        excludeCategories: [],
        acknowledgeWarning: true,
        authorizeSensitiveData: false,
      },
      tenantId: "019f9e06-0000-7000-8000-0000000000aa",
      requestId: "019f9e06-0000-7000-8000-0000000000bb",
      correlationId: "test-corr",
      provider: new StubAiNarrativeProvider(),
      manifest,
      classificationGate: {
        classification: "INTERNAL",
        tenantAllowsConfidential: false,
        tenantAllowsRestricted: false,
        hasSensitivePermission: false,
        authorizeSensitiveData: false,
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draftLabel).toContain("NOT REVIEWED");
      expect(result.structured.narrative.length).toBeGreaterThan(0);
      expect(result.requiredWarning).toMatch(/incomplete or inaccurate/i);
    }
  });

  it("blocks restricted classification without authorization", async () => {
    const manifest = assembleSourceManifest({
      recordType: "neris_incident",
      recordId: "019f9e06-0000-7000-8000-000000000003",
      fields: [],
    });
    const result = await runNarrativeGenerationPipeline({
      request: {
        product: "RMS",
        module: "NERIS",
        recordType: "neris_incident",
        recordId: manifest.recordId,
        requestType: "GENERATE_FROM_RECORD",
        tone: "NEUTRAL",
        detailLevel: "STANDARD",
        includeCategories: [],
        excludeCategories: [],
        acknowledgeWarning: true,
        authorizeSensitiveData: false,
      },
      tenantId: "019f9e06-0000-7000-8000-0000000000aa",
      requestId: "019f9e06-0000-7000-8000-0000000000cc",
      correlationId: "test-corr",
      provider: new StubAiNarrativeProvider(),
      manifest,
      classificationGate: {
        classification: "RESTRICTED",
        tenantAllowsConfidential: false,
        tenantAllowsRestricted: false,
        hasSensitivePermission: false,
        authorizeSensitiveData: false,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("CLASSIFICATION");
      expect(result.reasonCode).toBe("RESTRICTED_BLOCKED");
    }
  });
});

describe("assertRecordAllowsAiMutation", () => {
  it("rejects finalized records", () => {
    expect(() => assertRecordAllowsAiMutation("FINALIZED")).toThrow(/AI_NARRATIVE_RECORD_LOCKED/);
  });
});
