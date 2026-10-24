import { describe, expect, it } from "vitest";
import {
  answeredProgress,
  buildFormAnswersPayload,
  extractFormFields,
  hydrateFormAnswers,
  isFieldVisible,
  validateFormAnswers,
  yesNoNotesFieldId,
  type FieldFormField,
} from "./field-forms";

describe("extractFormFields", () => {
  it("reads fields from schemaJson", () => {
    const fields = extractFormFields({
      schemaJson: {
        fields: [
          { id: "name", label: "Name", type: "text", required: true },
          { id: "ok", label: "All clear?", type: "yesno" },
          { id: "sig", label: "Signature", type: "signature" },
          { id: "photo", label: "Photo evidence", type: "photo" },
        ],
      },
    });
    expect(fields.map((f) => f.type)).toEqual(["text", "yesno", "signature", "photo"]);
    expect(fields[0]?.required).toBe(true);
  });

  it("infers signature and photo from labels", () => {
    const fields = extractFormFields({
      schemaJson: {
        fields: [
          { id: "a", label: "Worker signature" },
          { id: "b", label: "Site photo" },
        ],
      },
    });
    expect(fields[0]?.type).toBe("signature");
    expect(fields[1]?.type).toBe("photo");
  });

  it("parses sections and visibleWhen", () => {
    const fields = extractFormFields({
      schemaJson: {
        sections: [
          {
            title: "Follow-up",
            fields: [
              {
                id: "detail",
                label: "Explain",
                type: "textarea",
                visibleWhen: { fieldId: "ok", equals: "NO" },
              },
            ],
          },
        ],
      },
    });
    expect(fields[0]?.section).toBe("Follow-up");
    expect(fields[0]?.visibleWhen).toEqual({ fieldId: "ok", equals: "NO" });
  });

  it("falls back to default org-aware fields", () => {
    const fields = extractFormFields({});
    expect(fields.some((f) => f.type === "location")).toBe(true);
    expect(fields.some((f) => f.type === "division")).toBe(true);
    expect(fields.some((f) => f.type === "department")).toBe(true);
  });
});

describe("conditional visibility + validation", () => {
  const fields: FieldFormField[] = [
    { id: "ok", label: "Clear?", type: "yesno", required: true },
    {
      id: "detail",
      label: "Explain",
      type: "textarea",
      required: true,
      visibleWhen: { fieldId: "ok", equals: "NO" },
    },
  ];

  it("hides conditional fields until trigger matches", () => {
    expect(isFieldVisible(fields[1]!, { ok: "YES" })).toBe(false);
    expect(isFieldVisible(fields[1]!, { ok: "NO" })).toBe(true);
  });

  it("requires notes when Yes/No is No", () => {
    const result = validateFormAnswers(fields, { ok: "NO", [yesNoNotesFieldId("ok")]: "" });
    expect(result.ok).toBe(false);
  });

  it("validates required conditional fields when visible", () => {
    const result = validateFormAnswers(fields, {
      ok: "NO",
      [yesNoNotesFieldId("ok")]: "Hazard found",
      detail: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldId).toBe("detail");
  });

  it("passes when conditional field answered", () => {
    const result = validateFormAnswers(fields, {
      ok: "NO",
      [yesNoNotesFieldId("ok")]: "Hazard found",
      detail: "Fixed valve",
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("hydrate and payload", () => {
  const fields: FieldFormField[] = [
    { id: "name", label: "Name", type: "text" },
    { id: "done", label: "Done", type: "checkbox" },
    { id: "ok", label: "OK?", type: "yesno" },
  ];

  it("hydrates checkbox and yesno notes", () => {
    const answers = hydrateFormAnswers(
      { name: "Ada", done: true, ok: "NO", [yesNoNotesFieldId("ok")]: "Leak" },
      fields,
    );
    expect(answers.done).toBe("true");
    expect(answers.ok).toBe("NO");
    expect(answers[yesNoNotesFieldId("ok")]).toBe("Leak");
  });

  it("builds API payload with typed values", () => {
    const payload = buildFormAnswersPayload(
      {
        name: "Ada",
        done: "true",
        ok: "YES",
      },
      fields,
    );
    expect(payload).toEqual({ name: "Ada", done: true, ok: "YES" });
  });

  it("tracks progress", () => {
    const progress = answeredProgress(fields, { name: "Ada", done: "", ok: "" });
    expect(progress.answered).toBe(1);
    expect(progress.total).toBe(3);
  });
});
