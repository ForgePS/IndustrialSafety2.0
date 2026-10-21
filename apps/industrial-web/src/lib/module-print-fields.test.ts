import { describe, expect, it } from "vitest";
import {
  emergencyRecordPrintFieldValues,
  equipmentPrintFieldValues,
  inspectionPrintFieldValues,
  lotoProcedureOwnDescriptions,
  lotoProcedurePrintFieldValues,
  oshaCasePrintFieldValues,
  personnelPrintFieldValues,
  trainingPortalPrintFieldValues,
} from "./module-print-fields";

describe("module-print-fields", () => {
  it("maps equipment label fields", () => {
    expect(
      equipmentPrintFieldValues({
        id: "eq-1",
        equipmentName: "Press Brake",
        assetTag: "PB-09",
        locationDetail: "Bay 2",
        manufacturer: "Acme",
      }),
    ).toEqual({
      title: "Press Brake",
      name: "Press Brake",
      id: "PB-09",
      assetTag: "PB-09",
      area: "Bay 2",
      manufacturer: "Acme",
    });
  });

  it("maps inspection fields and closeout QR", () => {
    const fields = inspectionPrintFieldValues(
      { id: "i1", title: "Weekly aisle", status: "COMPLETED", departmentName: "Ops" },
      { closeoutUrl: "/public/closeout/abc", appBaseUrl: "https://app.example.com" },
    );
    expect(fields.title).toBe("Weekly aisle");
    expect(fields.department).toBe("Ops");
    expect(fields.qrPayload).toBe("https://app.example.com/public/closeout/abc");
  });

  it("maps training portal QR", () => {
    const fields = trainingPortalPrintFieldValues({
      url: "https://app.example.com/training-portal",
    });
    expect(fields.qr).toContain("training-portal");
    expect(fields.title).toBe("Training Portal");
  });

  it("maps personnel badge fields", () => {
    const fields = personnelPrintFieldValues(
      { id: "p1", firstName: "Ada", lastName: "Lovelace", employeeNumber: "E-1" },
      { appBaseUrl: "https://app.example.com" },
    );
    expect(fields.name).toBe("Ada Lovelace");
    expect(fields.employeeNumber).toBe("E-1");
    expect(fields.qrPayload).toContain("personnel/person");
  });

  it("maps LOTO procedure title fields and optional own description", () => {
    const fields = lotoProcedurePrintFieldValues(
      {
        id: "loto-1",
        equipmentName: "Mixer A",
        status: "ACTIVE",
        steps: [
          { customDescription: "Main disconnect at panel E-4" },
          { customDescription: "Main disconnect at panel E-4" },
          { customDescription: "Air supply valve at hopper" },
        ],
      },
      "Mixer A",
    );
    expect(fields).toEqual({
      title: "Mixer A",
      name: "Mixer A",
      status: "ACTIVE",
      id: "loto-1",
      description: "Main disconnect at panel E-4 · Air supply valve at hopper",
    });
    expect(fields.qrPayload).toBeUndefined();
  });

  it("reads LOTO own description from sourcePayload steps", () => {
    const fields = lotoProcedurePrintFieldValues({
      id: "loto-2",
      title: "Fan LOTO",
      sourcePayload: {
        steps: [{ customDescription: "Lock rotary valve" }],
      },
    });
    expect(fields.description).toBe("Lock rotary valve");
  });

  it("always offers description checkbox key even when empty", () => {
    const fields = lotoProcedurePrintFieldValues({
      id: "loto-empty",
      title: "Empty LOTO",
      status: "DRAFT",
    });
    expect(fields).toHaveProperty("description", "");
  });

  it("reads own description from nested JSON-string sourcePayload and Detail: text", () => {
    expect(
      lotoProcedureOwnDescriptions({
        steps: [
          {
            sourcePayload: JSON.stringify({
              customDescription: "Panel disconnect west wall",
            }),
          },
        ],
      }),
    ).toBe("Panel disconnect west wall");
    expect(
      lotoProcedureOwnDescriptions({
        steps: [
          {
            instruction: "Isolate electrical — Detail: Breaker 42 locked — Verify",
          },
        ],
      }),
    ).toBe("Breaker 42 locked");
  });

  it("maps OSHA and emergency labels", () => {
    expect(oshaCasePrintFieldValues({ caseNumber: "2026-014", year: 2026 }).title).toBe(
      "OSHA 2026-014",
    );
    expect(
      emergencyRecordPrintFieldValues({ title: "Fire drill", status: "ACTIVE" }).status,
    ).toBe("ACTIVE");
  });
});
