import { describe, expect, it } from "vitest";
import {
  canCompleteInspection,
  dedupeInspectionTemplates,
  defaultInspectionTitle,
  formatInspectionTitleDate,
  groupInspectionItemsBySection,
  itemsFromTemplate,
  noFindingItems,
  normalizeInspectionTemplateItems,
  templateFromLegacyRow,
  FALLBACK_INSPECTION_TEMPLATE,
} from "./inspections-module";

describe("inspections-module", () => {
  it("defaults title to yy-mm-dd Division, Department", () => {
    const d = new Date("2026-08-19T12:00:00");
    expect(formatInspectionTitleDate(d)).toBe("26-08-19");
    expect(defaultInspectionTitle("Mill", d)).toBe("26-08-19 Mill");
    expect(
      defaultInspectionTitle(
        { divisionName: "Stuttgart Green Rice", departmentName: "Rough Rice Lab" },
        d,
      ),
    ).toBe("26-08-19 Stuttgart Green Rice, Rough Rice Lab");
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

  it("dedupes templates with the same display name", () => {
    const items = [{ id: "q1", label: "Clear floors?" }];
    const result = dedupeInspectionTemplates([
      { id: "a", name: "Daily Equipment Inspection", source: "imported", items },
      {
        id: "b",
        name: "Daily Equipment Inspection (imported)",
        source: "imported",
        items: [...items, { id: "q2", label: "Guards on?" }],
      },
      { id: "c", name: "  daily   equipment inspection ", source: "imported", items },
      { id: "d", name: "Manlift Inspection Form (imported)", source: "imported", items },
    ]);
    expect(result.map((t) => t.name)).toEqual([
      "Daily Equipment Inspection",
      "Manlift Inspection Form",
    ]);
    expect(result.find((t) => t.name === "Daily Equipment Inspection")?.id).toBe("b");
  });

  it("groups checklist items by category heading", () => {
    const groups = groupInspectionItemsBySection([
      { id: "1", label: "Q1", section: "Aerial", answer: null },
      { id: "2", label: "Q2", section: "Aerial", answer: "YES" as const },
      { id: "3", label: "Q3", section: "Boilers", answer: null },
      { id: "4", label: "Q4", answer: null },
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0]?.section).toBe("Aerial");
    expect(groups[0]?.items).toHaveLength(2);
    expect(groups[1]?.section).toBe("Boilers");
    expect(groups[2]?.section).toBe("General");
  });
});
