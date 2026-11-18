import { describe, expect, it } from "vitest";
import { buildHomeStatusCards, todayWorkItems } from "./home-status";
import type { FieldMyWorkResult } from "./my-work";

describe("home-status", () => {
  const sample: FieldMyWorkResult = {
    personnelId: "p1",
    counts: {
      totalOpen: 4,
      overdue: 1,
      dueToday: 2,
      dueNow: 1,
      training: 1,
      correctiveActions: 1,
      tasks: 2,
    },
    items: [
      {
        kind: "task",
        id: "1",
        title: "First",
        subtitle: null,
        dueAt: null,
        priority: null,
        status: "OPEN",
        estimatedMinutes: null,
        href: "/tasks/item/1/",
        locationName: null,
      },
      {
        kind: "training",
        id: "2",
        title: "Second",
        subtitle: null,
        dueAt: null,
        priority: null,
        status: "NOT_STARTED",
        estimatedMinutes: 15,
        href: "/training/2/",
        locationName: null,
      },
    ],
  };

  it("builds status cards from counts", () => {
    const cards = buildHomeStatusCards(sample);
    expect(cards.find((c) => c.id === "tasks")?.count).toBe(2);
    expect(cards.find((c) => c.id === "overdue")?.tone).toBe("warn");
  });

  it("limits today items", () => {
    expect(todayWorkItems(sample, 1)).toHaveLength(1);
    expect(todayWorkItems(null)).toEqual([]);
  });
});
