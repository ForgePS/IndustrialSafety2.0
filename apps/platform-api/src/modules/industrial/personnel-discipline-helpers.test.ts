import { describe, expect, it } from "vitest";
import {
  computeDisciplineScoreImpact,
  disciplineCountsUntil,
  normalizeDisciplinaryActionInput,
  readDisciplineAttachments,
} from "./personnel-discipline-helpers.js";

describe("normalizeDisciplinaryActionInput", () => {
  it("derives points from the action and a fixed 12-month window", () => {
    const input = normalizeDisciplinaryActionInput({
      actionType: "written_warning",
      actionDate: "2026-03-15",
      reason: "No fall protection on mezzanine",
    });
    expect(input.actionType).toBe("WRITTEN_WARNING");
    expect(input.category).toBe("SAFETY");
    expect(input.points).toBe(10);
    expect(input.countsUntil).toBe("2027-03-15");
  });

  it("ignores client-supplied points and counts-until", () => {
    const input = normalizeDisciplinaryActionInput({
      actionType: "COACHING",
      actionDate: "2026-03-15",
      reason: "x",
      points: 0,
      countsUntil: "",
    });
    expect(input.points).toBe(2);
    expect(input.countsUntil).toBe("2027-03-15");
  });

  it("rejects unknown types and missing reason", () => {
    expect(() =>
      normalizeDisciplinaryActionInput({ actionType: "nope", actionDate: "2026-01-01", reason: "x" }),
    ).toThrow(/actionType/);
    expect(() =>
      normalizeDisciplinaryActionInput({ actionType: "COACHING", actionDate: "2026-01-01", reason: " " }),
    ).toThrow(/reason/);
  });

  it("recomputes points and window on partial update", () => {
    const existing = normalizeDisciplinaryActionInput({
      actionType: "VERBAL_WARNING",
      actionDate: "2026-02-01",
      reason: "Late lockout",
    });
    const updated = normalizeDisciplinaryActionInput(
      { actionType: "FINAL_WARNING", actionDate: "2026-04-10" },
      existing,
    );
    expect(updated.points).toBe(15);
    expect(updated.countsUntil).toBe("2027-04-10");
    expect(updated.reason).toBe("Late lockout");
  });
});

describe("disciplineCountsUntil", () => {
  it("adds 12 months and clamps leap days like Postgres", () => {
    expect(disciplineCountsUntil("2025-10-08")).toBe("2026-10-08");
    expect(disciplineCountsUntil("2028-02-29")).toBe("2029-02-28");
  });
});

describe("computeDisciplineScoreImpact", () => {
  const now = new Date("2026-10-08T12:00:00Z");

  it("only counts active actions within 12 months, using points for the action type", () => {
    const impact = computeDisciplineScoreImpact(
      [
        { actionType: "WRITTEN_WARNING", status: "ACTIVE", points: 99, actionDate: "2026-05-01" },
        { actionType: "VERBAL_WARNING", status: "ACTIVE", points: 5, actionDate: "2025-01-01" },
        { actionType: "FINAL_WARNING", status: "RESCINDED", points: 15, actionDate: "2026-06-01" },
        { actionType: "SUSPENSION", status: "ACTIVE", points: 20, actionDate: "2026-09-01" },
      ],
      now,
    );
    expect(impact).toEqual({ deduction: 30, activeCount: 2, totalCount: 4 });
  });

  it("counts through the last day of the window", () => {
    const impact = computeDisciplineScoreImpact(
      [{ actionType: "VERBAL_WARNING", status: "ACTIVE", points: 5, actionDate: "2025-10-08" }],
      now,
    );
    expect(impact.deduction).toBe(5);
  });
});

describe("readDisciplineAttachments", () => {
  it("keeps valid entries only", () => {
    expect(
      readDisciplineAttachments([
        { documentId: "11111111-1111-4111-8111-111111111111", fileName: "writeup.pdf" },
        { documentId: "bad" },
        null,
      ]),
    ).toEqual([
      {
        documentId: "11111111-1111-4111-8111-111111111111",
        fileName: "writeup.pdf",
        contentType: "application/octet-stream",
        uploadedAt: new Date(0).toISOString(),
      },
    ]);
    expect(readDisciplineAttachments("nope")).toEqual([]);
  });
});
