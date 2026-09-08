import { describe, expect, it } from "vitest";
import type { WorkspaceTask } from "./types";
import { filterTasksForWidgetView, isDueThisWeek, isDueToday, summarizeTasks } from "./widget-filter";

function task(partial: Partial<WorkspaceTask> & { id: string; title: string }): WorkspaceTask {
  return {
    status: "assigned",
    priority: "Medium",
    ...partial,
  };
}

describe("tasks widget filters", () => {
  const now = new Date(2026, 8, 8, 12, 0, 0); // Tue Sep 8 2026

  const items: WorkspaceTask[] = [
    task({ id: "1", title: "Today", deadlineDate: "2026-09-08" }),
    task({ id: "2", title: "Tomorrow", deadlineDate: "2026-09-09" }),
    task({ id: "3", title: "Next week", deadlineDate: "2026-09-15" }),
    task({ id: "4", title: "Overdue", deadlineDate: "2026-09-01", overdue: true }),
    task({ id: "5", title: "Done", deadlineDate: "2026-09-08", status: "completed" }),
  ];

  it("detects due today and this week", () => {
    expect(isDueToday(items[0]!, now)).toBe(true);
    expect(isDueToday(items[1]!, now)).toBe(false);
    expect(isDueThisWeek(items[0]!, now)).toBe(true);
    expect(isDueThisWeek(items[1]!, now)).toBe(true);
    expect(isDueThisWeek(items[2]!, now)).toBe(false);
  });

  it("filters widget views", () => {
    expect(filterTasksForWidgetView(items, "today", now).map((t) => t.id)).toEqual(["1", "5"]);
    expect(filterTasksForWidgetView(items, "week", now).map((t) => t.id)).toEqual(["1", "2", "5"]);
  });

  it("summarizes open / due / overdue", () => {
    const summary = summarizeTasks(items, now);
    expect(summary.open).toBe(4);
    expect(summary.dueToday).toBe(1);
    expect(summary.dueThisWeek).toBe(2);
    expect(summary.overdue).toBe(1);
  });
});
