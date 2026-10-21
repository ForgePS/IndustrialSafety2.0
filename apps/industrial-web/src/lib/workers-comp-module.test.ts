import { describe, expect, it } from "vitest";
import {
  buildWorkersCompNextActions,
  incidentHref,
  isWorkersCompSelfPay,
  normalizeWcEmailAddress,
  parseWcEmailRecipients,
  parseWcModuleTab,
  parseWorkersCompClaimSummary,
  returnToWorkCases,
  sortWorkersCompCasesForList,
  thursdayWeekOf,
  toWorkersCompCase,
  toWorkersCompSummary,
  toWorkersCompWeeklyStatusSettings,
  toWorkersCompWeeklyUpdatesPayload,
  uniqueWorkersFromCases,
  weeklyUpdateRowStatus,
  wcCaseHref,
  wcStatusBadgeClass,
} from "./workers-comp-module";

describe("workers-comp-module", () => {
  it("parses claim summary", () => {
    expect(parseWorkersCompClaimSummary({ claimNumber: " C1 ", dateOfInjury: "2026-01-02" })).toEqual(
      expect.objectContaining({ claimNumber: "C1", dateOfInjury: "2026-01-02" }),
    );
  });

  it("maps case records and syncs claim number to case number", () => {
    const mapped = toWorkersCompCase({
      id: "11111111-1111-1111-1111-111111111111",
      caseNumber: "WC-1",
      status: "OPEN",
      claimSummary: { claimNumber: "A" },
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(mapped?.caseNumber).toBe("WC-1");
    expect(mapped?.claimSummary.claimNumber).toBe("WC-1");
  });

  it("sorts open cases first then by injury/updated date newest first", () => {
    const closedOld = toWorkersCompCase({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "CLOSED",
      claimSummary: { dateOfInjury: "2024-01-01" },
      updatedAt: "2024-01-02T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
    })!;
    const openOlder = toWorkersCompCase({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "OPEN",
      claimSummary: { dateOfInjury: "2025-06-01" },
      updatedAt: "2025-06-02T00:00:00.000Z",
      createdAt: "2025-06-01T00:00:00.000Z",
    })!;
    const openNewer = toWorkersCompCase({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      status: "RESTRICTED",
      claimSummary: { dateOfInjury: "2026-03-01" },
      updatedAt: "2026-03-02T00:00:00.000Z",
      createdAt: "2026-03-01T00:00:00.000Z",
    })!;
    const archived = toWorkersCompCase({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      status: "ARCHIVED",
      claimSummary: { dateOfInjury: "2026-01-01" },
      updatedAt: "2026-01-02T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    })!;
    const sorted = sortWorkersCompCasesForList([closedOld, openOlder, archived, openNewer]);
    expect(sorted.map((c) => c.id)).toEqual([
      openNewer.id,
      openOlder.id,
      archived.id,
      closedOld.id,
    ]);
  });

  it("maps summary tiles input", () => {
    expect(toWorkersCompSummary({ total: 4, open: 2, restricted: 1, lostTime: 1, closed: 0 })).toEqual({
      total: 4,
      open: 2,
      restricted: 1,
      lostTime: 1,
      closed: 0,
    });
  });

  it("parses weekly status settings and emails", () => {
    expect(normalizeWcEmailAddress(" Safety@Co.com ")).toBe("safety@co.com");
    expect(normalizeWcEmailAddress("not-an-email")).toBeNull();
    expect(parseWcEmailRecipients("a@x.com, B@Y.com;\nc@z.com\na@x.com")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
    expect(parseWcEmailRecipients("bad, also-bad")).toEqual([]);
    expect(
      toWorkersCompWeeklyStatusSettings({
        enabled: true,
        recipients: ["a@x.com", "bad", "a@x.com"],
        lastSentAt: "2026-08-28T12:00:00.000Z",
      }),
    ).toEqual({
      enabled: true,
      recipients: ["a@x.com"],
      lastSentAt: "2026-08-28T12:00:00.000Z",
    });
  });

  it("picks status badge classes", () => {
    expect(wcStatusBadgeClass("LOST_TIME")).toContain("danger");
    expect(wcStatusBadgeClass("CLOSED")).toContain("secondary");
  });

  it("parses module tabs and case hrefs", () => {
    expect(parseWcModuleTab("return-to-work")).toBe("return-to-work");
    expect(parseWcModuleTab("weekly-updates")).toBe("weekly-updates");
    expect(parseWcModuleTab("nope")).toBe("dashboard");
    expect(wcCaseHref("abc")).toContain("view=cases");
    expect(wcCaseHref("abc")).toContain("id=abc");
    expect(incidentHref("inc-1")).toBe("/modules/incidents/?incident=inc-1");
  });

  it("computes Thursday week keys and due/overdue status", () => {
    expect(thursdayWeekOf(new Date(2026, 8, 16))).toBe("2026-09-17");
    expect(weeklyUpdateRowStatus("2026-09-17", false, new Date(2026, 8, 16))).toBe("due");
    expect(weeklyUpdateRowStatus("2026-09-17", false, new Date(2026, 8, 17))).toBe("overdue");
  });

  it("parses weekly updates list payload", () => {
    const payload = toWorkersCompWeeklyUpdatesPayload({
      weekOf: "2026-09-17",
      summary: { total: 1, complete: 0, due: 0, overdue: 1, remaining: 1 },
      items: [
        {
          caseId: "11111111-1111-1111-1111-111111111111",
          workerName: "Sam",
          claimNumber: "C1",
          caseStatus: "OPEN",
          needsUpdate: true,
          status: "overdue",
          notes: "",
        },
      ],
    });
    expect(payload.summary.remaining).toBe(1);
    expect(payload.items[0]?.status).toBe("overdue");
  });

  it("builds next actions for open intake cases", () => {
    const cases = [
      toWorkersCompCase({
        id: "11111111-1111-1111-1111-111111111111",
        status: "OPEN",
        workflowStage: "INTAKE",
        workerName: "Chris Jordan",
        claimSummary: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })!,
      toWorkersCompCase({
        id: "22222222-2222-2222-2222-222222222222",
        status: "CLOSED",
        workflowStage: "CLOSED",
        workerName: "Done",
        claimSummary: { claimNumber: "X" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })!,
    ];
    const open = cases[0]!;
    const actions = buildWorkersCompNextActions(cases, new Date("2026-04-20T12:00:00.000Z"));
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.caseId === open.id)).toBe(true);
    expect(actions.some((a) => a.title.includes("classification"))).toBe(true);
    expect(actions.some((a) => a.overdue)).toBe(true);
    for (const action of actions) {
      expect(action.reason.length).toBeGreaterThan(0);
      expect(action.daysOverdue > 0).toBe(action.overdue);
    }
    const classification = actions.find((a) => a.title.includes("classification"));
    expect(classification?.reason).toContain("Intake");
    expect(classification?.reason).toContain("5 days after the report date");
  });

  it("flags pending medical review only for Medical review / Investigation, not Treatment", () => {
    const base = {
      status: "OPEN",
      caseNumber: "CLM-1",
      workerName: "A",
      reportedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const treatment = toWorkersCompCase({
      ...base,
      id: "33333333-3333-3333-3333-333333333333",
      workflowStage: "TREATMENT",
    })!;
    const review = toWorkersCompCase({
      ...base,
      id: "44444444-4444-4444-4444-444444444444",
      workflowStage: "MEDICAL_REVIEW",
    })!;
    const actions = buildWorkersCompNextActions(
      [treatment, review],
      new Date("2026-04-20T12:00:00.000Z"),
    );
    const medical = actions.filter((a) => a.title.includes("medical review"));
    expect(medical.map((a) => a.caseId)).toEqual([review.id]);
    expect(medical[0]?.reason).toContain("Medical review");
  });

  it("clears lost-time, restricted and case follow-up flags once the case reaches Treatment", () => {
    const base = {
      status: "ACTIVE",
      caseNumber: "CLM-1",
      workerName: "A",
      reportedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const variants = [
      { severity: "lost_time", daysAway: 54 },
      { severity: "restricted" },
      { nextAction: { label: "Call adjuster", dueDate: "2026-01-10" } },
    ];
    const now = new Date("2026-04-20T12:00:00.000Z");
    variants.forEach((extra, i) => {
      for (const stage of ["TREATMENT", "RETURN_TO_WORK", "CLAIM_ADMIN"]) {
        const c = toWorkersCompCase({
          ...base,
          ...extra,
          id: `5555555${i}-5555-5555-5555-555555555555`,
          workflowStage: stage,
        })!;
        expect(buildWorkersCompNextActions([c], now)).toEqual([]);
      }
      const review = toWorkersCompCase({
        ...base,
        ...extra,
        id: `6666666${i}-6666-6666-6666-666666666666`,
        workflowStage: "INVESTIGATION",
      })!;
      expect(
        buildWorkersCompNextActions([review], now).some((a) => !a.id.endsWith(":medical-review")),
      ).toBe(true);
    });
  });

  it("recognizes the built-in Self Pay carrier", () => {
    expect(isWorkersCompSelfPay({ carrierId: "self-pay", carrierName: "Self Pay" })).toBe(true);
    expect(isWorkersCompSelfPay({ carrierId: "", carrierName: "self pay" })).toBe(true);
    expect(isWorkersCompSelfPay({ carrierId: "abc", carrierName: "Travelers" })).toBe(false);
    expect(isWorkersCompSelfPay({})).toBe(false);
  });

  it("aggregates employees and RTW queues", () => {
    const cases = [
      toWorkersCompCase({
        id: "11111111-1111-1111-1111-111111111111",
        status: "RESTRICTED",
        workflowStage: "RETURN_TO_WORK",
        workerName: "A",
        personnelId: "p1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })!,
      toWorkersCompCase({
        id: "22222222-2222-2222-2222-222222222222",
        status: "OPEN",
        workflowStage: "INTAKE",
        workerName: "A",
        personnelId: "p1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })!,
    ];
    expect(uniqueWorkersFromCases(cases)).toHaveLength(1);
    expect(returnToWorkCases(cases)).toHaveLength(1);
  });
});
