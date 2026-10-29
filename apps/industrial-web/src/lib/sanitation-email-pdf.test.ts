import { describe, expect, it } from "vitest";
import {
  emailPdfResultSummary,
  filterReportRecipients,
  parseReportRecipients,
} from "./sanitation-email-pdf";

const people = parseReportRecipients({
  items: [
    {
      id: "1",
      name: "Clay Kannada",
      email: "ckannada@producersrice.com",
      jobTitle: "Sanitation Lead",
      departmentName: "Parboil",
    },
    {
      id: "2",
      name: "Ann Lee",
      email: "alee@producersrice.com",
      jobTitle: null,
      departmentName: "Milling",
    },
    { id: "3", name: "No Email", email: "" },
  ],
});

describe("parseReportRecipients", () => {
  it("drops rows without an id or email", () => {
    expect(people.map((p) => p.id)).toEqual(["1", "2"]);
  });
});

describe("filterReportRecipients", () => {
  it("matches every term across name, email, title and department", () => {
    expect(filterReportRecipients(people, "parboil clay").map((p) => p.id)).toEqual(["1"]);
    expect(filterReportRecipients(people, "producersrice").map((p) => p.id)).toEqual(["1", "2"]);
    expect(filterReportRecipients(people, "  ")).toHaveLength(2);
  });
});

describe("emailPdfResultSummary", () => {
  it("reports full success", () => {
    const summary = emailPdfResultSummary({
      filename: "SAN-1.pdf",
      sent: 2,
      failed: 0,
      results: [
        { personnelId: "1", name: "Clay", email: "c@x.com", accepted: true },
        { personnelId: "2", name: "Ann", email: "a@x.com", accepted: true },
      ],
      skipped: [],
    });
    expect(summary).toEqual({ tone: "success", message: "Sent SAN-1.pdf to 2 people." });
  });

  it("calls out failures and skipped people", () => {
    const summary = emailPdfResultSummary({
      filename: "SAN-1.pdf",
      sent: 1,
      failed: 1,
      results: [
        { personnelId: "1", name: "Clay", email: "c@x.com", accepted: true },
        { personnelId: "2", name: "Ann", email: "a@x.com", accepted: false },
      ],
      skipped: [{ personnelId: "3", name: "Bo", reason: "No email address on file" }],
    });
    expect(summary.tone).toBe("warning");
    expect(summary.message).toBe(
      "Sent SAN-1.pdf to 1 person. Could not send to Ann. Skipped Bo (no email address on file).",
    );
  });
});
