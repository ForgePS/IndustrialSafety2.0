import { describe, expect, it } from "vitest";
import {
  defaultDashboardLayout,
  moveDashboardItem,
  reorderDashboardItems,
  resolveDashboardLayout,
  updateDashboardItem,
  visibleDashboardItems,
  type DashboardBlockId,
} from "./dashboard-layout";

const ALL = new Set<DashboardBlockId>([
  "attention",
  "upcoming-events",
  "workspace",
  "insight-trend",
  "body-map",
]);

describe("dashboard layout", () => {
  it("defaults to available blocks only", () => {
    const layout = defaultDashboardLayout(ALL);
    expect(visibleDashboardItems(layout).map((i) => i.id)).toEqual([
      "attention",
      "upcoming-events",
      "workspace",
      "insight-trend",
      "body-map",
    ]);
  });

  it("drops unavailable blocks and appends new ones", () => {
    const layout = resolveDashboardLayout(
      {
        version: 1,
        items: [
          { id: "workspace", sortOrder: 0, size: "full", isVisible: true },
          { id: "upcoming-events", sortOrder: 1, size: "medium", isVisible: false },
        ],
      },
      ALL,
    );
    expect(layout.items.map((i) => i.id)).toEqual([
      "workspace",
      "upcoming-events",
      "attention",
      "insight-trend",
      "body-map",
    ]);
    expect(layout.items.find((i) => i.id === "upcoming-events")?.isVisible).toBe(false);
  });

  it("reorders and hides", () => {
    const base = defaultDashboardLayout(ALL);
    const reordered = reorderDashboardItems(base, ["body-map", "attention", "workspace"]);
    expect(visibleDashboardItems(reordered).map((i) => i.id)[0]).toBe("body-map");
    const hidden = updateDashboardItem(reordered, "attention", { isVisible: false });
    expect(visibleDashboardItems(hidden).map((i) => i.id)).not.toContain("attention");
    const moved = moveDashboardItem(hidden, "body-map", "down");
    expect(visibleDashboardItems(moved).map((i) => i.id)[0]).not.toBe("body-map");
  });
});
