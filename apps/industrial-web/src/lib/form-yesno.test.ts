import { describe, expect, it } from "vitest";
import { validateYesNoFormFields, yesNoNotesFieldId } from "./form-yesno";
import type { FormField } from "./forms-module";

describe("form-yesno", () => {
  const field: FormField = {
    id: "item-1",
    label: "Are exits clear?",
    type: "yesno",
    options: ["Yes", "No", "N/A"],
    required: true,
  };

  it("requires a note when answered No", () => {
    const notesId = yesNoNotesFieldId(field.id);
    expect(
      validateYesNoFormFields([field], { [field.id]: "NO", [notesId]: "" }).ok,
    ).toBe(false);
    expect(
      validateYesNoFormFields([field], { [field.id]: "NO", [notesId]: "Blocked aisle" }).ok,
    ).toBe(true);
  });
});
