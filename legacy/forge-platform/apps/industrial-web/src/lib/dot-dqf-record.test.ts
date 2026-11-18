import { describe, expect, it } from "vitest";
import { deriveDotDqfTitle, deriveDqfDueDate, formatDqfDisplayDate } from "./dot-dqf-fields";
import { dotDqfDetailsFromRecord, dotDqfPatchFromDetails } from "./dot-dqf-record";
import { dotRecordTitle } from "./dot-compliance-module";

describe("dot-dqf-record", () => {
  it("flattens legacy DOT driver fields into worksheet details", () => {
    const details = dotDqfDetailsFromRecord({
      licenseNumber: "123456789",
      licenseExpiryDate: "2028-01-15",
      medicalCardExpiry: "2027-06-01",
      lastMvrDate: "2026-03-01",
      nextMvrDueDate: "2027-03-01",
      employeeNumber: "19628",
      locationText: "Greenville",
      details: {
        workerClassification: "Full Time",
        driverLicenseClass: "CDL Driver",
      },
    });
    expect(details.cdlNumber).toBe("123456789");
    expect(details.cdlExpiry).toBe("2028-01-15");
    expect(details.medicalCertExpiry).toBe("2027-06-01");
    expect(details.mvrCompleted).toBe("2026-03-01");
    expect(details.mvrAnnual).toBe("2027-03-01");
    expect(details.employeeNumber).toBe("19628");
    expect(details.locationDepartment).toBe("Greenville");
    expect(details.workerClassification).toBe("Full Time");
  });

  it("builds a PATCH payload from worksheet details", () => {
    const patch = dotDqfPatchFromDetails(
      {
        cdlNumber: "123",
        cdlExpiry: "2028-01-01",
        medicalCertExpiry: "2027-01-01",
        locationDepartment: "Dewitt",
      },
      { title: "JOHN DOE" },
    );
    expect(patch.licenseNumber).toBe("123");
    expect(patch.category).toBe("drivers");
    expect(patch.dqf).toBe(true);
    expect(patch.locationText).toBe("Dewitt");
  });

  it("auto-generates title from DQF profile fields when the record title is blank", () => {
    const patch = dotDqfPatchFromDetails(
      {
        employeeNumber: "19628",
        locationDepartment: "Dewitt",
        cdlNumber: "927248616",
      },
      { id: "019f0000-0000-7000-8000-000000000001", title: "" },
    );
    expect(patch.title).toBe("19628 · DEWITT");
    expect(patch.employeeNumber).toBe("19628");
  });

  it("keeps an existing title when one is already set", () => {
    const patch = dotDqfPatchFromDetails(
      { employeeNumber: "19628", locationDepartment: "Dewitt" },
      { title: "BILLY BAKER, JR.", driverName: "Billy Baker, Jr." },
    );
    expect(patch.title).toBeUndefined();
    expect(patch.driverName).toBe("Billy Baker, Jr.");
  });
});

describe("dot-dqf-fields", () => {
  it("derives a display title from driver name", () => {
    expect(deriveDotDqfTitle({ driverName: "Billy Baker, Jr." })).toBe("BILLY BAKER, JR.");
  });

  it("derives a display title from employee number and location", () => {
    expect(deriveDotDqfTitle({ employeeNumber: "19628", locationDepartment: "Dewitt" })).toBe(
      "19628 · DEWITT",
    );
  });
});

describe("dot-compliance-module", () => {
  it("uses derived DQF title in lists when the stored title is missing", () => {
    expect(
      dotRecordTitle({
        id: "019f0000-0000-7000-8000-000000000001",
        category: "drivers",
        dqf: true,
        driverName: "Rogers Clark",
      }),
    ).toBe("ROGERS CLARK");
  });
});

describe("dot-dqf-fields dates", () => {
  it("derives the earliest due date", () => {
    expect(
      deriveDqfDueDate({
        cdlExpiry: "2028-03-01",
        medicalCertExpiry: "2027-12-01",
        mvrAnnual: "2027-11-15",
      }),
    ).toBe("2027-11-15");
  });

  it("formats ISO dates for display", () => {
    expect(formatDqfDisplayDate("2027-11-15")).toBe("11/15/2027");
  });
});
