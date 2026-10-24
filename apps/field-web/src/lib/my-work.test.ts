import { describe, expect, it } from "vitest";
import {
  classifyDue,
  filterTasksForKind,
  filterTasksForLocation,
  filterTasksForTab,
  formatDueLabel,
  groupOpenTasks,
  parseKindFilter,
  statusLabel,
  type FieldWorkItem,
} from "./my-work";

function item(
  partial: Partial<FieldWorkItem> & Pick<FieldWorkItem, "id" | "kind" | "title">,
): FieldWorkItem {
  return {
    subtitle: null,
    dueAt: null,
    priority: null,
    status: "OPEN",
    estimatedMinutes: null,
    href: "/",
    locationName: null,
    locationId: null,
    divisionName: null,
    departmentName: null,
    ...partial,
  };
}

describe("my-work helpers", () => {
  const now = new Date("2026-08-31T10:00:00");

  it("classifies due buckets", () => {
    expect(classifyDue("2026-08-30T09:00:00", now)).toBe("overdue");
    expect(classifyDue("2026-08-31T11:00:00", now)).toBe("dueNow");
    expect(classifyDue("2026-08-31T20:00:00", now)).toBe("dueToday");
    expect(classifyDue("2026-09-05T10:00:00", now)).toBe("upcoming");
  });

  it("groups open tasks", () => {
    const grouped = groupOpenTasks(
      [
        item({
          kind: "training",
          id: "1",
          title: "A",
          dueAt: "2026-08-30T09:00:00",
          status: "NOT_STARTED",
          estimatedMinutes: 15,
          href: "/training/1/",
        }),
        item({
          kind: "corrective_action",
          id: "2",
          title: "B",
          dueAt: "2026-09-10T09:00:00",
          priority: "HIGH",
          status: "OPEN",
          estimatedMinutes: 10,
          href: "/corrective/2/",
        }),
      ],
      now,
    );
    expect(grouped.dueNow).toHaveLength(1);
    expect(grouped.upcoming).toHaveLength(1);
  });

  it("filters tabs and kinds", () => {
    const items = [
      item({
        kind: "task",
        id: "1",
        title: "Done",
        status: "COMPLETED",
      }),
      item({
        kind: "task",
        id: "2",
        title: "Late",
        dueAt: "2026-08-01T00:00:00",
        status: "OPEN",
      }),
      item({
        kind: "training",
        id: "3",
        title: "Train",
        status: "NOT_STARTED",
      }),
      item({
        kind: "inspection",
        id: "4",
        title: "Area check",
        status: "IN_PROGRESS",
      }),
    ];
    expect(filterTasksForTab(items, "completed", now)).toHaveLength(1);
    expect(filterTasksForTab(items, "overdue", now)).toHaveLength(1);
    expect(filterTasksForKind(items, "training")).toHaveLength(1);
    expect(filterTasksForKind(items, "inspections")).toHaveLength(1);
    expect(formatDueLabel("2026-08-31T07:00:00", now)).toMatch(/Due|Overdue/);
    expect(parseKindFilter("corrective")).toBe("corrective_actions");
    expect(statusLabel("IN_PROGRESS")).toBe("In Progress");
  });

  it("keeps unscoped work when filtering by location", () => {
    const items = [
      item({ kind: "task", id: "1", title: "A", locationId: "loc-1", locationName: "Stuttgart" }),
      item({ kind: "task", id: "2", title: "B", locationId: null, locationName: null }),
      item({ kind: "task", id: "3", title: "C", locationId: "loc-2", locationName: "Other" }),
    ];
    const filtered = filterTasksForLocation(items, "loc-1");
    expect(filtered.map((row) => row.id)).toEqual(["1", "2"]);
  });
});
