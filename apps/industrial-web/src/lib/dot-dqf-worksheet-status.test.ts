import { describe, expect, it } from "vitest";
import {
  dqfWorksheetDocumentStatus,
  dqfWorksheetLicenseStatus,
} from "./dot-dqf-worksheet-status";

describe("dot-dqf-worksheet-status", () => {
  it("marks expired license as critical (red)", () => {
    const status = dqfWorksheetLicenseStatus(
      { cdlExpiry: "2025-01-01", driversLicenseCopy: "" },
      "2026-01-01",
    );
    expect(status.tone).toBe("critical");
    expect(status.badgeClassName).toBe("bg-label-danger");
    expect(status.label).toContain("Expired");
  });

  it("marks missing license copy as critical (red)", () => {
    const status = dqfWorksheetLicenseStatus({ cdlExpiry: "", driversLicenseCopy: "" });
    expect(status.tone).toBe("critical");
    expect(status.label).toBe("Missing");
  });

  it("marks expiring license as pending (pink)", () => {
    const status = dqfWorksheetLicenseStatus(
      {
        cdlExpiry: "2026-01-20",
        driversLicenseCopy: '[{"name":"dl.jpg","documentId":"01900000-0000-7000-8000-000000000001"}]',
      },
      "2026-01-01",
    );
    expect(status.tone).toBe("pending");
    expect(status.badgeClassName).toBe("bg-label-pink");
    expect(status.label).toContain("Expiring");
  });

  it("marks missing application copy as critical", () => {
    const status = dqfWorksheetDocumentStatus("driversApplication", {
      driversApplicationForEmployment: "",
      driversApplicationCopy: "",
    });
    expect(status.tone).toBe("critical");
    expect(status.label).toBe("Missing");
  });

  it("marks expiring MEC as pending when on file", () => {
    const status = dqfWorksheetDocumentStatus(
      "medicalCert",
      {
        workerClassification: "Full Time",
        driverLicenseClass: "CDL DRIVER",
        medicalCertExpiry: "2026-01-20",
        medicalCertCopy:
          '[{"name":"mec.pdf","documentId":"01900000-0000-7000-8000-000000000002"}]',
      },
      { today: "2026-01-01" },
    );
    expect(status.tone).toBe("pending");
    expect(status.badgeClassName).toBe("bg-label-pink");
  });

  it("treats optional DQF documents as Optional when empty", () => {
    expect(dqfWorksheetDocumentStatus("documentationRefusalToTest", {}).label).toBe("Optional");
    expect(dqfWorksheetDocumentStatus("observedBehaviorReasonableSuspicion", {}).tone).toBe("ok");
    expect(dqfWorksheetDocumentStatus("dqfReview", {}).label).toBe("Optional");
  });

  it("treats National Registry as on file when fields are set without an upload", () => {
    const status = dqfWorksheetDocumentStatus("medicalExaminerNationalRegistryVerification", {
      medicalExaminerNationalRegistryVerificationStatus: "Yes",
      medicalExaminerRegistrationNumber: "NR123",
    });
    expect(status.tone).toBe("ok");
    expect(status.label).toBe("NR123");
  });

  it("treats National Registry as on file when only a copy is uploaded", () => {
    const status = dqfWorksheetDocumentStatus("medicalExaminerNationalRegistryVerification", {
      medicalExaminerNationalRegistryVerificationCopy:
        '[{"name":"nrcme.pdf","documentId":"01900000-0000-7000-8000-000000000003"}]',
    });
    expect(status.tone).toBe("ok");
  });

  const eyeExamCopy =
    '[{"name":"eye.pdf","documentId":"01900000-0000-7000-8000-000000000004"}]';

  it("treats diabetic eye exam as optional for non-diabetic drivers", () => {
    const status = dqfWorksheetDocumentStatus("diabeticEyeExam", {});
    expect(status.tone).toBe("ok");
    expect(status.label).toBe("Optional");
  });

  it("requires diabetic eye exam upload when restrictions mention diabetes", () => {
    const status = dqfWorksheetDocumentStatus("diabeticEyeExam", {
      driverRestrictions: "Diabetic",
      diabeticEyeExamExpiry: "2027-06-01",
    });
    expect(status.tone).toBe("critical");
    expect(status.label).toBe("Missing");
  });

  it("requires diabetic eye exam expiration date when diabetic", () => {
    const status = dqfWorksheetDocumentStatus("diabeticEyeExam", {
      driverRestrictions: "diabetes - insulin",
      diabeticEyeExamCopy: eyeExamCopy,
    });
    expect(status.tone).toBe("critical");
    expect(status.label).toBe("Expiration not set");
  });

  it("flags expired and expiring diabetic eye exams", () => {
    const expired = dqfWorksheetDocumentStatus(
      "diabeticEyeExam",
      { diabeticEyeExamExpiry: "2025-12-01", diabeticEyeExamCopy: eyeExamCopy },
      { today: "2026-01-01" },
    );
    expect(expired.tone).toBe("critical");
    expect(expired.label).toContain("Expired");

    const expiring = dqfWorksheetDocumentStatus(
      "diabeticEyeExam",
      {
        driverRestrictions: "Diabetic",
        diabeticEyeExamExpiry: "2026-01-15",
        diabeticEyeExamCopy: eyeExamCopy,
      },
      { today: "2026-01-01" },
    );
    expect(expiring.tone).toBe("pending");
  });

  it("shows the diabetic eye exam expiration date when complete", () => {
    const status = dqfWorksheetDocumentStatus(
      "diabeticEyeExam",
      {
        driverRestrictions: "Diabetic",
        diabeticEyeExamExpiry: "2027-06-01",
        diabeticEyeExamCopy: eyeExamCopy,
      },
      { today: "2026-01-01" },
    );
    expect(status.tone).toBe("ok");
  });
});
