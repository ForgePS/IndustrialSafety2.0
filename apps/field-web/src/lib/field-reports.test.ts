import { describe, expect, it } from "vitest";
import {
  buildEquipmentIssuePayload,
  buildIncidentPayload,
  buildObservationPayload,
  EMPTY_REPORT_DRAFT,
  parseReportType,
  resolveIncidentCategory,
  validateReportDraft,
  type FieldReportDraft,
} from "./field-reports";

function draft(partial: Partial<FieldReportDraft> = {}): FieldReportDraft {
  return {
    ...EMPTY_REPORT_DRAFT,
    whatHappened: "Spill in aisle",
    locationId: "loc-1",
    locationName: "Plant A",
    whenIso: "2026-09-10T10:00",
    ...partial,
  };
}

describe("field reports", () => {
  it("parses report types", () => {
    expect(parseReportType("near_miss")).toBe("near-miss");
    expect(parseReportType("equipment-issue")).toBe("equipment");
    expect(parseReportType("security")).toBe("security");
    expect(parseReportType("nope")).toBe("hazard");
  });

  it("maps categories for incidents and near misses", () => {
    expect(resolveIncidentCategory(draft({ type: "near-miss" }))).toBe("near-misses");
    expect(resolveIncidentCategory(draft({ type: "security" }))).toBe("property-damage");
    expect(
      resolveIncidentCategory(draft({ type: "incident", injuryIllness: "yes" })),
    ).toBe("injuries");
  });

  it("validates required fields", () => {
    expect(validateReportDraft(draft({ whatHappened: "" })).ok).toBe(false);
    expect(validateReportDraft(draft({ type: "observation", observationKind: "" })).ok).toBe(
      false,
    );
    expect(
      validateReportDraft(
        draft({ type: "incident", injuryIllness: "yes", bodyAreas: [] }),
      ).ok,
    ).toBe(false);
    expect(validateReportDraft(draft({ type: "hazard", hazardLevel: "high" })).ok).toBe(true);
  });

  it("builds incident payload with OSHA handoff flag", () => {
    const payload = buildIncidentPayload(
      draft({
        type: "incident",
        injuryIllness: "yes",
        bodyAreas: ["Hand"],
        divisionName: "Ops",
        oshaRelevant: true,
      }),
      "Ada",
    );
    expect(payload.category).toBe("injuries");
    expect(payload.oshaRelevant).toBe(true);
    expect(payload.division).toBe("Ops");
    expect(payload.siteId).toBe("loc-1");
    expect(payload.bodyLocations).toEqual(["Hand"]);
  });

  it("builds observation and equipment payloads", () => {
    const obs = buildObservationPayload(
      draft({ type: "hazard", hazardLevel: "critical", observationKind: "UNSAFE" }),
      "Ada",
    );
    expect(obs.observationType).toBe("HAZARD");
    expect(obs.riskLevel).toBe("critical");

    const issue = buildEquipmentIssuePayload(
      draft({
        type: "equipment",
        hazardLevel: "high",
        outOfService: true,
        targetType: "EQUIPMENT",
        targetId: "eq-1",
      }),
      "Ada",
    );
    expect(issue.parentEntityType).toBe("EQUIPMENT");
    expect(issue.parentEntityId).toBe("eq-1");
    expect(issue.priority).toBe("HIGH");
    expect(issue.outOfService).toBe(true);
  });
});
