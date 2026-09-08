import { describe, expect, it } from "vitest";
import {
  defaultWorkspaceLayout,
  moveWorkspaceItem,
  reorderWorkspaceItems,
  resolveWorkspaceLayout,
  resetWorkspaceItem,
  updateWorkspaceItem,
  visibleWorkspaceItems,
} from "./layout";
import { buildWorkspaceRegistry } from "./registry";
import { clampWorkspaceSize, workspaceColumnSpan, workspaceRowSpan } from "./sizing";
import type { WorkspaceModuleDefinition } from "./types";

const seeds = [
  { code: "CALENDAR", name: "Calendar", route: "/modules/calendar" },
  { code: "TASKS", name: "Tasks", route: "/modules/tasks" },
  { code: "INSPECTIONS", name: "Inspections", route: "/modules/inspections" },
  { code: "MESSAGING", name: "Messaging", route: "/modules/messaging" },
  { code: "PERSONNEL", name: "Personnel", route: "/modules/personnel" },
];

function registry(): WorkspaceModuleDefinition[] {
  return buildWorkspaceRegistry(seeds, () => "bx-cube");
}

describe("buildWorkspaceRegistry", () => {
  it("enables live widgets for calendar, tasks, and phase-6 summary modules", () => {
    const defs = registry();
    expect(defs.find((d) => d.key === "CALENDAR")?.widgetEnabled).toBe(true);
    expect(defs.find((d) => d.key === "TASKS")?.supportedSizes).toContain("large");
    expect(defs.find((d) => d.key === "INSPECTIONS")?.widgetEnabled).toBe(true);
    expect(defs.find((d) => d.key === "INSPECTIONS")?.supportedViews).toEqual([
      "open",
      "due",
      "all",
    ]);
    expect(defs.find((d) => d.key === "MESSAGING")?.defaultView).toBe("unread");
    expect(defs.find((d) => d.key === "PERSONNEL")?.supportedSizes).toEqual(["compact"]);
  });
});

describe("sizing", () => {
  it("maps sizes to column and row spans", () => {
    expect(workspaceColumnSpan("compact")).toBe(1);
    expect(workspaceColumnSpan("medium")).toBe(2);
    expect(workspaceColumnSpan("full")).toBe(6);
    expect(workspaceRowSpan("large")).toBe(3);
  });

  it("clamps unsupported sizes", () => {
    expect(clampWorkspaceSize("full", ["compact", "medium"])).toBe("compact");
    expect(clampWorkspaceSize("medium", ["compact", "medium"])).toBe("medium");
  });
});

describe("resolveWorkspaceLayout", () => {
  it("defaults to all modules visible", () => {
    const layout = resolveWorkspaceLayout(null, registry());
    expect(visibleWorkspaceItems(layout).map((i) => i.moduleKey)).toEqual([
      "CALENDAR",
      "TASKS",
      "INSPECTIONS",
      "MESSAGING",
      "PERSONNEL",
    ]);
  });

  it("keeps order, drops missing modules, and appends new ones", () => {
    const layout = resolveWorkspaceLayout(
      {
        version: 1,
        items: [
          { moduleKey: "TASKS", sortOrder: 0, size: "large", isVisible: true, defaultView: "today" },
          { moduleKey: "GONE", sortOrder: 1, size: "compact", isVisible: true },
          { moduleKey: "CALENDAR", sortOrder: 2, size: "full", isVisible: true, defaultView: "week" },
        ],
      },
      registry(),
    );
    expect(layout.items.map((i) => i.moduleKey)).toEqual([
      "TASKS",
      "CALENDAR",
      "INSPECTIONS",
      "MESSAGING",
      "PERSONNEL",
    ]);
    expect(layout.items[0]?.size).toBe("large");
    expect(layout.items[4]?.isVisible).toBe(true);
  });

  it("clamps invalid sizes for compact-only modules", () => {
    const layout = resolveWorkspaceLayout(
      {
        version: 1,
        items: [{ moduleKey: "PERSONNEL", sortOrder: 0, size: "full", isVisible: true }],
      },
      registry(),
    );
    expect(layout.items.find((i) => i.moduleKey === "PERSONNEL")?.size).toBe("compact");
  });
});

describe("layout mutations", () => {
  it("updates size and view", () => {
    const base = defaultWorkspaceLayout(registry());
    const next = updateWorkspaceItem(base, "CALENDAR", { size: "large", defaultView: "month" }, registry());
    const item = next.items.find((i) => i.moduleKey === "CALENDAR");
    expect(item?.size).toBe("large");
    expect(item?.defaultView).toBe("month");
  });

  it("resets a widget to defaults", () => {
    const base = updateWorkspaceItem(
      defaultWorkspaceLayout(registry()),
      "CALENDAR",
      { size: "full", defaultView: "month" },
      registry(),
    );
    const reset = resetWorkspaceItem(base, "CALENDAR", registry());
    const item = reset.items.find((i) => i.moduleKey === "CALENDAR");
    expect(item?.size).toBe("compact");
    expect(item?.defaultView).toBe("3-day");
  });

  it("reorders and moves items", () => {
    const base = defaultWorkspaceLayout(registry());
    const reordered = reorderWorkspaceItems(base, ["PERSONNEL", "CALENDAR", "TASKS"]);
    expect(visibleWorkspaceItems(reordered).map((i) => i.moduleKey)).toEqual([
      "PERSONNEL",
      "CALENDAR",
      "TASKS",
      "INSPECTIONS",
      "MESSAGING",
    ]);
    const moved = moveWorkspaceItem(reordered, "PERSONNEL", "down");
    expect(visibleWorkspaceItems(moved).map((i) => i.moduleKey)).toEqual([
      "CALENDAR",
      "PERSONNEL",
      "TASKS",
      "INSPECTIONS",
      "MESSAGING",
    ]);
  });
});
