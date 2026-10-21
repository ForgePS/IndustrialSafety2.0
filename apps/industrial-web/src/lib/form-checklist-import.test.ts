import { describe, expect, it } from "vitest";
import { parseChecklistCsv } from "./form-checklist-import";

describe("form-checklist-import (web)", () => {
  it("parses CSV with Question header and skips answer columns", () => {
    const parsed = parseChecklistCsv(
      "Question,Yes,No,N/A,Notes\nAre exits clear?,,,,\nIs PPE stocked?,,,,",
      "Walk",
    );
    expect(parsed.fields).toHaveLength(2);
    expect(parsed.fields[0]?.type).toBe("yesno");
  });

  it("parses single-column CSV without headers", () => {
    const parsed = parseChecklistCsv("Are hoses secured?\nIs lighting adequate?", "Walk");
    expect(parsed.fields).toHaveLength(2);
  });
});
