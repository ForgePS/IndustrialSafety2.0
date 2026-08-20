import { describe, expect, it } from "vitest";
import {
  buildPersonnelPpeSummary,
  daysUntilPpeExpiry,
  filterPpeAllowancePeople,
  formatPpeExtraPairSummary,
  nextPpeExpiresDate,
  personHasPpeExpiryAlert,
  ppeExpiryStatus,
  suggestPpeExpiresDate,
  toPpeAllowancePerson,
} from "./personnel-ppe";

describe("personnel-ppe", () => {
  const today = new Date(Date.UTC(2026, 7, 19));

  it("flags expiring and expired allowances", () => {
    expect(ppeExpiryStatus("2026-09-01", today)).toBe("expiring_soon");
    expect(ppeExpiryStatus("2026-08-01", today)).toBe("expired");
    expect(ppeExpiryStatus("2027-01-01", today)).toBe("ok");
    expect(ppeExpiryStatus("", today)).toBe("none");
  });

  it("counts days until expiration", () => {
    expect(daysUntilPpeExpiry("2026-09-01", today)).toBe(13);
    expect(daysUntilPpeExpiry("2026-08-01", today)).toBe(-18);
  });

  it("suggests a one-year expiration from issued date", () => {
    expect(suggestPpeExpiresDate("2026-01-15")).toBe("2027-01-15");
    expect(suggestPpeExpiresDate("2025-06-02")).toBe("2026-06-02");
  });

  it("recalculates expiration from issued date instead of keeping a stale value", () => {
    expect(nextPpeExpiresDate("2026-10-01", "2026-09-01")).toBe("2027-10-01");
    expect(nextPpeExpiresDate("2026-10-01", "")).toBe("2027-10-01");
    expect(nextPpeExpiresDate("2025-06-02", "2027-06-19")).toBe("2026-06-02");
    expect(nextPpeExpiresDate("2026-01-15", "2028-06-01")).toBe("2027-01-15");
  });

  it("does not treat a post-dated issued pair as expired", () => {
    expect(ppeExpiryStatus("2026-08-01", today, 30, "2026-10-01")).toBe("scheduled");
    expect(
      personHasPpeExpiryAlert(
        {
          tracksPrescriptionSafetyGlasses: true,
          prescriptionSafetyGlassesIssuedDate: "2026-10-01",
          prescriptionSafetyGlassesExpiresDate: "2026-08-01",
        },
        today,
      ),
    ).toBe(false);
  });

  it("aggregates tracked counts and expiry alerts", () => {
    const summary = buildPersonnelPpeSummary(
      [
        {
          tracksPrescriptionSafetyGlasses: true,
          prescriptionSafetyGlassesExpiresDate: "2026-09-01",
        },
        {
          tracksPrescriptionSafetyGlasses: true,
          prescriptionSafetyGlassesExpiresDate: "2025-01-01",
        },
        { safetyFootwearClass: "CLASS_1", safetyFootwearExpiresDate: "2026-09-10" },
        { safetyFootwearClass: "CLASS_2", safetyFootwearExpiresDate: "2027-06-01" },
        { tracksPrescriptionSafetyGlasses: false, safetyFootwearClass: "" },
      ],
      today,
    );
    expect(summary.prescriptionGlassesCount).toBe(2);
    expect(summary.safetyFootwearCount).toBe(2);
    expect(summary.prescriptionGlassesExpiringSoon).toBe(1);
    expect(summary.prescriptionGlassesExpired).toBe(1);
    expect(summary.safetyFootwearExpiringSoon).toBe(1);
    expect(summary.safetyFootwearExpired).toBe(0);
  });

  it("maps PPE roster rows with extra-pair manager approval", () => {
    const person = toPpeAllowancePerson(
      {
        id: "p1",
        displayName: "Jordan Hale",
        employeeNumber: "EMP-9",
        tracksPrescriptionSafetyGlasses: true,
        prescriptionSafetyGlassesIssuedDate: "2026-01-10",
        prescriptionSafetyGlassesExpiresDate: "2027-01-10",
        prescriptionSafetyGlassesExtraPairApproved: true,
        prescriptionSafetyGlassesExtraPairApprovedBy: "Pat Manager",
        prescriptionSafetyGlassesExtraPairApprovedDate: "2026-03-02",
        prescriptionSafetyGlassesExtraPairReason: "Lens scratch",
        safetyFootwearClass: "CLASS_1",
        safetyFootwearIssuedDate: "2026-02-01",
        safetyFootwearExpiresDate: "2027-02-01",
      },
      today,
    );
    expect(person?.tracksGlasses).toBe(true);
    expect(person?.glassesIssuedDate).toBe("2026-01-10");
    expect(person?.glassesExpiresDate).toBe("2027-01-10");
    expect(person?.footwearClass).toBe("CLASS_1");
    expect(
      formatPpeExtraPairSummary(person!.glassesExtra),
    ).toBe("Approved by Pat Manager on 2026-03-02 — Lens scratch");
    expect(filterPpeAllowancePeople([person!], "extra-pair")).toHaveLength(1);
    expect(filterPpeAllowancePeople([person!], "expiring")).toHaveLength(0);
  });

  it("drops people with neither glasses nor boots", () => {
    expect(
      toPpeAllowancePerson({ id: "p2", tracksPrescriptionSafetyGlasses: false }, today),
    ).toBeNull();
  });
});
