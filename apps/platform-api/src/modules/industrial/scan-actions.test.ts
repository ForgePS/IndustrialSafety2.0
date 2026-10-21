import { describe, expect, it } from "vitest";
import { buildScanActions, filterScanActionsForViewer } from "./scan-actions.js";

describe("scan-actions", () => {
  it("offers no asset actions on the Emergency SMS signup code", () => {
    const actions = buildScanActions({
      targetType: "EMERGENCY_SMS_SIGNUP",
      targetId: null,
      accessMode: "PUBLIC_FORM_ONLY",
      actionConfig: { reportIssue: true, viewDocuments: true },
    });
    expect(actions).toHaveLength(0);
  });

  it("builds frequency inspections and issue actions for equipment targets", () => {
    const actions = buildScanActions({
      targetType: "EQUIPMENT",
      targetId: "550e8400-e29b-41d4-a716-446655440000",
      accessMode: "AUTHENTICATED_RECORD",
      qrLinkId: "qr-1",
    });
    expect(actions.some((a) => a.id === "report_issue")).toBe(true);
    expect(actions.some((a) => a.id === "daily_inspection")).toBe(true);
    expect(actions.some((a) => a.id === "equipment_history")).toBe(true);
    expect(actions.some((a) => a.id === "mark_out_of_service")).toBe(true);
  });

  it("limits public form mode to issue reporting", () => {
    const actions = buildScanActions({
      targetType: "VEHICLE",
      targetId: "x",
      accessMode: "PUBLIC_FORM_ONLY",
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]?.id).toBe("report_issue");
    expect(actions[0]?.requiresVerification).toBe(false);
  });

  it("exposes public LOTO view and report without verification", () => {
    const actions = buildScanActions({
      targetType: "LOTO_PROCEDURE",
      targetId: "loto-1",
      accessMode: "PUBLIC_ACTION",
      actionConfig: {
        viewLoto: true,
        reportIssue: true,
        lotoProcedureId: "loto-1",
      },
    });
    expect(actions.some((a) => a.id === "open_loto")).toBe(true);
    expect(actions.some((a) => a.id === "report_issue")).toBe(true);
    expect(actions.find((a) => a.id === "open_loto")?.requiresVerification).toBe(false);
    expect(actions.find((a) => a.id === "report_issue")?.requiresVerification).toBe(false);

    const anonymous = filterScanActionsForViewer(actions, {
      verifiedEmployee: false,
      permissions: new Set(),
    });
    expect(anonymous.map((a) => a.id).sort()).toEqual(["open_loto", "report_issue"]);
  });

  it("shows return to service when asset is out of service", () => {
    const actions = buildScanActions({
      targetType: "VEHICLE",
      targetId: "x",
      accessMode: "EMPLOYEE_NUMBER",
      assetOutOfService: true,
    });
    expect(actions.some((a) => a.id === "return_to_service")).toBe(true);
    expect(actions.some((a) => a.id === "mark_out_of_service")).toBe(false);
  });

  it("filters actions for verified field workers and permissioned users", () => {
    const actions = buildScanActions({
      targetType: "EQUIPMENT",
      targetId: "x",
      accessMode: "EMPLOYEE_NUMBER",
    });
    const field = filterScanActionsForViewer(actions, {
      verifiedEmployee: true,
      permissions: new Set(),
    });
    expect(field.some((a) => a.id === "daily_inspection")).toBe(true);

    const denied = filterScanActionsForViewer(actions, {
      verifiedEmployee: false,
      permissions: new Set(),
    });
    expect(denied).toHaveLength(0);

    const manager = filterScanActionsForViewer(actions, {
      verifiedEmployee: false,
      permissions: new Set(["industrial.qr.inspection.perform"]),
    });
    expect(manager.some((a) => a.id === "daily_inspection")).toBe(true);
  });

  it("exposes public fleet DVIR checks without verification", () => {
    const actions = buildScanActions({
      targetType: "VEHICLE",
      targetId: "550e8400-e29b-41d4-a716-446655440000",
      accessMode: "PUBLIC_ACTION",
      dotRegulated: true,
      dvirPublicToken: "public-dvir-token-abcdefghijklmnop",
    });
    expect(actions.some((a) => a.id === "dvir_pre_trip")).toBe(true);
    expect(actions.some((a) => a.id === "dvir_post_trip")).toBe(true);
    expect(actions.find((a) => a.id === "dvir_pre_trip")?.requiresVerification).toBe(false);
    expect(actions.find((a) => a.id === "dvir_pre_trip")?.href).toContain("/dvir/");
    expect(actions.find((a) => a.id === "dvir_pre_trip")?.href).toContain("tripType=PRE_TRIP");

    const anonymous = filterScanActionsForViewer(actions, {
      verifiedEmployee: false,
      permissions: new Set(),
    });
    expect(anonymous.map((a) => a.id).sort()).toEqual([
      "dvir_post_trip",
      "dvir_pre_trip",
      "report_issue",
    ]);
  });

  it("exposes DVIR pre/post trip for DOT-regulated vehicles and skips generic inspections", () => {
    const actions = buildScanActions({
      targetType: "VEHICLE",
      targetId: "550e8400-e29b-41d4-a716-446655440000",
      accessMode: "EMPLOYEE_NUMBER",
      dotRegulated: true,
    });
    expect(actions.some((a) => a.id === "dvir_pre_trip")).toBe(true);
    expect(actions.some((a) => a.id === "dvir_post_trip")).toBe(true);
    expect(actions.some((a) => a.id === "daily_inspection")).toBe(false);
    expect(actions.find((a) => a.id === "dvir_pre_trip")?.href).toContain("tripType=PRE_TRIP");
  });

  it("keeps generic inspections for non-DOT vehicles", () => {
    const actions = buildScanActions({
      targetType: "VEHICLE",
      targetId: "550e8400-e29b-41d4-a716-446655440000",
      accessMode: "EMPLOYEE_NUMBER",
      dotRegulated: false,
    });
    expect(actions.some((a) => a.id === "dvir_pre_trip")).toBe(false);
    expect(actions.some((a) => a.id === "daily_inspection")).toBe(true);
  });

  it("exposes linked LOTO, JSA, documents, and training from actionConfig", () => {
    const actions = buildScanActions({
      targetType: "EQUIPMENT",
      targetId: "550e8400-e29b-41d4-a716-446655440000",
      accessMode: "EMPLOYEE_NUMBER",
      actionConfig: {
        viewLoto: true,
        viewJsa: true,
        viewDocuments: true,
        viewTraining: true,
        viewSds: true,
        lotoProcedureId: "loto-1",
        jsaId: "jsa-1",
        documentId: "doc-1",
        trainingAssignmentId: "train-1",
        chemicalSafetyId: "chem-1",
      },
    });
    expect(actions.some((a) => a.id === "open_loto")).toBe(true);
    expect(actions.some((a) => a.id === "open_jsa")).toBe(true);
    expect(actions.some((a) => a.id === "open_document")).toBe(true);
    expect(actions.some((a) => a.id === "open_training")).toBe(true);
    expect(actions.some((a) => a.id === "open_sds")).toBe(true);
  });

  it("keeps gated actions closed for anonymous viewers (no client permission injection)", () => {
    const actions = buildScanActions({
      targetType: "EQUIPMENT",
      targetId: "x",
      accessMode: "EMPLOYEE_NUMBER",
    });
    // Public QR handlers must pass an empty set unless Bearer auth resolved permissions.
    const anonymous = filterScanActionsForViewer(actions, {
      verifiedEmployee: false,
      permissions: new Set(),
    });
    expect(anonymous).toHaveLength(0);
  });
});
