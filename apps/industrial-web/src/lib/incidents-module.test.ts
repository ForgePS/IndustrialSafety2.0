import { describe, expect, it } from "vitest";
import {
  buildIncidentCreatePayload,
  createDefaultLifecycle,
  createDefaultEvaluationChecklist,
  ensureRootCauseAnalysis,
  incidentSummaryTiles,
  incidentTabLabel,
  parseIncidentTab,
  parseIncidentWorkspaceTab,
  incidentReportHref,
  toIncidentRecord,
  toIncidentSummary,
} from "./incidents-module";

describe("incidents module helpers", () => {
  it("maps summary tiles and tabs including process tabs", () => {
    const summary = toIncidentSummary({
      injuries: 2,
      nearMisses: 5,
      medicalRefusals: 1,
      propertyDamage: 0,
      automotive: 3,
      open: 4,
      inWorkflow: 1,
      evaluations: 0,
      rcas: 0,
      total: 11,
    });
    const tiles = incidentSummaryTiles(summary);
    expect(tiles).toHaveLength(9);
    expect(tiles[0]).toMatchObject({
      label: "Injuries",
      value: 2,
      tab: "injuries",
      tone: "danger",
      icon: "bx-first-aid",
    });
    expect(tiles.find((t) => t.id === "open")?.tone).toBe("danger");
    expect(tiles.every((t) => t.icon.startsWith("bx-"))).toBe(true);
    expect(tiles.find((t) => t.id === "in-workflow")?.tab).toBe("incident-workflow");
    expect(tiles.find((t) => t.id === "evaluations")?.tab).toBe("evaluation-checklist");
    expect(tiles.find((t) => t.id === "rcas")?.tab).toBe("root-cause-analysis");
    expect(parseIncidentTab("near-misses")).toBe("near-misses");
    expect(parseIncidentWorkspaceTab("root-cause-analysis")).toBe("root-cause-analysis");
    expect(incidentTabLabel("medical-refusals")).toBe("Medical Refusals");
    expect(incidentTabLabel("incident-workflow")).toBe("Incident Workflow");
    expect(incidentReportHref({ id: "abc-123", category: "injuries" })).toBe(
      "/modules/incidents/?tab=injuries&incident=abc-123",
    );
    expect(incidentReportHref({ id: "abc-123", category: "near-misses" })).toBe(
      "/modules/incidents/?tab=near-misses&incident=abc-123",
    );
    expect(incidentReportHref({ id: "abc-123" })).toBe(
      "/modules/incidents/?tab=injuries&incident=abc-123",
    );
  });

  it("normalizes list rows and create payloads", () => {
    const record = toIncidentRecord({
      id: "i1",
      title: "Forklift near miss",
      status: "open",
      category: "near-misses",
      severity: "moderate",
      lifecycle: createDefaultLifecycle("Alex"),
      evaluationChecklist: createDefaultEvaluationChecklist(),
    });
    expect(record?.title).toBe("Forklift near miss");
    expect(record?.lifecycle?.steps).toHaveLength(7);
    expect(record?.evaluationChecklist?.items).toHaveLength(12);
    expect(ensureRootCauseAnalysis(record!).fiveWhys).toHaveLength(5);
    expect(
      buildIncidentCreatePayload(
        {
          title: "  Slip  ",
          severity: "minor",
          location: "Dock",
          description: "",
          reportedBy: "",
          dateOccurred: "",
          status: "open",
        },
        "injuries",
      ),
    ).toEqual({
      title: "Slip",
      category: "injuries",
      status: "open",
      severity: "minor",
      location: "Dock",
      description: "",
      reportedBy: "",
      dateOccurred: "",
      bodyLocations: [],
    });
  });
});
