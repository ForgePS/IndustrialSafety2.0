import { describe, expect, it } from "vitest";
import {
  buildDqfComplianceCsv,
  buildDqfComplianceReport,
  formatDqfComplianceStats,
} from "./dot-dqf-compliance-report";

const ADA = {
  id: "drv-1",
  category: "drivers",
  dqf: true,
  driverName: "Ada Byron",
  cdlExpiry: "2025-01-01",
  medicalCertExpiry: "2026-01-20",
  details: {
    workerClassification: "Full Time",
    driverLicenseClass: "CDL DRIVER",
    employeeNumber: "101",
  },
};

const TIM = {
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
};

describe("dot-dqf-compliance-report", () => {
  it("summarizes critical, warning, missing, expired, and expiring counts", () => {
    const report = buildDqfComplianceReport([ADA, TIM], { today: "2026-01-01" });

    expect(report.drivers).toBe(2);
    expect(report.critical).toBe(1);
    expect(report.warning).toBe(0);
    expect(report.missing).toBe(2);
    expect(report.expired).toBe(1);
    expect(report.expiringSoon).toBe(1);
    expect(formatDqfComplianceStats(report)).toBe(
      "2 drivers · 1 critical · 0 warning · 2 missing · 1 expired · 1 expiring soon",
    );

    const ada = report.rows.find((row) => row.recordId === "drv-1");
    const license = ada?.documents.find((doc) => doc.key === "driversLicense");
    const mec = ada?.documents.find((doc) => doc.key === "medicalCert");
    expect(ada?.severity).toBe("critical");
    expect(license?.status).toBe("expired");
    expect(mec?.status).toBe("expiring");
    expect(license?.copyOnFile).toBe(false);
  });

  it("marks a driver as warning when only dates are expiring", () => {
    const report = buildDqfComplianceReport(
      [
        {
          id: "drv-3",
          category: "drivers",
          dqf: true,
          driverName: "Pat Warning",
          cdlExpiry: "2026-01-15",
          medicalCertExpiry: "2028-06-01",
          details: {
            workerClassification: "Full Time",
            driverLicenseClass: "CDL DRIVER",
            driversLicenseCopy: '[{"name":"license.jpg","url":"https://example.test/l.jpg"}]',
            medicalCertCopy: '[{"name":"mec.pdf","url":"https://example.test/m.pdf"}]',
          },
        },
      ],
      { today: "2026-01-01" },
    );

    expect(report.critical).toBe(0);
    expect(report.warning).toBe(1);
    expect(report.expired).toBe(0);
    expect(report.expiringSoon).toBe(1);
    expect(report.rows[0]?.severity).toBe("warning");
  });

  it("builds a roster CSV with document status and copy columns", () => {
    const report = buildDqfComplianceReport([ADA], { today: "2026-01-01" });
    const csv = buildDqfComplianceCsv(report);
    expect(csv.split("\n")[0]).toContain("DRIVER'S License");
    expect(csv.split("\n")[0]).toContain("DRIVER'S License copy");
    expect(csv).toContain("Ada Byron");
    expect(csv).toContain("Expired 2025-01-01");
    expect(csv).toContain("critical");
  });
});
