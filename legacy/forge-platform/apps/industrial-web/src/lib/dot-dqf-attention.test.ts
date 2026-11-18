import { describe, expect, it } from "vitest";
import {
  buildDotAttentionCards,
  buildFleetAttentionIssues,
  dotDateExpiryState,
  driverMatchesAttentionFilter,
  missingDqfDocumentLabels,
  summarizeCompanyDriverAttention,
  summarizeDotDqfAttention,
  buildCompanyDriverAttentionCards,
} from "./dot-dqf-attention";
import type { CompanyVehicleDriver } from "./company-vehicle-drivers";

describe("dot-dqf-attention", () => {
  it("classifies expiry states with a 30-day warning window", () => {
    expect(dotDateExpiryState("2025-01-01", "2026-01-01")).toBe("expired");
    expect(dotDateExpiryState("2026-01-15", "2026-01-01")).toBe("expiring");
    expect(dotDateExpiryState("2026-06-01", "2026-01-01")).toBe("ok");
    expect(dotDateExpiryState("", "2026-01-01")).toBe("none");
  });

  it("flags missing core DQF documents", () => {
    const missing = missingDqfDocumentLabels({
      workerClassification: "Full Time",
      driverLicenseClass: "CDL DRIVER",
    });
    expect(missing).toContain("DRIVER'S License copy");
    expect(missing).toContain("License expiration date");
    expect(missing).toContain("MEC expiration date");
  });

  it("skips MEC requirements for seasonal drivers", () => {
    const missing = missingDqfDocumentLabels({
      workerClassification: "Seasonal",
      driverLicenseClass: "Non-CDL DRIVER",
      cdlExpiry: "2028-01-01",
      driversLicenseCopy: "[]",
    });
    expect(missing).not.toContain("MEC expiration date");
    expect(missing).not.toContain("Medical Examiner's Certificate");
  });

  it("requires diabetic eye exam only when restrictions mention diabetes", () => {
    const base = {
      workerClassification: "Full Time",
      driverLicenseClass: "CDL DRIVER",
    };
    const nonDiabetic = missingDqfDocumentLabels(base);
    expect(nonDiabetic).not.toContain("Diabetic Eye Exam");
    expect(nonDiabetic).not.toContain("Diabetic Eye Exam expiration date");

    const diabetic = missingDqfDocumentLabels({ ...base, driverRestrictions: "Diabetic" });
    expect(diabetic).toContain("Diabetic Eye Exam");
    expect(diabetic).toContain("Diabetic Eye Exam expiration date");
  });

  it("does not require I-9, refusal, observed behavior, or DQF review", () => {
    const missing = missingDqfDocumentLabels({
      workerClassification: "Full Time",
      driverLicenseClass: "CDL DRIVER",
      cdlExpiry: "2028-01-01",
      driversLicenseCopy: '[{"name":"license.jpg","dataUrl":"data:image/jpeg;base64,abc"}]',
      medicalCertExpiry: "2028-01-01",
      medicalCertCopy: '[{"name":"mec.pdf","dataUrl":"data:application/pdf;base64,abc"}]',
    });
    expect(missing).not.toContain("Employment Eligibility Verification Form I-9");
    expect(missing).not.toContain("Documentation of Refusal to Test Form");
    expect(missing).not.toContain("Observed Behavior Reasonable Suspicion Record");
    expect(missing).not.toContain("DQF Review");
  });

  it("counts an expired diabetic eye exam as an expired driver", () => {
    const summary = summarizeDotDqfAttention(
      [
        {
          id: "drv-eye",
          category: "drivers",
          dqf: true,
          driverName: "Eye Exam",
          cdlExpiry: "2028-06-01",
          medicalCertExpiry: "2028-06-01",
          details: {
            workerClassification: "Full Time",
            driverLicenseClass: "CDL DRIVER",
            diabeticEyeExamExpiry: "2025-12-01",
          },
        },
      ],
      { today: "2026-01-01" },
    );
    expect(summary.expiredDrivers).toBe(1);
  });

  it("summarizes expired and expiring driver profiles", () => {
    const summary = summarizeDotDqfAttention(
      [
        {
          id: "drv-1",
          category: "drivers",
          dqf: true,
          driverName: "Ada Byron",
          cdlExpiry: "2025-01-01",
          medicalCertExpiry: "2026-01-20",
          details: {
            workerClassification: "Full Time",
            driverLicenseClass: "CDL DRIVER",
          },
        },
        {
          id: "drv-2",
          category: "drivers",
          dqf: true,
          driverName: "Tim Lake",
          cdlExpiry: "2028-06-01",
          medicalCertExpiry: "2028-06-01",
          details: {
            workerClassification: "Full Time",
            driverLicenseClass: "CDL DRIVER",
            driversLicenseCopy: '[{"name":"license.jpg","dataUrl":"data:image/jpeg;base64,abc"}]',
            medicalCertCopy: '[{"name":"mec.pdf","dataUrl":"data:application/pdf;base64,abc"}]',
          },
        },
      ],
      { today: "2026-01-01" },
    );

    expect(summary.expiredDrivers).toBe(1);
    expect(summary.expiringDrivers).toBe(1);
    expect(summary.missingDocumentsDrivers).toBe(2);
    expect(buildDotAttentionCards(summary).find((card) => card.key === "expired")?.count).toBe(1);
    expect(buildDotAttentionCards(summary).find((card) => card.key === "expiring")?.count).toBe(1);
    expect(buildDotAttentionCards(summary).map((card) => card.key)).toEqual(
      expect.arrayContaining(["expired", "expiring", "missingDocuments"]),
    );
    expect(buildDotAttentionCards(summary).length).toBeGreaterThanOrEqual(6);
    expect(
      driverMatchesAttentionFilter(
        {
          id: "drv-1",
          category: "drivers",
          dqf: true,
          driverName: "Ada Byron",
          cdlExpiry: "2025-01-01",
          details: { workerClassification: "Full Time" },
        },
        "expired",
        { today: "2026-01-01" },
      ),
    ).toBe(true);
  });

  it("counts each expired credential separately on attention cards", () => {
    const summary = summarizeDotDqfAttention(
      [
        {
          id: "drv-1",
          category: "drivers",
          dqf: true,
          driverName: "Ada Byron",
          details: {
            workerClassification: "Full Time",
            driverLicenseClass: "CDL DRIVER",
            cdlExpiry: "2025-01-01",
            medicalCertExpiry: "2025-06-01",
            driversLicenseCopy: '[{"name":"license.jpg"}]',
            medicalCertCopy: '[{"name":"mec.pdf"}]',
          },
        },
      ],
      { today: "2026-01-01" },
    );

    expect(summary.expiredDrivers).toBe(2);
    expect(buildDotAttentionCards(summary).find((card) => card.key === "expired")?.count).toBe(2);
  });

  it("does not treat last MVR pull date as an expiration", () => {
    const summary = summarizeDotDqfAttention(
      [
        {
          id: "drv-1",
          category: "drivers",
          dqf: true,
          driverName: "Ada Byron",
          lastMvrDate: "2024-01-01",
          details: {
            workerClassification: "Full Time",
            driverLicenseClass: "CDL DRIVER",
            cdlExpiry: "2028-01-01",
            driversLicenseCopy: '[{"name":"license.jpg"}]',
            medicalCertCopy: '[{"name":"mec.pdf"}]',
            medicalCertExpiry: "2028-01-01",
          },
        },
      ],
      { today: "2026-01-01" },
    );

    expect(summary.issues.some((issue) => issue.fieldId === "mvrAnnual")).toBe(false);
    expect(summary.expiredDrivers).toBe(0);
    expect(summary.expiringDrivers).toBe(0);
  });

  it("adds company roster license issues in a separate summary", () => {
    const fleetDriver: CompanyVehicleDriver = {
      id: "fleet-1",
      personnelId: "person-9",
      personnelName: "Roster Driver",
      employeeNumber: "E100",
      dateOfBirth: "",
      licenseNumber: "",
      licenseState: "",
      licenseExpiryDate: "2024-01-01",
      hasLicenseFront: false,
      hasLicenseBack: false,
      status: "on_insurance",
      initialMvrDate: "",
      lastMvrDate: "",
      nextMvrDueDate: "",
      mvrReleaseDate: "",
      mvrReleaseUploadCount: 0,
      mvrUploadCount: 0,
      lastMvrUploadAt: "",
      sampleYear: null,
      sampleSelectedAt: "",
      sampleCompletedAt: "",
      mvrAuditHistory: [],
      insuranceEffectiveDate: "",
      insuranceRemovedDate: "",
      notes: "",
    };

    const fleetIssues = buildFleetAttentionIssues([fleetDriver], "2026-01-01");
    expect(fleetIssues.map((issue) => issue.kind)).toEqual(
      expect.arrayContaining(["expired", "missingMvrConsent"]),
    );
    expect(fleetIssues.find((issue) => issue.kind === "missingMvrConsent")?.reason).toBe(
      "Missing MVR Consent form",
    );

    const dqfSummary = summarizeDotDqfAttention([], { today: "2026-01-01" });
    expect(dqfSummary.expiredDrivers).toBe(0);

    const companySummary = summarizeCompanyDriverAttention([fleetDriver], { today: "2026-01-01" });
    expect(companySummary.expiredDrivers).toBe(1);
    expect(companySummary.missingMvrConsent).toBe(1);
    expect(companySummary.issues.filter((issue) => issue.kind === "expired")).toHaveLength(1);
  });

  it("flags missing MVR Consent as required company-driver attention", () => {
    const driver: CompanyVehicleDriver = {
      id: "fleet-consent",
      personnelId: "person-consent",
      personnelName: "Consent Needed",
      employeeNumber: "E200",
      dateOfBirth: "",
      licenseNumber: "",
      licenseState: "",
      licenseExpiryDate: "2028-01-01",
      hasLicenseFront: false,
      hasLicenseBack: false,
      status: "on_insurance",
      initialMvrDate: "2026-01-01",
      lastMvrDate: "2026-01-01",
      nextMvrDueDate: "",
      mvrReleaseDate: "",
      mvrReleaseUploadCount: 0,
      mvrUploadCount: 1,
      lastMvrUploadAt: "",
      sampleYear: null,
      sampleSelectedAt: "",
      sampleCompletedAt: "",
      mvrAuditHistory: [],
      insuranceEffectiveDate: "",
      insuranceRemovedDate: "",
      notes: "",
    };
    const summary = summarizeCompanyDriverAttention([driver], { today: "2026-06-01" });
    expect(summary.missingMvrConsent).toBe(1);
    expect(
      buildCompanyDriverAttentionCards(summary).find((card) => card.key === "missingMvrConsent")
        ?.count,
    ).toBe(1);
  });
});
