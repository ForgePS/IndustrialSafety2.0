import { describe, expect, it } from "vitest";
import {
  buildIncidentPrintableHtml,
  incidentPrintDetailRows,
  reasonableSuspicionPrintRows,
} from "./incident-print.js";

describe("incident-print", () => {
  it("builds detail rows from mixed legacy and forge fields", () => {
    const rows = incidentPrintDetailRows({
      status: "open",
      IncidentTypeName: "Injury",
      PersonAffected: "Alex",
      IncidentDateTime: "2026-03-10",
      bodyLocations: ["left-hand", "head"],
    });
    expect(rows.find((row) => row.label === "Person affected")?.value).toBe("Alex");
    expect(rows.find((row) => row.label === "Body part")?.value).toContain("left-hand");
    expect(rows.find((row) => row.label === "Type")?.value).toBe("Injury");
  });

  it("builds printable HTML with branding and narrative", () => {
    const html = buildIncidentPrintableHtml(
      {
        title: "26-03-10 Alex - Mill",
        status: "open",
        personAffected: "Alex",
        description: "Slip on wet floor",
        workDayDetails: "Area dried and signed",
      },
      { companyName: "Producers Rice", logoUrl: "https://example.com/logo.png" },
    );
    expect(html).toContain("26-03-10 Alex - Mill");
    expect(html).toContain("Slip on wet floor");
    expect(html).toContain("Area dried and signed");
    expect(html).toContain("Producers Rice");
    expect(html).toContain("Print / Save as PDF");
    expect(html).toContain("https://example.com/logo.png");
  });

  it("prints the reasonable-suspicion observation and consent forms", () => {
    expect(
      reasonableSuspicionPrintRows({
        observedAt: "2026-10-08T09:15",
        indicators: ["odor-alcohol", "unknown-sign"],
        indicatorsOther: "Smell of solvent",
        dotCovered: true,
        observerName: "Pat",
        observerTitle: "Supervisor",
        observerTrained: true,
        transportation: "other",
        transportationOther: "Plant manager drove employee home",
      }),
    ).toEqual(
      expect.arrayContaining([
        { label: "Observed signs", value: "Odor of alcohol; unknown-sign; Other: Smell of solvent" },
        { label: "DOT-covered driver", value: "Yes" },
        { label: "Observing supervisor", value: "Pat (Supervisor) - reasonable-suspicion trained" },
        { label: "Transportation", value: "Plant manager drove employee home" },
      ]),
    );
    expect(reasonableSuspicionPrintRows(null)).toEqual([]);

    const html = buildIncidentPrintableHtml({
      title: "RS test",
      reasonableSuspicion: {
        observationNarrative: "<b>slurred</b>",
        observerSignature: "javascript:alert(1)",
      },
      drugAlcoholConsents: [
        {
          employeeName: "Sam",
          testingRequired: true,
          reason: "reasonable-suspicion",
          substances: ["drug", "alcohol"],
          testStatus: "completed",
        },
        { employeeName: "Not tested", testingRequired: false },
      ],
    });
    expect(html).toContain("Reasonable Suspicion Observation");
    expect(html).toContain("&lt;b&gt;slurred&lt;/b&gt;");
    expect(html).not.toContain("javascript:alert");
    expect(html).toContain("Drug &amp; Alcohol Consent and Test - Sam");
    expect(html).toContain("reasonable suspicion");
    expect(html).not.toContain("Not tested");
  });
});
