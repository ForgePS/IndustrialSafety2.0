import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@forge/web-kit", () => ({
  apiGet: vi.fn(),
}));

vi.mock("@/lib/document-control", () => ({
  listOverdueReviews: vi.fn(),
  listApprovalsQueue: vi.fn(),
  listMyPendingAcks: vi.fn(),
}));

import { apiGet } from "@forge/web-kit";
import {
  listApprovalsQueue,
  listMyPendingAcks,
  listOverdueReviews,
} from "@/lib/document-control";
import {
  isSummaryWidgetModule,
  loadInspectionsSummary,
  loadMessagingSummary,
  loadTrainingSummary,
} from "./module-summary-loaders";

const apiGetMock = vi.mocked(apiGet);

describe("isSummaryWidgetModule", () => {
  it("covers phase-6 modules", () => {
    expect(isSummaryWidgetModule("INSPECTIONS")).toBe(true);
    expect(isSummaryWidgetModule("TRAINING")).toBe(true);
    expect(isSummaryWidgetModule("DOCUMENTS")).toBe(true);
    expect(isSummaryWidgetModule("EMERGENCY_ALERTS")).toBe(true);
    expect(isSummaryWidgetModule("MESSAGING")).toBe(true);
    expect(isSummaryWidgetModule("SAFETY_SUPPLIES")).toBe(true);
    expect(isSummaryWidgetModule("CORRECTIVE_ACTIONS")).toBe(true);
    expect(isSummaryWidgetModule("CALENDAR")).toBe(false);
    expect(isSummaryWidgetModule("FLEET")).toBe(false);
  });
});

describe("summary loaders", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    vi.mocked(listOverdueReviews).mockReset();
    vi.mocked(listApprovalsQueue).mockReset();
    vi.mocked(listMyPendingAcks).mockReset();
  });

  it("summarizes inspections by open/due", async () => {
    apiGetMock.mockResolvedValue({
      items: [
        { id: "1", title: "Forklift check", status: "OPEN" },
        { id: "2", title: "Fire door", status: "DUE" },
        { id: "3", title: "Done", status: "COMPLETED" },
      ],
    });
    const open = await loadInspectionsSummary("open");
    expect(open.caption).toContain("2 open");
    expect(open.caption).toContain("1 due");
    expect(open.rows).toHaveLength(2);

    const due = await loadInspectionsSummary("due");
    expect(due.rows).toHaveLength(1);
    expect(due.rows[0]?.title).toBe("Fire door");
  });

  it("summarizes training overdue vs assigned", async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 2 * 86400000).toISOString();
    apiGetMock.mockResolvedValue({
      items: [
        { id: "a", title: "HazCom", status: "ASSIGNED", dueAt: past },
        { id: "b", title: "Lockout", status: "ASSIGNED", dueAt: future },
        { id: "c", title: "Done", status: "COMPLETED", dueAt: null },
      ],
    });
    const assigned = await loadTrainingSummary("assigned");
    expect(assigned.stats.find((s) => s.label === "Assigned")?.value).toBe(2);
    expect(assigned.stats.find((s) => s.label === "Overdue")?.value).toBe(1);

    const overdue = await loadTrainingSummary("overdue");
    expect(overdue.rows).toHaveLength(1);
    expect(overdue.rows[0]?.badge).toBe("Overdue");
  });

  it("summarizes messaging unread", async () => {
    apiGetMock.mockResolvedValue({
      items: [
        { id: "t1", title: "Shift handoff", unreadCount: 3, lastMessagePreview: "Need coverage" },
        { id: "t2", title: "EHS", unreadCount: 0, lastMessagePreview: "All clear" },
      ],
    });
    const unread = await loadMessagingSummary("unread");
    expect(unread.caption).toBe("3 unread");
    expect(unread.rows).toHaveLength(1);
    expect(unread.rows[0]?.badge).toBe("3 new");
  });

  it("exposes default views per module", async () => {
    const { getModuleSummaryDefaultView } = await import("./module-summary-loaders");
    expect(getModuleSummaryDefaultView("MESSAGING")).toBe("unread");
    expect(getModuleSummaryDefaultView("DOCUMENTS")).toBe("overdue");
    expect(getModuleSummaryDefaultView("UNKNOWN")).toBe("open");
  });
});
