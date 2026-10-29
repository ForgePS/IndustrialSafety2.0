import { describe, expect, it } from "vitest";
import {
  canIssueLockout,
  emptyLotoProcedureForm,
  emptyLotoStepForm,
  extractLockoutItems,
  extractProcedureDisplay,
  lockoutAuthorizedEmployee,
  lockoutEquipmentName,
  lotoCanActivateDirect,
  lotoCanEhsReview,
  lotoCanSubmitForReview,
  lotoEnergyLetterStyle,
  lotoListHref,
  lotoLockoutHref,
  lotoProcedureAreaName,
  lotoProcedureDescription,
  lotoProcedureEquipmentName,
  lotoProcedureFormFromDetail,
  lotoProcedureHref,
  lotoProcedurePayloadFromForm,
  lotoProcedureDivisionName,
  lotoProcedureSiteName,
  lotoStats,
  lotoStatusBadgeClass,
  lotoStatusLabel,
  parseLotoEnergyLetter,
} from "./loto";

describe("loto workspace helpers", () => {
  it("maps procedure and lockout statuses onto Sneat badge tones", () => {
    expect(lotoStatusBadgeClass("ACTIVE")).toBe("bg-label-success");
    expect(lotoStatusBadgeClass("IN_REVIEW")).toBe("bg-label-warning");
    expect(lotoStatusBadgeClass("NEEDS_CORRECTION")).toBe("bg-label-danger");
    expect(lotoStatusBadgeClass("ISSUED")).toBe("bg-label-info");
    expect(lotoStatusLabel("PENDING_APPROVAL")).toBe("In review");
    expect(lotoStatusLabel("NEEDS_CORRECTION")).toBe("Needs correction");
    expect(lotoStatusLabel("APPROVED")).toBe("Active");
  });

  it("only issues lockouts from approved or active procedures", () => {
    expect(canIssueLockout("DRAFT")).toBe(false);
    expect(canIssueLockout("APPROVED")).toBe(true);
    expect(canIssueLockout("ACTIVE")).toBe(true);
  });

  it("gates submit, direct activate, and EHS review by status", () => {
    expect(lotoCanSubmitForReview("DRAFT")).toBe(true);
    expect(lotoCanSubmitForReview("NEEDS_CORRECTION")).toBe(true);
    expect(lotoCanSubmitForReview("IN_REVIEW")).toBe(false);
    expect(lotoCanActivateDirect("DRAFT")).toBe(true);
    expect(lotoCanActivateDirect("NEEDS_CORRECTION")).toBe(true);
    expect(lotoCanActivateDirect("IN_REVIEW")).toBe(false);
    expect(lotoCanEhsReview("IN_REVIEW")).toBe(true);
    expect(lotoCanEhsReview("PENDING_APPROVAL")).toBe(true);
    expect(lotoCanEhsReview("DRAFT")).toBe(false);
  });

  it("maps description codes and energy names to letter colors", () => {
    expect(parseLotoEnergyLetter("E-4 480V")).toBe("E");
    expect(parseLotoEnergyLetter("CG-1")).toBe("CG");
    expect(parseLotoEnergyLetter("P-2")).toBe("P");
    expect(parseLotoEnergyLetter("", "Hydraulic")).toBe("H");
    expect(parseLotoEnergyLetter("", "Controlled Gravity")).toBe("CG");
    expect(lotoEnergyLetterStyle("E-1")?.bg).toBe("#dc2626");
    expect(lotoEnergyLetterStyle("W-1")?.bg).toBe("#16a34a");
    expect(lotoEnergyLetterStyle("M-3")?.bg).toBe("#7c3aed");
    expect(lotoEnergyLetterStyle("CG-1")?.bg).toBe("#800000");
    expect(lotoEnergyLetterStyle("G-1")?.bg).toBe("#eab308");
    expect(lotoEnergyLetterStyle("H-1")?.bg).toBe("#92400e");
    expect(lotoEnergyLetterStyle("T-1")?.bg).toBe("#111827");
    expect(lotoEnergyLetterStyle("C-2")?.bg).toBe("#ea580c");
    expect(lotoEnergyLetterStyle("P-1")?.bg).toBe("#2563eb");
  });

  it("counts drafts, reviews, and open lockouts", () => {
    expect(
      lotoStats(
        [
          { status: "DRAFT" },
          { status: "NEEDS_CORRECTION" },
          { status: "IN_REVIEW" },
          { status: "ACTIVE" },
        ],
        [{ status: "ISSUED" }, { status: "CLOSED" }, { status: "COMPLIANT" }],
      ),
    ).toEqual({
      procedures: 4,
      drafts: 2,
      active: 1,
      reviews: 1,
      openLockouts: 2,
    });
  });

  it("builds procedure and lockout detail hrefs for the static export", () => {
    expect(lotoProcedureHref("abc-123")).toBe("/modules/lockout-tagout/procedure/?id=abc-123");
    expect(lotoLockoutHref("lock-9")).toBe("/modules/lockout-tagout/lockout/?id=lock-9");
    expect(lotoListHref()).toBe("/modules/lockout-tagout/");
  });

  it("extracts energy, isolation, and steps from imported lockout details", () => {
    const items = extractLockoutItems({
      details: {
        energySources: "Electrical, Mechanical",
        primaryEnergyType: "Electrical",
        energyControlPoints: "Primary isolation | Local panel / MCC | Disconnect | Yes",
        isolationSteps: "1. Locate Disconnect\n2. Apply lock and tag",
        verificationMethod: "Try Start",
        startupSteps: "1. Remove locks\n2. Restore energy",
        equipmentName: "Destoner",
      },
      workerName: "Alex",
    });
    expect(items.energySources.map((e) => e.energyType)).toEqual(["Electrical", "Mechanical"]);
    expect(items.isolationPoints[0]?.label).toBe("Primary isolation");
    expect(items.steps.some((s) => s.stepPhase === "ISOLATION")).toBe(true);
    expect(items.steps.some((s) => s.isVerification)).toBe(true);
    expect(lockoutEquipmentName({ details: { equipmentName: "Destoner" } })).toBe("Destoner");
    expect(lockoutAuthorizedEmployee({ workerName: "Alex" })).toBe("Alex");
  });

  it("uses plain scope for QR description and ignores notes object arrays", () => {
    expect(
      lotoProcedureDescription({
        equipmentName: "Baghouse 4",
        scope: "Isolate baghouse fan and rotary valve",
        notes: [
          { id: "n1", text: "Wear PPE" },
          { id: "n2", text: "Verify zero energy" },
        ],
      }),
    ).toBe("Isolate baghouse fan and rotary valve");
    expect(
      lotoProcedureDescription({
        equipmentName: "Baghouse 4",
        title: "Baghouse 4 LOTO",
        notes: [
          { id: "n1", text: "Wear PPE" },
          { id: "n2", text: "Verify zero energy" },
        ],
      }),
    ).toBe("Baghouse 4 LOTO");
    expect(
      lotoProcedureDescription({
        equipmentName: "Baghouse 4",
        title: "Baghouse 4",
        notes: [{ id: "n1", text: "Wear PPE" }],
      }),
    ).toBe("");
    expect(lotoProcedureDescription({ notes: "Keep clear of rotating parts" })).toBe(
      "Keep clear of rotating parts",
    );
    expect(
      lotoProcedureDescription({
        scope: "[object Object],[object Object],[object Object]",
        title: "Baghouse 4 LOTO",
        equipmentName: "Baghouse 4",
      }),
    ).toBe("Baghouse 4 LOTO");
    expect(
      lotoProcedureDescription({
        description: [{ id: "1" }, { id: "2" }] as unknown as string,
        equipmentName: "Baghouse 4",
        title: "Baghouse 4",
      }),
    ).toBe("");
  });

  it("reads Firebase snapshot aliases for site, area, and equipment", () => {
    const row = {
      siteNameSnapshot: "Stuttgart",
      areaNameSnapshot: "PRM Dryer 3",
      equipmentName: "Aeration Fan 4 (600)",
      equipmentTypeNameSnapshot: "Fan",
    };
    expect(lotoProcedureSiteName(row)).toBe("Stuttgart");
    expect(lotoProcedureAreaName(row)).toBe("PRM Dryer 3");
    expect(lotoProcedureEquipmentName(row)).toBe("Aeration Fan 4 (600)");
  });

  it("does not treat equipment type as site or area", () => {
    expect(
      lotoProcedureSiteName({
        siteName: "Fan",
        equipmentTypeNameSnapshot: "Fan",
        siteNameSnapshot: "Stuttgart",
      }),
    ).toBe("Stuttgart");
    expect(
      lotoProcedureAreaName({
        areaName: "Conveyor",
        equipmentTypeName: "Conveyor",
        areaNameSnapshot: "Fair Oaks",
      }),
    ).toBe("Fair Oaks");
  });

  it("derives procedure display fields from Firebase-style payload steps", () => {
    const display = extractProcedureDisplay({
      procedure: {
        title: "Aeration Fan 4 (600)",
        procedureNumber: "LOTO-XXX-2026-1042",
        revision: 1,
        status: "ACTIVE",
        siteNameSnapshot: "Stuttgart",
        areaNameSnapshot: "PRM Dryer 3",
        departmentId: "dept-1",
        departmentName: "Milling",
        equipmentName: "Aeration Fan 4 (600)",
        equipmentTypeNameSnapshot: "Fan",
        equipmentExternalId: "EQ-2965216",
        scope: "Imported from PDF",
        notes: [{ id: "n1", shortName: "Caution", text: "Verify guards" }],
        tags: ["fan", "dryer"],
        attachments: [{ id: "a1", filename: "source.pdf", url: "https://example.com/a.pdf" }],
        restorationChecks: [{ label: "Guards replaced", completed: false }],
        steps: [
          {
            energySourceName: "Electrical",
            energyMagnitude: "480V",
            isolationLocationText: "700 Building Electrical Room",
            lockoutDeviceName: "Lock and Hasp",
            isolationAction: "Move disconnect to off",
            verificationMethodName: "Attempt restart",
            printedProcedureDescription: "Move disconnect to off and lock out.",
          },
        ],
      },
      energySources: [],
      isolationPoints: [],
      steps: [],
    });
    expect(display.siteName).toBe("Stuttgart");
    expect(display.departmentName).toBe("Milling");
    expect(display.areaName).toBe("PRM Dryer 3");
    expect(display.equipmentTypeName).toBe("Fan");
    expect(display.equipmentExternalId).toBe("EQ-2965216");
    expect(display.energySources[0]?.energyType).toBe("Electrical");
    expect(display.isolationPoints[0]?.label).toBe("Lock and Hasp");
    expect(display.isolationPoints[0]?.isolationMethod).toBe("Move disconnect to off");
    expect(display.steps.some((s) => s.isVerification)).toBe(true);
    expect(display.notes[0]?.text).toBe("Verify guards");
    expect(display.attachments[0]?.filename).toBe("source.pdf");
    expect(display.restorationChecks[0]?.label).toBe("Guards replaced");
    expect(display.tags).toEqual(["fan", "dryer"]);
    expect(display.equipmentImageUrl).toBe("");
  });

  it("keeps equipment and step photos on procedure display after save", () => {
    const display = extractProcedureDisplay({
      procedure: {
        title: "Press LOTO",
        equipmentName: "Press 1",
        equipmentImageUrl: "data:image/jpeg;base64,abc",
        equipmentImageCaption: "Press overview",
        equipmentImages: [
          { imageUrl: "data:image/jpeg;base64,abc", caption: "Press overview" },
          { imageUrl: "data:image/jpeg;base64,def", caption: "Side view" },
        ],
      },
      steps: [
        {
          id: "s1",
          stepNumber: 1,
          stepPhase: "ISOLATION",
          instruction: "Open disconnect",
          isVerification: false,
          stepImages: [
            { imageUrl: "data:image/jpeg;base64,step" },
            { imageUrl: "data:image/jpeg;base64,step2" },
          ],
          sourcePayload: {
            stepImageUrl: "data:image/jpeg;base64,step",
          },
        },
      ],
      energySources: [],
      isolationPoints: [],
    });
    expect(display.equipmentImageUrl).toBe("data:image/jpeg;base64,abc");
    expect(display.equipmentImageCaption).toBe("Press overview");
    expect(display.equipmentImages).toHaveLength(2);
    expect(display.steps[0]?.stepImageUrl).toBe("data:image/jpeg;base64,step");
    expect(display.steps[0]?.stepImages).toHaveLength(2);
  });

  it("merges step photos from procedure payload when child rows omit them", () => {
    const display = extractProcedureDisplay({
      procedure: {
        title: "Fan LOTO",
        equipmentName: "Fan 1",
        equipmentImageUrl: "data:image/jpeg;base64,equip",
        sourcePayload: {
          steps: [
            {
              stepNumber: 1,
              stepImageUrl: "data:image/jpeg;base64,from-payload",
              stepImages: [{ imageUrl: "data:image/jpeg;base64,from-payload" }],
            },
          ],
        },
      },
      energySources: [{ id: "e1", energyType: "Electrical" }],
      isolationPoints: [{ id: "i1", label: "Disconnect" }],
      steps: [
        {
          id: "child-1",
          stepNumber: 1,
          stepPhase: "ISOLATION",
          instruction: "Open disconnect",
          isVerification: false,
          sourcePayload: { energySourceName: "Electrical" },
        },
      ],
    });
    expect(display.equipmentImageUrl).toBe("data:image/jpeg;base64,equip");
    expect(display.steps[0]?.stepImageUrl).toBe("data:image/jpeg;base64,from-payload");
    expect(display.steps[0]?.stepImages).toHaveLength(1);
  });

  it("round-trips multiple photos through form load and payload", () => {
    const form = lotoProcedureFormFromDetail({
      procedure: {
        title: "Fan LOTO",
        equipmentName: "Fan 1",
        equipmentImages: [
          { imageUrl: "data:image/jpeg;base64,e1", fileName: "e1.jpg" },
          { imageUrl: "data:image/jpeg;base64,e2", fileName: "e2.jpg" },
        ],
      },
      steps: [
        {
          id: "s1",
          stepNumber: 1,
          instruction: "Isolate",
          sourcePayload: {
            stepImages: [
              { imageUrl: "data:image/jpeg;base64,s1", fileName: "s1.jpg" },
              { imageUrl: "data:image/jpeg;base64,s2", fileName: "s2.jpg" },
              { imageUrl: "data:image/jpeg;base64,s3", fileName: "s3.jpg" },
            ],
          },
        },
      ],
      energySources: [],
      isolationPoints: [],
    });
    expect(form.equipmentImages).toHaveLength(2);
    expect(form.equipmentImageUrl).toBe("data:image/jpeg;base64,e1");
    expect(form.steps[0]?.stepImages).toHaveLength(3);
    expect(form.steps[0]?.stepImageUrl).toBe("data:image/jpeg;base64,s1");

    const payload = lotoProcedurePayloadFromForm(form);
    expect(payload.equipmentImages).toHaveLength(2);
    expect(payload.equipmentImageUrl).toBe("data:image/jpeg;base64,e1");
    const step = (payload.steps as Array<Record<string, unknown>>)[0]!;
    expect(step.stepImages).toHaveLength(3);
    expect(step.stepImageUrl).toBe("data:image/jpeg;base64,s1");
  });

  it("hides corrupted scope object strings on procedure display", () => {
    const display = extractProcedureDisplay({
      procedure: {
        title: "Baghouse 4",
        equipmentName: "Baghouse 4",
        revision: "1",
        scope: "[object Object],[object Object],[object Object]",
        description: [{ id: "a" }, { id: "b" }],
      },
      energySources: [],
      isolationPoints: [],
      steps: [],
    });
    expect(display.scope).toBe("");
  });

  it("reads division from procedure payload snapshots", () => {
    expect(
      lotoProcedureDivisionName({
        divisionNameSnapshot: "Production",
        source_payload: { divisionName: "Ignored when snapshot present" },
      }),
    ).toBe("Production");
    expect(
      lotoProcedureDivisionName({
        source_payload: { divisionName: "Milling Ops" },
      }),
    ).toBe("Milling Ops");
  });

  it("builds create payload from the screenshot-aligned form fields", () => {
    const payload = lotoProcedurePayloadFromForm({
      ...emptyLotoProcedureForm(),
      equipmentName: "Aeration Fan 4 (600)",
      equipmentExternalId: "EQ-2965216",
      equipmentTypeName: "Fan",
      siteId: "site-1",
      siteName: "Stuttgart",
      departmentId: "dept-1",
      departmentName: "Milling",
      divisionName: "Production",
      areaName: "PRM Dryer 3",
      precautions: [
        {
          id: "machine-general",
          shortName: "Machine / general",
          text: "Machine / general - Ensure all energy sources are identified.",
          category: "General",
        },
      ],
      steps: [
        {
          ...emptyLotoStepForm(),
          isolationLocationText: "700 Building Electrical Room",
          lockoutDeviceName: "Lock and Hasp",
          descriptionCode: "E-4 480V",
          isolationAction: "Move disconnect to off position and lock out",
          customDescription: "E-4",
          printedProcedureDescription: "Move disconnect to off and lock out.",
          verificationMethodName: "Attempt restart",
        },
      ],
    });
    expect(payload.equipmentExternalId).toBe("EQ-2965216");
    expect(payload.equipmentTypeName).toBe("Fan");
    expect(payload.departmentId).toBe("dept-1");
    expect(payload.departmentName).toBe("Milling");
    expect(payload.departmentNameSnapshot).toBe("Milling");
    expect(payload.divisionName).toBe("Production");
    expect(payload.divisionNameSnapshot).toBe("Production");
    expect(payload.areaNameSnapshot).toBe("PRM Dryer 3");
    expect(payload.leftFooter).toBe("Stuttgart");
    expect(payload.centerFooter).toBe("PRM Dryer 3");
    expect(Array.isArray(payload.notes) && payload.notes).toHaveLength(1);
    const step = (payload.steps as Array<Record<string, unknown>>)[0]!;
    expect(step.printedProcedureDescription).toBe("Move disconnect to off and lock out.");
    expect(step.descriptionCode).toBe("E-4 480V");
    expect(step.lockoutDeviceName).toBe("Lock and Hasp");
    expect(payload.printPurpose).toBeTruthy();
    expect(payload.printScopeStatement).toBeTruthy();
    expect(payload.printEnforcement).toBeTruthy();
    expect(
      Array.isArray(payload.shutdownSequence) && payload.shutdownSequence.length,
    ).toBeGreaterThan(0);
    expect(
      Array.isArray(payload.restoreSequence) && payload.restoreSequence.length,
    ).toBeGreaterThan(0);
  });
});
