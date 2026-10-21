import { describe, expect, it } from "vitest";
import {
  buildWorkersCompPrintableHtml,
  workersCompPrintTitle,
} from "./workers-comp-print.js";

describe("workers-comp-print", () => {
  it("builds claim title from claim number and worker", () => {
    expect(
      workersCompPrintTitle({
        caseNumber: "WC-100",
        workerName: "Alex Rivera",
        claimSummary: { claimNumber: "" },
      }),
    ).toBe("Workers' Comp Claim — WC-100 — Alex Rivera");
  });

  it("includes claim, incident, and nested sections in printable HTML", () => {
    const html = buildWorkersCompPrintableHtml({
      workersComp: {
        caseNumber: "CLM-42",
        status: "OPEN",
        workflowStage: "TREATMENT",
        severity: "moderate",
        workerName: "Alex Rivera",
        dateOfBirth: "1988-04-12",
        locationText: "Mill floor",
        notes: "Follow up with carrier",
        daysAway: 3,
        restrictedDays: 5,
        claimSummary: {
          claimNumber: "CLM-42",
          carrierName: "Acme Mutual",
          adjuster: "Sam Lee",
          dateOfInjury: "2026-09-01",
          bodyParts: "left hand",
          notes: "Initial filing",
        },
        workStatus: [
          {
            status: "RESTRICTED",
            startDate: "2026-09-02",
            endDate: "",
            notes: "Light duty",
          },
        ],
        restrictions: [
          {
            status: "ACTIVE",
            startDate: "2026-09-02",
            description: "No lifting over 10 lbs",
            accommodations: {
              standWalk: "1-4",
              sit: "",
              liftingLevel: "sedentary",
              injurySides: ["left"],
              injuryParts: ["hand"],
              injuryOther: "",
              upperExtremities: [],
              pushPullLimitLbs: "",
              lowerExtremities: [],
              transitionalNotApplicable: false,
              transitionalHours: "",
              transitionalWeeks: "",
              transitionalAbleRemaining: "",
              transitionalEffectiveDate: "",
              notes: "",
            },
          },
        ],
        medicalAllowed: true,
        medical: [
          {
            appointmentDate: "2026-09-03",
            provider: "Dr. Kim",
            diagnosis: "Contusion",
            treatment: "Ice / rest",
          },
        ],
      },
      incident: {
        title: "26-09-01 Alex - Mill",
        status: "open",
        personAffected: "Alex Rivera",
        description: "Pinched left hand in conveyor",
        location: "Mill floor",
      },
      branding: { companyName: "Producers Rice", logoUrl: "https://example.com/logo.png" },
    });

    expect(html).toContain("Workers' Comp Claim — CLM-42 — Alex Rivera");
    expect(html).toContain("Acme Mutual");
    expect(html).toContain("Sam Lee");
    expect(html).toContain("Linked incident");
    expect(html).toContain("26-09-01 Alex - Mill");
    expect(html).toContain("Pinched left hand in conveyor");
    expect(html).toContain("RESTRICTED");
    expect(html).toContain("No lifting over 10 lbs");
    expect(html).toContain("Dr. Kim");
    expect(html).toContain("Producers Rice");
    expect(html).toContain("Print / Save as PDF");
  });

  it("shows medical denial when medical is not allowed", () => {
    const html = buildWorkersCompPrintableHtml({
      workersComp: {
        caseNumber: "Pending",
        workerName: "Alex",
        medicalAllowed: false,
        medicalDeniedReason: "No medical permission",
        claimSummary: {},
      },
    });
    expect(html).toContain("No medical permission");
    expect(html).toContain("No incident is linked");
  });
});
