import { describe, expect, it } from "vitest";
import {
  answeredCount,
  canCompleteInspection,
  criticalDeficiencyCount,
  deficiencyCount,
  filterInspectionsForHub,
  hasInspectorSignature,
  isCriticalInspectionItem,
  itemsFromTemplate,
  FALLBACK_INSPECTION_TEMPLATE,
  type InspectionListRecord,
} from "./inspections";

describe("inspection helpers", () => {
  it("builds run items from template", () => {
    const items = itemsFromTemplate(FALLBACK_INSPECTION_TEMPLATE);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.answer).toBeNull();
  });

  it("requires notes for NO findings", () => {
    const items = itemsFromTemplate(FALLBACK_INSPECTION_TEMPLATE).map((item, index) => ({
      ...item,
      answer: (index === 0 ? "NO" : "YES") as const,
      notes: "",
    }));
    expect(canCompleteInspection(items).ok).toBe(false);
    items[0]!.notes = "Guard missing";
    expect(canCompleteInspection(items).ok).toBe(true);
    expect(deficiencyCount(items)).toBe(1);
    expect(answeredCount(items)).toBe(items.length);
  });

  it("detects critical findings", () => {
    const items = [
      {
        id: "1",
        label: "Critical guard missing",
        critical: true,
        answer: "NO" as const,
        notes: "Broken",
      },
      {
        id: "2",
        label: "Housekeeping",
        answer: "NO" as const,
        notes: "Messy",
      },
    ];
    expect(isCriticalInspectionItem(items[0]!)).toBe(true);
    expect(criticalDeficiencyCount(items)).toBe(1);
  });

  it("validates inspector signature", () => {
    expect(hasInspectorSignature("")).toBe(false);
    expect(hasInspectorSignature("typed:")).toBe(false);
    expect(hasInspectorSignature("typed:Ada Lovelace")).toBe(true);
    expect(hasInspectorSignature("data:image/png;base64,abc")).toBe(true);
  });

  it("filters hub tabs by status and due", () => {
    const now = new Date("2026-09-10T12:00:00");
    const rows: InspectionListRecord[] = [
      { id: "1", title: "Open", status: "IN_PROGRESS" },
      {
        id: "2",
        title: "Due",
        status: "IN_PROGRESS",
        dueAt: "2026-09-10T18:00:00",
      },
      {
        id: "3",
        title: "Late",
        status: "IN_PROGRESS",
        dueAt: "2026-09-01T08:00:00",
      },
      { id: "4", title: "Done", status: "COMPLETED" },
    ];
    expect(filterInspectionsForHub(rows, "assigned", now).map((r) => r.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(filterInspectionsForHub(rows, "dueToday", now).map((r) => r.id)).toEqual(["2", "3"]);
    expect(filterInspectionsForHub(rows, "overdue", now).map((r) => r.id)).toEqual(["3"]);
    expect(filterInspectionsForHub(rows, "completed", now).map((r) => r.id)).toEqual(["4"]);
  });
});
