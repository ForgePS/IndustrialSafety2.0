import { describe, expect, it } from "vitest";
import {
  canIssueLockout,
  checklistFromDisplay,
  extractLockoutSnapshot,
  extractProcedureDisplay,
  fieldLotoCreatePayload,
  fieldLotoDraftFromDetail,
  fieldLotoUpdatePayload,
  filterAndSortLotoProcedures,
  isExecutableProcedureStatus,
  isOpenLockoutStatus,
  lotoProcedureAreaName,
  lotoProcedureEquipmentName,
  lotoProcedureSiteName,
  profileDisplayName,
} from "./loto";

describe("field loto helpers", () => {
  it("allows issue only for active or approved procedures", () => {
    expect(canIssueLockout("ACTIVE")).toBe(true);
    expect(canIssueLockout("APPROVED")).toBe(true);
    expect(canIssueLockout("DRAFT")).toBe(false);
    expect(isExecutableProcedureStatus("ACTIVE")).toBe(true);
    expect(isOpenLockoutStatus("ISSUED")).toBe(true);
    expect(isOpenLockoutStatus("CLOSED")).toBe(false);
  });

  it("reads site and area snapshots without confusing equipment type", () => {
    const row = {
      siteNameSnapshot: "Stuttgart",
      areaNameSnapshot: "PRM Dryer 3",
      equipmentName: "Aeration Fan 4",
      equipmentTypeNameSnapshot: "Fan",
      siteName: "Fan",
    };
    expect(lotoProcedureSiteName(row)).toBe("Stuttgart");
    expect(lotoProcedureAreaName(row)).toBe("PRM Dryer 3");
    expect(lotoProcedureEquipmentName(row)).toBe("Aeration Fan 4");
  });

  it("extracts steps from payload when child tables are empty", () => {
    const display = extractProcedureDisplay({
      id: "proc-1",
      title: "Fan LOTO",
      status: "ACTIVE",
      siteNameSnapshot: "Stuttgart",
      areaNameSnapshot: "Dryer",
      equipmentName: "Fan 1",
      energySources: [],
      isolationPoints: [],
      steps: [],
      procedure: {
        id: "proc-1",
        title: "Fan LOTO",
        status: "ACTIVE",
        siteNameSnapshot: "Stuttgart",
        areaNameSnapshot: "Dryer",
        equipmentName: "Fan 1",
        steps: [
          {
            energySourceName: "Electrical",
            energyMagnitude: "480V",
            isolationLocationText: "MCC Room",
            lockoutDeviceName: "Lock and Hasp",
            isolationAction: "Open disconnect",
            verificationMethodName: "Try start",
            printedProcedureDescription: "Open disconnect and lock.",
          },
        ],
      },
    });
    expect(display.equipmentName).toBe("Fan 1");
    expect(display.siteName).toBe("Stuttgart");
    expect(display.energySources[0]?.energyType).toBe("Electrical");
    expect(display.steps.some((s) => s.isVerification)).toBe(true);
    expect(checklistFromDisplay(display).length).toBeGreaterThan(0);
  });

  it("reads precautions and restoration checks", () => {
    const display = extractProcedureDisplay({
      id: "proc-2",
      title: "Mill",
      status: "ACTIVE",
      notes: [{ text: "Notify control room", shortName: "Notify" }],
      restorationChecks: [{ label: "Remove locks in reverse order" }],
    });
    expect(display.notes[0]?.text).toBe("Notify control room");
    expect(display.restorationChecks[0]?.label).toBe("Remove locks in reverse order");
  });

  it("snapshots issued lockout fields", () => {
    const snap = extractLockoutSnapshot({
      id: "lo-1",
      status: "ISSUED",
      procedureId: "proc-1",
      details: {
        authorizedEmployee: "Alex",
        lockTagId: "L-44",
        tryStartRequired: true,
        affectedEmployees: "Shift A",
      },
    });
    expect(snap?.authorizedEmployee).toBe("Alex");
    expect(snap?.lockTagId).toBe("L-44");
    expect(snap?.tryStartRequired).toBe(true);
    expect(snap?.affectedEmployees).toBe("Shift A");
  });

  it("builds a create payload that the API can issue from Field", () => {
    const payload = fieldLotoCreatePayload({
      equipmentName: "Aeration Fan 4",
      siteId: "site-1",
      siteName: "Stuttgart",
      divisionName: "Milling",
      departmentId: "dept-1",
      departmentName: "Dryer",
      areaName: "Dryer 3",
      steps: [
        {
          energySourceName: "Electrical",
          energyMagnitude: "480V",
          isolationLocationText: "MCC",
          lockoutDeviceName: "Lock and Hasp",
          isolationAction: "Open disconnect",
          verificationMethodName: "Try start",
        },
      ],
      restorationLabel: "Remove locks in reverse order",
    });
    expect(payload.status).toBe("DRAFT");
    expect(payload.equipmentName).toBe("Aeration Fan 4");
    expect(payload.siteId).toBe("site-1");
    expect(payload.divisionName).toBe("Milling");
    expect(payload.departmentId).toBe("dept-1");
    expect(payload.siteNameSnapshot).toBe("Stuttgart");
    expect(Array.isArray(payload.steps)).toBe(true);
    expect((payload.steps as Array<Record<string, unknown>>)[0]?.energySourceName).toBe(
      "Electrical",
    );
  });

  it("prefills the Field edit form from procedure detail", () => {
    const draft = fieldLotoDraftFromDetail({
      id: "proc-1",
      title: "Fan LOTO",
      status: "ACTIVE",
      equipmentName: "Aeration Fan 4",
      siteId: "site-1",
      siteNameSnapshot: "Stuttgart",
      divisionName: "Milling",
      departmentId: "dept-1",
      departmentNameSnapshot: "Dryer",
      areaNameSnapshot: "Dryer 3",
      revision: "2",
      restorationChecks: [{ id: "r1", label: "Clear tools", completed: false }],
      steps: [
        {
          stepNumber: 1,
          isVerification: false,
          sourcePayload: {
            energySourceName: "Electrical",
            energyMagnitude: "480V",
            isolationLocationText: "MCC Room",
            lockoutDeviceName: "Lock and Hasp",
            isolationAction: "Open disconnect",
            verificationMethodName: "Try start",
          },
        },
        {
          stepNumber: 2,
          isVerification: true,
          instruction: "Verify zero energy",
        },
      ],
    });
    expect(draft.equipmentName).toBe("Aeration Fan 4");
    expect(draft.siteId).toBe("site-1");
    expect(draft.siteName).toBe("Stuttgart");
    expect(draft.divisionName).toBe("Milling");
    expect(draft.departmentId).toBe("dept-1");
    expect(draft.departmentName).toBe("Dryer");
    expect(draft.areaName).toBe("Dryer 3");
    expect(draft.revision).toBe("2");
    expect(draft.restorationLabel).toBe("Clear tools");
    expect(draft.steps).toHaveLength(1);
    expect(draft.steps[0]?.isolationLocationText).toBe("MCC Room");
  });

  it("filters and sorts by Location and Department (division is display-only)", () => {
    const rows = [
      {
        id: "2",
        equipmentName: "B Fan",
        siteName: "Stuttgart",
        divisionName: "Milling",
        departmentName: "Dryer",
        siteId: "site-a",
        departmentId: "dept-1",
      },
      {
        id: "1",
        equipmentName: "A Fan",
        siteName: "Stuttgart",
        divisionName: "Milling",
        departmentName: "Boiler",
        siteId: "site-a",
        departmentId: "dept-2",
      },
      {
        id: "3",
        equipmentName: "C Fan",
        siteName: "Jonesboro",
        divisionName: "Packaging",
        departmentName: "Line 1",
        siteId: "site-b",
        departmentId: "dept-3",
      },
    ];
    const sorted = filterAndSortLotoProcedures(rows, {});
    expect(sorted.map((r) => r.id)).toEqual(["3", "1", "2"]);
    const filtered = filterAndSortLotoProcedures(rows, {
      locationId: "site-a",
      departmentId: "dept-1",
    });
    expect(filtered.map((r) => r.id)).toEqual(["2"]);
    const byDivisionIgnored = filterAndSortLotoProcedures(rows, {
      locationId: "site-a",
      divisionName: "Packaging",
    });
    // Division is display-only on Field LOTO — same as Industrial (site + department).
    expect(byDivisionIgnored.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("preserves industrial photo fields when Field edits a procedure", () => {
    const payload = fieldLotoUpdatePayload(
      {
        equipmentName: "Aeration Fan 4",
        siteId: "site-1",
        siteName: "Stuttgart",
        divisionName: "Milling",
        departmentId: "dept-1",
        departmentName: "Dryer",
        areaName: "Dryer 3",
        steps: [
          {
            energySourceName: "Electrical",
            energyMagnitude: "480V",
            isolationLocationText: "MCC",
            lockoutDeviceName: "Lock and Hasp",
            isolationAction: "Open disconnect",
            verificationMethodName: "Try start",
          },
        ],
      },
      {
        procedure: {
          id: "proc-1",
          source_payload: {
            equipmentImageUrl: "https://cdn.example/equip.jpg",
            printPurpose: "Control hazardous energy",
          },
        },
        steps: [
          {
            isVerification: false,
            sourcePayload: {
              stepImageUrl: "https://cdn.example/step1.jpg",
              stepImageFileName: "step1.jpg",
            },
          },
        ],
      },
    );
    expect(payload.equipmentImageUrl).toBe("https://cdn.example/equip.jpg");
    expect(payload.printPurpose).toBe("Control hazardous energy");
    expect(payload.siteId).toBe("site-1");
    expect(payload.divisionName).toBe("Milling");
    expect((payload.steps as Array<Record<string, unknown>>)[0]?.stepImageUrl).toBe(
      "https://cdn.example/step1.jpg",
    );
  });

  it("builds a profile display name", () => {
    expect(profileDisplayName({ displayName: "Alex Rivera" })).toBe("Alex Rivera");
    expect(profileDisplayName({ displayName: "", firstName: "Alex", lastName: "Rivera" })).toBe(
      "Alex Rivera",
    );
  });
});
