"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  FORM_BUILDER_FIELD_TYPES,
  changeFormBuilderFieldType,
  createFormBuilderField,
  formBuilderFieldTypeLabel,
  moveFormBuilderField,
  slugifyFormFieldId,
} from "@/lib/form-builder";
import type { FormField, FormFieldType } from "@/lib/forms-module";

export type FormBuilderModalMode = "edit" | "duplicate" | "create";

type FormBuilderModalProps = {
  mode: FormBuilderModalMode;
  title: string;
  category: string;
  fields: FormField[];
  saving: boolean;
  onChangeTitle: (value: string) => void;
  onChangeCategory: (value: string) => void;
  onChangeFields: (fields: FormField[]) => void;
  onSave: () => void;
  onCancel: () => void;
};

function modeHeading(mode: FormBuilderModalMode): string {
  switch (mode) {
    case "duplicate":
      return "Duplicate and edit form";
    case "create":
      return "Create form";
    default:
      return "Edit form";
  }
}

export function FormBuilderModal({
  mode,
  title,
  category,
  fields,
  saving,
  onChangeTitle,
  onChangeCategory,
  onChangeFields,
  onSave,
  onCancel,
}: FormBuilderModalProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const usedIds = useMemo(() => new Set(fields.map((field) => field.id)), [fields]);

  function addField(type: FormFieldType) {
    const field = createFormBuilderField(type, fields.length);
    let id = field.id;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${field.id}-${suffix}`;
      suffix += 1;
    }
    const next = [...fields, { ...field, id }];
    onChangeFields(next);
    setExpandedId(id);
  }

  function updateField(index: number, patch: Partial<FormField>) {
    const next = fields.map((field, i) => {
      if (i !== index) return field;
      const merged = { ...field, ...patch };
      if (patch.label && patch.label !== field.label && !patch.id) {
        merged.id = slugifyFormFieldId(patch.label, index);
      }
      return merged;
    });
    onChangeFields(next);
  }

  function changeFieldType(index: number, newType: FormFieldType) {
    const field = fields[index];
    if (!field || field.type === newType) return;
    const next = fields.map((row, i) =>
      i === index ? changeFormBuilderFieldType(row, newType) : row,
    );
    onChangeFields(next);
  }

  function removeField(index: number) {
    onChangeFields(fields.filter((_, i) => i !== index));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onSave();
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-builder-modal-title"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onCancel}
      onKeyDown={(ev) => {
        if (ev.key === "Escape" && !saving) onCancel();
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable"
        role="document"
        onClick={(ev) => ev.stopPropagation()}
      >
        <form className="modal-content" onSubmit={onSubmit} aria-label={modeHeading(mode)}>
          <div className="modal-header">
            <div>
              <h5 className="modal-title mb-0" id="form-builder-modal-title">
                {modeHeading(mode)}
              </h5>
              <p className="text-muted small mb-0 mt-1">
                Add questions and fields — no coding required.
              </p>
            </div>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              disabled={saving}
              onClick={onCancel}
            />
          </div>
          <div className="modal-body">
            <div className="row g-3 mb-4">
              <div className="col-md-7">
                <label className="form-label" htmlFor="builder-form-title">
                  Form name
                </label>
                <input
                  id="builder-form-title"
                  className="form-control"
                  required
                  disabled={saving}
                  value={title}
                  onChange={(ev) => onChangeTitle(ev.target.value)}
                />
              </div>
              <div className="col-md-5">
                <label className="form-label" htmlFor="builder-form-category">
                  Category
                </label>
                <input
                  id="builder-form-category"
                  className="form-control"
                  disabled={saving}
                  value={category}
                  onChange={(ev) => onChangeCategory(ev.target.value)}
                  placeholder="Safety, HR, Inspection…"
                />
              </div>
            </div>

            <div className="mb-4">
              <h6 className="mb-2">Add a field</h6>
              <div className="d-flex flex-wrap gap-2">
                {FORM_BUILDER_FIELD_TYPES.map((option) => (
                  <button
                    key={option.type}
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    disabled={saving}
                    title={option.description}
                    onClick={() => addField(option.type)}
                  >
                    <i className={`bx ${option.icon} me-1`} aria-hidden="true" />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {fields.length === 0 ? (
              <div className="text-center py-4 border rounded bg-label-secondary">
                <p className="text-muted mb-0">
                  No fields yet. Choose a field type above to start building.
                </p>
              </div>
            ) : (
              <div className="vstack gap-3">
                {fields.map((field, index) => {
                  const expanded = expandedId === field.id;
                  return (
                    <div className="card border shadow-none" key={`${field.id}-${index}`}>
                      <div className="card-body py-3">
                        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-2">
                          <div className="min-w-0">
                            <span className="badge bg-label-primary me-2">
                              {formBuilderFieldTypeLabel(field.type)}
                            </span>
                            <span className="fw-medium">{field.label || "Untitled field"}</span>
                            {field.required ? (
                              <span className="text-danger ms-1" title="Required">
                                *
                              </span>
                            ) : null}
                          </div>
                          <div className="d-flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              disabled={saving || index === 0}
                              aria-label="Move up"
                              onClick={() => onChangeFields(moveFormBuilderField(fields, index, -1))}
                            >
                              <i className="bx bx-up-arrow-alt" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              disabled={saving || index === fields.length - 1}
                              aria-label="Move down"
                              onClick={() => onChangeFields(moveFormBuilderField(fields, index, 1))}
                            >
                              <i className="bx bx-down-arrow-alt" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              disabled={saving}
                              onClick={() => setExpandedId(expanded ? null : field.id)}
                            >
                              {expanded ? "Collapse" : "Edit"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              disabled={saving}
                              aria-label="Remove field"
                              onClick={() => removeField(index)}
                            >
                              <i className="bx bx-trash" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        {expanded ? (
                          <div className="row g-3 pt-2 border-top">
                            <div className="col-md-4">
                              <label className="form-label small" htmlFor={`field-type-${field.id}`}>
                                Question type
                              </label>
                              <select
                                id={`field-type-${field.id}`}
                                className="form-select form-select-sm"
                                disabled={saving}
                                value={field.type}
                                onChange={(ev) =>
                                  changeFieldType(index, ev.target.value as FormFieldType)
                                }
                              >
                                {FORM_BUILDER_FIELD_TYPES.map((option) => (
                                  <option key={option.type} value={option.type}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="col-md-8">
                              <label className="form-label small" htmlFor={`field-label-${field.id}`}>
                                Question / label
                              </label>
                              <input
                                id={`field-label-${field.id}`}
                                className="form-control form-control-sm"
                                disabled={saving}
                                value={field.label}
                                onChange={(ev) => updateField(index, { label: ev.target.value })}
                              />
                            </div>
                            {field.type !== "content" && field.type !== "label" ? (
                              <div className="col-md-4 d-flex align-items-end">
                                <div className="form-check mb-2">
                                  <input
                                    id={`field-required-${field.id}`}
                                    type="checkbox"
                                    className="form-check-input"
                                    disabled={saving || field.type === "employeeNumber"}
                                    checked={Boolean(field.required)}
                                    onChange={(ev) =>
                                      updateField(index, { required: ev.target.checked })
                                    }
                                  />
                                  <label
                                    className="form-check-label"
                                    htmlFor={`field-required-${field.id}`}
                                  >
                                    Required
                                  </label>
                                </div>
                              </div>
                            ) : null}
                            {field.type === "checkbox" ? (
                              <div className="col-12">
                                <p className="form-label small mb-1">Preview</p>
                                <div className="border rounded p-3 bg-label-secondary">
                                  <div className="form-check mb-0">
                                    <input
                                      id={`field-preview-${field.id}`}
                                      type="checkbox"
                                      className="form-check-input"
                                      disabled
                                    />
                                    <label
                                      className="form-check-label"
                                      htmlFor={`field-preview-${field.id}`}
                                    >
                                      {field.label || "I agree"}
                                    </label>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                            {field.type === "select" ? (
                              <div className="col-12">
                                <label className="form-label small" htmlFor={`field-options-${field.id}`}>
                                  Dropdown options (one per line)
                                </label>
                                <textarea
                                  id={`field-options-${field.id}`}
                                  className="form-control form-control-sm"
                                  rows={3}
                                  disabled={saving}
                                  value={(field.options ?? []).join("\n")}
                                  onChange={(ev) =>
                                    updateField(index, {
                                      options: ev.target.value
                                        .split("\n")
                                        .map((line) => line.trim())
                                        .filter(Boolean),
                                    })
                                  }
                                />
                              </div>
                            ) : null}
                            {field.type === "location" ? (
                              <div className="col-12">
                                <p className="text-muted small mb-0">
                                  Options are loaded from your company locations (Settings →
                                  Dropdowns → Locations / sites).
                                </p>
                              </div>
                            ) : null}
                            {field.type === "employeeNumber" ? (
                              <div className="col-12">
                                <p className="text-muted small mb-0">
                                  When filled, this number looks up Personnel and attaches the
                                  submission to that employee&apos;s file.
                                </p>
                              </div>
                            ) : null}
                            {field.type === "content" ? (
                              <div className="col-12">
                                <label className="form-label small" htmlFor={`field-content-${field.id}`}>
                                  Instructions text
                                </label>
                                <textarea
                                  id={`field-content-${field.id}`}
                                  className="form-control form-control-sm"
                                  rows={4}
                                  disabled={saving}
                                  value={field.content ?? ""}
                                  onChange={(ev) => updateField(index, { content: ev.target.value })}
                                />
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="modal-footer flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={saving}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || fields.length === 0}>
              {saving
                ? "Saving…"
                : mode === "edit"
                  ? "Save form"
                  : mode === "duplicate"
                    ? "Save copy"
                    : "Create form"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
