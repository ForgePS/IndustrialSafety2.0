import { describe, expect, it } from "vitest";
import {
  changeFormBuilderFieldType,
  createFormBuilderField,
  duplicateFormFieldsForCopy,
  duplicateFormTitle,
  moveFormBuilderField,
  slugifyFormFieldId,
} from "./form-builder";

describe("form-builder", () => {
  it("creates typed fields with defaults", () => {
    const yesno = createFormBuilderField("yesno", 0);
    expect(yesno.type).toBe("yesno");
    expect(yesno.required).toBe(true);

    const select = createFormBuilderField("select", 1);
    expect(select.options).toEqual(["Option 1", "Option 2"]);
  });

  it("slugifies field ids from labels", () => {
    expect(slugifyFormFieldId("Fire Extinguisher Check", 0)).toBe("fire-extinguisher-check-1");
  });

  it("duplicates fields with new ids", () => {
    const copy = duplicateFormFieldsForCopy([
      { id: "old-1", label: "Item A", type: "yesno", required: true },
      { id: "old-2", label: "Notes", type: "textarea" },
    ]);
    expect(copy).toHaveLength(2);
    expect(copy[0]?.id).toBe("item-a-1");
    expect(copy[0]?.label).toBe("Item A");
    expect(copy[1]?.id).toBe("notes-2");
  });

  it("prefixes duplicate form titles once", () => {
    expect(duplicateFormTitle("Safety checklist")).toBe("Copy of Safety checklist");
    expect(duplicateFormTitle("Copy of Safety checklist")).toBe("Copy of Safety checklist");
  });

  it("moves fields up and down", () => {
    const fields = [
      { id: "a", label: "A", type: "text" as const },
      { id: "b", label: "B", type: "text" as const },
    ];
    expect(moveFormBuilderField(fields, 1, -1).map((f) => f.id)).toEqual(["b", "a"]);
  });

  it("changes field type and applies defaults", () => {
    const text = { id: "q-1", label: "Notes", type: "text" as const, required: true };
    expect(changeFormBuilderFieldType(text, "yesno")).toEqual({
      id: "q-1",
      label: "Notes",
      type: "yesno",
      required: true,
    });

    const select = changeFormBuilderFieldType(text, "select");
    expect(select.type).toBe("select");
    expect(select.options).toEqual(["Option 1", "Option 2"]);
    expect(select.content).toBeUndefined();

    const content = changeFormBuilderFieldType(
      { id: "q-1", label: "Policy", type: "select", options: ["A", "B"], required: true },
      "content",
    );
    expect(content.type).toBe("content");
    expect(content.content).toBeTruthy();
    expect(content.options).toBeUndefined();
    expect(content.required).toBeUndefined();
  });

  it("creates label headings without required flag", () => {
    const heading = createFormBuilderField("label", 0);
    expect(heading.type).toBe("label");
    expect(heading.required).toBeUndefined();
    expect(changeFormBuilderFieldType(heading, "text").type).toBe("text");
  });

  it("creates location fields without static options", () => {
    const location = createFormBuilderField("location", 0);
    expect(location.type).toBe("location");
    expect(location.options).toBeUndefined();
    expect(changeFormBuilderFieldType(location, "select").options).toEqual([
      "Option 1",
      "Option 2",
    ]);
  });

  it("creates Employee # fields that link to personnel", () => {
    const field = createFormBuilderField("employeeNumber", 0);
    expect(field.type).toBe("employeeNumber");
    expect(field.id).toBe("employeeNumber");
    expect(field.label).toBe("Employee #");
    expect(field.required).toBe(true);
    expect(
      changeFormBuilderFieldType({ id: "q", label: "Emp", type: "text" }, "employeeNumber"),
    ).toEqual({
      id: "q",
      label: "Emp",
      type: "employeeNumber",
      required: true,
    });
  });
});
