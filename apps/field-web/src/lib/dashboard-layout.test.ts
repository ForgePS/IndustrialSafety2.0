import { describe, expect, it } from "vitest";
import { defaultDashboardPinnedIds } from "@/lib/dashboard-cards";
import {
  listAddableCards,
  movePinnedId,
  normalizePinnedIds,
  pinCard,
  resolvePinnedCards,
  unpinCard,
  canUseDashboardCard,
} from "@/lib/dashboard-layout";

describe("dashboard-layout", () => {
  const permissions = ["field.access", "field.hazards.create", "field.training.view"];

  it("defaults to the built-in home shortcuts", () => {
    expect(normalizePinnedIds(undefined)).toEqual(defaultDashboardPinnedIds());
  });

  it("pins a More shortcut onto the dashboard", () => {
    const next = pinCard(defaultDashboardPinnedIds(), "more-emergency");
    expect(next.at(-1)).toBe("more-emergency");
    expect(resolvePinnedCards(next, permissions).some((c) => c.id === "more-emergency")).toBe(true);
  });

  it("lists More cards that are not pinned yet", () => {
    const addable = listAddableCards(defaultDashboardPinnedIds(), permissions);
    expect(addable.some((c) => c.id === "more-emergency")).toBe(true);
    expect(addable.some((c) => c.id === "hazard")).toBe(false);
  });

  it("shows LOTO when the user has Industrial LOTO view", () => {
    expect(
      canUseDashboardCard(
        { id: "more-loto", label: "LOTO", href: "/more/loto/", permission: "field.loto.execute", source: "more" },
        ["industrial.loto.view"],
      ),
    ).toBe(true);
  });

  it("reorders pinned cards", () => {
    const pinned = pinCard(defaultDashboardPinnedIds(), "more-emergency");
    const moved = movePinnedId(pinned, "more-emergency", "up");
    expect(moved.indexOf("more-emergency")).toBe(moved.length - 2);
  });

  it("keeps at least one shortcut when unpinning", () => {
    const only = ["hazard"];
    expect(unpinCard(only, "hazard")).toEqual(defaultDashboardPinnedIds());
  });
});
