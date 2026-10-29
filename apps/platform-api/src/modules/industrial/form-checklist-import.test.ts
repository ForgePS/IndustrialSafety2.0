import { describe, expect, it } from "vitest";
import {
  checklistToFormTemplate,
  parseChecklistCsv,
  parseChecklistText,
  parseChecklistXlsx,
} from "./form-checklist-import.js";
import * as XLSX from "xlsx";

describe("form-checklist-import", () => {
  it("parses numbered PDF-style text lines", () => {
    const parsed = parseChecklistText(
      "Form name: Weekly safety walk\n1. Are exits clear?\n2. Is PPE stocked?",
    );
    expect(parsed.title).toBe("Weekly safety walk");
    expect(parsed.fields).toHaveLength(2);
    expect(parsed.fields[0]?.type).toBe("yesno");
    expect(parsed.fields[0]?.options).toEqual(["Yes", "No", "N/A"]);
  });

  it("parses CSV with Question header", () => {
    const parsed = parseChecklistCsv(
      "Question,Section\nAre hoses secured?,Warehouse\nIs lighting adequate?,Office",
    );
    expect(parsed.fields).toHaveLength(2);
    expect(parsed.fields[0]?.label).toBe("Are hoses secured?");
    expect(parsed.fields[0]?.section).toBe("Warehouse");
  });

  it("parses Excel first-column questions", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Question", "Section"],
      ["Fire extinguisher accessible", "Plant"],
      ["Spill kits stocked", "Plant"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Checklist");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const parsed = parseChecklistXlsx(buffer);
    expect(parsed.fields).toHaveLength(2);
    expect(parsed.fields[1]?.label).toBe("Spill kits stocked");
  });

  it("parses outline Excel: section in column A, questions in column B", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Aerial Work Platforms", ""],
      ["", "Lift inspected prior to use?"],
      ["", "Workers trained to operate lift?"],
      ["", "Good compliance/no safety violations?"],
      ["Aisles/Walkways", ""],
      ["", "Aisles kept clean and orderly?"],
      ["", "Aisles kept dry?"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Inspection Questions");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const parsed = parseChecklistXlsx(buffer);
    expect(parsed.fields).toHaveLength(5);
    expect(parsed.fields[0]?.label).toBe("Lift inspected prior to use?");
    expect(parsed.fields[0]?.section).toBe("Aerial Work Platforms");
    expect(parsed.fields[3]?.label).toBe("Aisles kept clean and orderly?");
    expect(parsed.fields[3]?.section).toBe("Aisles/Walkways");
    expect(
      parsed.fields.every((f) => !/Aerial Work Platforms|Aisles\/Walkways/.test(f.label)),
    ).toBe(true);
  });

  it("builds importable template payload", () => {
    const template = checklistToFormTemplate(
      {
        title: "Walk",
        category: null,
        fields: [
          {
            id: "item-1",
            label: "Test",
            type: "yesno",
            options: ["Yes", "No", "N/A"],
            required: true,
          },
        ],
      },
      "walk-1",
    );
    expect(template.data.name).toBe("Walk");
    expect(template.data.fields).toHaveLength(1);
  });
});
