import { describe, expect, it } from "vitest";
import {
  StubAiNarrativeProvider,
  assembleSourceManifest,
  runNarrativeGenerationPipeline,
  assertRecordAllowsAiMutation,
  validateProviderNarrative,
  redactSourceManifest,
} from "@forge/ai";
import { evaluateClassificationGate } from "@forge/ai-policy";

const RECORD_ID = "019f9e06-aaaa-7000-8000-0000000000a1";
const TENANT_ID = "019f9e06-aaaa-7000-8000-0000000000t1";
const REQUEST_ID = "019f9e06-aaaa-7000-8000-0000000000r1";

function acceptanceFacts() {
  return assembleSourceManifest({
    recordType: "neris_incident",
    recordId: RECORD_ID,
    fields: [
      {
        fieldId: "dispatch_time",
        category: "datetime",
        label: "Dispatch time",
        classification: "INTERNAL",
        value: "2026-07-27T14:00:00Z",
      },
      {
        fieldId: "arrival_time",
        category: "datetime",
        label: "Arrival time",
        classification: "INTERNAL",
        value: "2026-07-27T14:08:00Z",
      },
      {
        fieldId: "location",
        category: "location",
        label: "Location",
        classification: "INTERNAL",
        value: "100 Synthetic Ave",
      },
      {
        fieldId: "incident_type",
        category: "incident_type",
        label: "Incident type",
        classification: "INTERNAL",
        value: "Structure Fire",
      },
      {
        fieldId: "units",
        category: "units_responding",
        label: "Units",
        classification: "INTERNAL",
        value: "E1, L1",
      },
      {
        fieldId: "personnel",
        category: "personnel",
        label: "Personnel",
        classification: "INTERNAL",
        value: "Officer A, Firefighter B",
      },
      {
        fieldId: "arrival_conditions",
        category: "arrival_conditions",
        label: "Arrival conditions",
        classification: "INTERNAL",
        value: "Smoke showing from alpha side",
      },
      {
        fieldId: "actions_taken",
        category: "actions_taken",
        label: "Actions taken",
        classification: "INTERNAL",
        value: "Primary search and hose line advanced",
      },
      {
        fieldId: "disposition",
        category: "disposition",
        label: "Disposition",
        classification: "INTERNAL",
        value: "Fire under control",
      },
      {
        fieldId: "water_supply",
        category: "water_supply",
        label: "Water supply",
        classification: "INTERNAL",
        value: "[missing]",
      },
      {
        fieldId: "location_cad",
        category: "location",
        label: "CAD location",
        classification: "INTERNAL",
        value: "100 Synthetic Avenue",
      },
      {
        fieldId: "patient_ssn",
        category: "personnel",
        label: "SSN",
        classification: "RESTRICTED",
        value: "000-00-0000",
      },
    ],
  });
}

describe("AI Narrative acceptance — pipeline (stub)", () => {
  it("reports missing field, conflict, excludes restricted, unreviewed label, $0 cost", async () => {
    const manifest = acceptanceFacts();
    const redacted = redactSourceManifest(manifest);
    expect(redacted.blockedFieldIds).toContain("patient_ssn");
    expect(redacted.manifest.fields.find((f) => f.fieldId === "patient_ssn")?.included).toBe(false);

    const result = await runNarrativeGenerationPipeline({
      request: {
        product: "RMS",
        module: "NERIS",
        recordType: "neris_incident",
        recordId: RECORD_ID,
        requestType: "GENERATE_FROM_RECORD",
        tone: "NEUTRAL",
        detailLevel: "STANDARD",
        includeCategories: [],
        excludeCategories: [],
        acknowledgeWarning: true,
        authorizeSensitiveData: false,
      },
      tenantId: TENANT_ID,
      requestId: REQUEST_ID,
      correlationId: "ai-accept-corr",
      provider: new StubAiNarrativeProvider(),
      manifest: redacted.manifest,
      classificationGate: {
        classification: "INTERNAL",
        tenantAllowsConfidential: false,
        tenantAllowsRestricted: false,
        hasSensitivePermission: false,
        authorizeSensitiveData: false,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draftLabel).toBe("AI DRAFT — NOT REVIEWED");
    expect(result.estimatedCostUsd).toBe(0);
    expect(result.structured.missingInformation.some((m) => /water supply/i.test(m))).toBe(true);
    expect(result.structured.conflicts.some((c) => /location/i.test(c))).toBe(true);
    expect(result.structured.narrative).not.toMatch(/000-00-0000/);
    expect(
      result.structured.unsupportedClaims.every((c) => !/000-00-0000|John Smith/i.test(c)),
    ).toBe(true);
    // Soft proper-noun heuristics may surface label tokens; they must not invent people/places.
    expect(result.structured.narrative).not.toMatch(/\bJohn\b|\bSmith\b/);
  });

  it("rejects restricted classification without authorization", () => {
    const gate = evaluateClassificationGate({
      classification: "RESTRICTED",
      tenantAllowsConfidential: false,
      tenantAllowsRestricted: false,
      hasSensitivePermission: false,
      authorizeSensitiveData: false,
    });
    expect(gate.allowed).toBe(false);
  });

  it("rejects invalid provider schema", () => {
    const manifest = acceptanceFacts();
    const validation = validateProviderNarrative(JSON.stringify({ narrative: "x" }), manifest);
    expect(validation.ok).toBe(false);
  });

  it("denies finalized record mutation", () => {
    expect(() => assertRecordAllowsAiMutation("FINALIZED")).toThrow(/AI_NARRATIVE_RECORD_LOCKED/);
  });
});
