import { describe, expect, it, vi } from "vitest";
import { IndustrialDomainService } from "./industrial-domain.service.js";

/**
 * The Add Person template columns (migration 0043) are mapped in three places:
 * insert, update and read. These exercise the private mappers through the
 * instance so a field added to one path but not the others is caught here
 * rather than as a value that silently vanishes on save.
 */
type Mapper = {
  personnelInsertValues(body: Record<string, unknown>): Record<string, unknown>;
  personnelUpdateValues(
    body: Record<string, unknown>,
    existing: Record<string, unknown>,
  ): Record<string, unknown>;
  personnelReadValues(row: Record<string, unknown>): Record<string, unknown>;
};

function mapper(): Mapper {
  const db = { transaction: vi.fn() } as never;
  return new IndustrialDomainService(db) as unknown as Mapper;
}

describe("personnel template insert mapping", () => {
  it("keeps non-empty template values", () => {
    const values = mapper().personnelInsertValues({
      middleName: "Q",
      jobTitle: "Millwright",
      notes: "Night shift",
    });
    expect(values).toMatchObject({ middleName: "Q", jobTitle: "Millwright", notes: "Night shift" });
  });

  it("omits blank and whitespace-only values so columns stay null", () => {
    const values = mapper().personnelInsertValues({ middleName: "", suffix: "   " });
    expect(values).not.toHaveProperty("middleName");
    expect(values).not.toHaveProperty("suffix");
  });

  it("accepts the pre-0043 department alias", () => {
    expect(mapper().personnelInsertValues({ department: "Milling" })).toMatchObject({
      departmentName: "Milling",
    });
  });

  it("prefers departmentName over the alias when both are sent", () => {
    expect(
      mapper().personnelInsertValues({ departmentName: "Milling", department: "Old" }),
    ).toMatchObject({ departmentName: "Milling" });
  });

  it("omits the driver flag entirely when absent, letting the column default apply", () => {
    expect(mapper().personnelInsertValues({})).not.toHaveProperty("isCompanyDriver");
  });

  it.each([
    [true, true],
    ["true", true],
    ["on", true],
    [false, false],
    ["", false],
  ])("coerces driver flag %s to %s", (input, expected) => {
    expect(mapper().personnelInsertValues({ isCompanyDriver: input })).toMatchObject({
      isCompanyDriver: expected,
    });
  });

  it.each([
    [true, true],
    ["true", true],
    [false, false],
  ])("coerces prescription glasses flag %s to %s", (input, expected) => {
    expect(
      mapper().personnelInsertValues({ tracksPrescriptionSafetyGlasses: input }),
    ).toMatchObject({
      tracksPrescriptionSafetyGlasses: expected,
    });
  });

  it.each([
    [true, true],
    [false, false],
  ])("coerces extra pair approval flags %s to %s", (input, expected) => {
    expect(
      mapper().personnelInsertValues({ prescriptionSafetyGlassesExtraPairApproved: input }),
    ).toMatchObject({
      prescriptionSafetyGlassesExtraPairApproved: expected,
    });
  });
});

describe("personnel template update mapping", () => {
  it("leaves untouched fields at their existing value", () => {
    const values = mapper().personnelUpdateValues({}, { jobTitle: "Millwright" });
    expect(values.jobTitle).toBe("Millwright");
  });

  it("clears a column when an empty string is sent explicitly", () => {
    const values = mapper().personnelUpdateValues({ jobTitle: "" }, { jobTitle: "Millwright" });
    expect(values.jobTitle).toBeNull();
  });

  it("normalizes hire and PPE dates and clears invalid ones", () => {
    const values = mapper().personnelUpdateValues(
      {
        hireDate: "2025-06-02T12:00:00.000Z",
        prescriptionSafetyGlassesIssuedDate: "not-a-date",
        prescriptionSafetyGlassesExpiresDate: "",
      },
      {
        hireDate: new Date("2024-01-01T00:00:00.000Z"),
        prescriptionSafetyGlassesIssuedDate: "2024-01-01",
        prescriptionSafetyGlassesExpiresDate: "2025-01-01",
      },
    );
    expect(values.hireDate).toBe("2025-06-02");
    expect(values.prescriptionSafetyGlassesIssuedDate).toBeNull();
    expect(values.prescriptionSafetyGlassesExpiresDate).toBeNull();
  });

  it("overwrites when a new value is sent", () => {
    const values = mapper().personnelUpdateValues({ jobTitle: "Operator" }, { jobTitle: "Old" });
    expect(values.jobTitle).toBe("Operator");
  });

  it("preserves the existing driver flag when the key is absent", () => {
    expect(mapper().personnelUpdateValues({}, { isCompanyDriver: true }).isCompanyDriver).toBe(
      true,
    );
  });

  it("can turn the driver flag off", () => {
    expect(
      mapper().personnelUpdateValues({ isCompanyDriver: false }, { isCompanyDriver: true })
        .isCompanyDriver,
    ).toBe(false);
  });
});

describe("personnel template read mapping", () => {
  it("returns nulls rather than undefined for unset columns", () => {
    const values = mapper().personnelReadValues({});
    expect(values.jobTitle).toBeNull();
    expect(values.notes).toBeNull();
  });

  it("always returns boolean allowance flags", () => {
    expect(mapper().personnelReadValues({}).isCompanyDriver).toBe(false);
    expect(mapper().personnelReadValues({}).tracksPrescriptionSafetyGlasses).toBe(false);
    expect(mapper().personnelReadValues({ isCompanyDriver: true }).isCompanyDriver).toBe(true);
    expect(
      mapper().personnelReadValues({ tracksPrescriptionSafetyGlasses: true })
        .tracksPrescriptionSafetyGlasses,
    ).toBe(true);
  });

  it("round-trips every field an insert accepts", () => {
    const inserted = mapper().personnelInsertValues({
      middleName: "Q",
      suffix: "Jr",
      preferredName: "Tee",
      jobTitle: "Millwright",
      departmentName: "Milling",
      companyName: "Producers",
      divisionName: "Ops",
      fileBase: "PRM-1",
      userAuthId: "auth-1",
      digitalSource: "kiosk",
      phone: "555-0100",
      companyPhone: "555-0199",
      companyEmail: "ops@producersrice.com",
      allergies: "Peanuts",
      medicalHistory: "Asthma",
      emergencyContact1Name: "Pat Bogy",
      emergencyContact1Phone: "555-0101",
      emergencyContact1Relationship: "Spouse",
      emergencyContact2Name: "Sam Bogy",
      emergencyContact2Phone: "555-0102",
      emergencyContact2Relationship: "Sibling",
      supervisorName: "Sam",
      hireDate: "2026-01-05",
      notes: "Night shift",
      signatureUrl: "https://example.com/sig.png",
      isCompanyDriver: true,
      safetyFootwearClass: "CLASS_1",
      tracksPrescriptionSafetyGlasses: true,
    });
    const read = mapper().personnelReadValues(inserted);
    for (const [key, value] of Object.entries(inserted)) {
      expect(read[key], `${key} must survive the read mapping`).toEqual(value);
    }
  });
});
