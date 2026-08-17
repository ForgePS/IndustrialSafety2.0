import { describe, expect, it } from "vitest";
import {
  companyVehicleDriverStatusLabel,
  driverNameParts,
  fileCountLabel,
  licenseCopyLabel,
  licenseExpiryState,
  matchesCompanyDriverQuery,
  mvrReleaseLabel,
  sampleLabel,
  sortCompanyVehicleDrivers,
  toCompanyVehicleDriver,
  toCompanyVehicleDriverSummary,
  toCompanyVehicleDrivers,
} from "./company-vehicle-drivers";

describe("company vehicle drivers helpers", () => {
  it("maps API rows and summary counts", () => {
    const drivers = toCompanyVehicleDrivers([
      {
        id: "d1",
        personnelName: "Ada Byron",
        employeeNumber: "EMP-1",
        status: "on_insurance",
        licenseExpiryDate: "",
      },
      { id: "d2", personnelName: "Tim", status: "pending_mvr" },
      { bad: true },
    ]);
    expect(drivers).toHaveLength(2);
    expect(toCompanyVehicleDriver({ id: "x" })?.personnelId).toBeNull();
    expect(
      toCompanyVehicleDriverSummary({
        total: 201,
        onInsurance: 194,
        pendingMvr: 7,
        missingLicenseExpiry: 199,
      }),
    ).toEqual({
      total: 201,
      onInsurance: 194,
      pendingMvr: 7,
      suspended: 0,
      removed: 0,
      missingLicenseExpiry: 199,
      licenseExpired: 0,
      licenseExpiringSoon: 0,
      mvrOnFile: 0,
      mvrReleaseOnFile: 0,
      sampleYear: null,
      sampleSelected: 0,
      sampleCompleted: 0,
    });
  });

  it("carries the license, MVR and sample detail columns", () => {
    const driver = toCompanyVehicleDriver({
      id: "d1",
      personnelName: "Ada Byron",
      dateOfBirth: "1980-04-02",
      licenseNumber: "3733D77",
      licenseState: "AR",
      hasLicenseFront: true,
      hasLicenseBack: false,
      status: "on_insurance",
      initialMvrDate: "2026-08-10",
      mvrReleaseDate: "2026-01-04",
      mvrReleaseUploadCount: 1,
      mvrUploadCount: 3,
      lastMvrUploadAt: "2026-08-10T12:00:00.000Z",
      sampleYear: 2026,
      sampleCompletedAt: "2026-03-15T00:00:00.000Z",
    })!;
    expect(driver.dateOfBirth).toBe("1980-04-02");
    expect(driver.mvrUploadCount).toBe(3);
    expect(licenseCopyLabel(driver)).toBe("Front only");
    expect(mvrReleaseLabel(driver)).toBe("2026-01-04");
    expect(fileCountLabel(driver.mvrUploadCount)).toBe("3 files");
    expect(fileCountLabel(0)).toBe("");
    expect(sampleLabel(driver, 2026)).toBe("Done 2026-03-15");
    expect(sampleLabel(driver, 2025)).toBe("");
  });

  it("marks a sampled driver still awaiting the MVR pull", () => {
    const driver = toCompanyVehicleDriver({
      id: "d2",
      status: "pending_mvr",
      sampleYear: 2026,
      mvrReleaseUploadCount: 2,
    })!;
    expect(sampleLabel(driver, 2026)).toBe("Selected 2026");
    expect(mvrReleaseLabel(driver)).toBe("2 files");
    expect(licenseCopyLabel(driver)).toBe("");
  });

  it("flags expired and expiring licenses, ignoring removed drivers", () => {
    const at = (licenseExpiryDate: string, status = "on_insurance") =>
      toCompanyVehicleDriver({ id: "d", status, licenseExpiryDate })!;
    expect(licenseExpiryState(at("2026-01-01"), "2026-08-16")).toBe("expired");
    expect(licenseExpiryState(at("2026-09-01"), "2026-08-16")).toBe("expiring");
    expect(licenseExpiryState(at("2027-09-01"), "2026-08-16")).toBe("ok");
    expect(licenseExpiryState(at(""), "2026-08-16")).toBe("none");
    expect(licenseExpiryState(at("2026-01-01", "removed"), "2026-08-16")).toBe("none");
  });

  it("labels statuses the way the legacy panel did", () => {
    expect(companyVehicleDriverStatusLabel("on_insurance")).toBe("On insurance");
    expect(companyVehicleDriverStatusLabel("pending_mvr")).toBe("Pending MVR");
  });

  it("filters by name or employee number", () => {
    const driver = toCompanyVehicleDriver({
      id: "d1",
      personnelName: "HASAN R WALKER",
      employeeNumber: "EMP-21930",
      status: "on_insurance",
    })!;
    expect(matchesCompanyDriverQuery(driver, "walker")).toBe(true);
    expect(matchesCompanyDriverQuery(driver, "21930")).toBe(true);
    expect(matchesCompanyDriverQuery(driver, "zzz")).toBe(false);
  });

  it("splits display names for first/last sorts", () => {
    expect(driverNameParts("AARON L. CHRISTIAN")).toEqual({
      first: "AARON",
      last: "CHRISTIAN",
    });
    expect(driverNameParts("TIM")).toEqual({ first: "TIM", last: "TIM" });
  });

  it("sorts alphabetically by first or last name", () => {
    const roster = [
      toCompanyVehicleDriver({ id: "1", personnelName: "Zoe Adams", status: "on_insurance" })!,
      toCompanyVehicleDriver({ id: "2", personnelName: "Aaron Christian", status: "pending_mvr" })!,
      toCompanyVehicleDriver({ id: "3", personnelName: "Mia Brown", status: "on_insurance" })!,
    ];
    expect(sortCompanyVehicleDrivers(roster, "firstName").map((d) => d.id)).toEqual([
      "2",
      "3",
      "1",
    ]);
    expect(sortCompanyVehicleDrivers(roster, "lastName").map((d) => d.id)).toEqual([
      "1",
      "3",
      "2",
    ]);
  });

  it("pins expired licenses, pending MVR, and on-insurance drivers to the top", () => {
    const today = "2026-08-16";
    const roster = [
      toCompanyVehicleDriver({
        id: "ok",
        personnelName: "Zoe Adams",
        status: "on_insurance",
        licenseExpiryDate: "2027-01-01",
      })!,
      toCompanyVehicleDriver({
        id: "expired",
        personnelName: "Aaron Christian",
        status: "on_insurance",
        licenseExpiryDate: "2025-01-01",
      })!,
      toCompanyVehicleDriver({
        id: "pending",
        personnelName: "Mia Brown",
        status: "pending_mvr",
        licenseExpiryDate: "2027-01-01",
      })!,
      toCompanyVehicleDriver({
        id: "missing",
        personnelName: "Ned Cole",
        status: "on_insurance",
        licenseExpiryDate: "",
      })!,
    ];
    expect(sortCompanyVehicleDrivers(roster, "expired", today).map((d) => d.id)).toEqual([
      "expired",
      "missing",
      "ok",
      "pending",
    ]);
    expect(sortCompanyVehicleDrivers(roster, "pending_mvr", today).map((d) => d.id)).toEqual([
      "pending",
      "ok",
      "expired",
      "missing",
    ]);
    expect(sortCompanyVehicleDrivers(roster, "on_insurance", today).map((d) => d.id)).toEqual([
      "ok",
      "expired",
      "missing",
      "pending",
    ]);
  });
});
