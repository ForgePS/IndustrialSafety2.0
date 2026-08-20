import { describe, expect, it } from "vitest";
import {
  canCompleteInspection,
  defaultInspectionTitle,
  formatInspectionTitleDate,
  itemsFromTemplate,
  noFindingItems,
  normalizeInspectionTemplateItems,
  templateFromLegacyRow,
  FALLBACK_INSPECTION_TEMPLATE,
} from "./inspections-module";

describe("inspections-module", () => {
  it("defaults title to yy-mm-dd Department", () => {
    const d = new Date("2026-08-19T12:00:00");
    expect(formatInspectionTitleDate(d)).toBe("26-08-19");
    expect(defaultInspectionTitle("Mill", d)).toBe("26-08-19 Mill");
  });

  it("normalizes nested legacy sections into checklist items", () => {
    const items = normalizeInspectionTemplateItems({
      sections: [
        {
          title: "Housekeeping",
          questions: [{ id: "q1", text: "Floors clear?" }, { label: "Trash emptied?" }],
        },
        { name: "PPE", items: ["Hard hats worn", { prompt: "Safety glasses available" }] },
      ],
    });
    expect(items.map((i) => i.label)).toEqual([
      "Floors clear?",
      "Trash emptied?",
      "Hard hats worn",
      "Safety glasses available",
    ]);
    expect(items[0]?.section).toBe("Housekeeping");
  });

  it("builds a template from an imported row", () => {
    const template = templateFromLegacyRow({
      id: "t1",
      title: "Warehouse daily",
      sourcePayload: {
        departmentName: "Warehouse",
        checklist: ["Aisles clear", "Forklift charged"],
      },
    });
    expect(template?.name).toBe("Warehouse daily");
    expect(template?.departmentHint).toBe("Warehouse");
    expect(template?.items).toHaveLength(2);
  });

  it("requires notes on No findings before complete", () => {
    const items = itemsFromTemplate(FALLBACK_INSPECTION_TEMPLATE).map((item, index) => ({
      ...item,
      answer: (index === 0 ? "NO" : "YES") as "YES" | "NO",
      notes: index === 0 ? "" : "",
    }));
    expect(canCompleteInspection(items).ok).toBe(false);
    items[0]!.notes = "Spill near dock";
    expect(canCompleteInspection(items).ok).toBe(true);
    expect(noFindingItems(items)).toHaveLength(1);
  });
});
