"use client";

import type { ChangeEvent, ReactNode } from "react";
import type { DotFileEditSection } from "@/lib/dot-file";

type DotFileEditorProps = {
  sections: DotFileEditSection[];
  draft: Record<string, string>;
  saving: boolean;
  mergedProfile?: boolean;
  onChange: (key: string, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

function FieldInput({
  fieldKey,
  label,
  input,
  options,
  wide,
  value,
  disabled,
  onChange,
}: {
  fieldKey: string;
  label: string;
  input?: "text" | "date" | "textarea" | "select";
  options?: readonly string[];
  wide?: boolean;
  value: string;
  disabled: boolean;
  onChange: (key: string, value: string) => void;
}) {
  const id = `dot-edit-${fieldKey}`;
  const common = {
    id,
    name: fieldKey,
    className: "form-control",
    disabled,
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(fieldKey, event.target.value),
  };

  let control: ReactNode;
  if (fieldKey === "conditionSatisfactory") {
    control = (
      <select id={id} name={fieldKey} className="form-select" disabled={disabled} value={value} onChange={common.onChange}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  } else if (input === "textarea") {
    control = <textarea {...common} rows={3} />;
  } else if (input === "select" && options && options.length > 0) {
    const current = value.trim();
    const optionValues = [...options];
    if (current && !optionValues.includes(current)) {
      optionValues.push(current);
    }
    control = (
      <select id={id} name={fieldKey} className="form-select" disabled={disabled} value={value} onChange={common.onChange}>
        <option value="">—</option>
        {optionValues.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    );
  } else {
    control = <input {...common} type={input === "date" ? "date" : "text"} />;
  }

  return (
    <div className={wide ? "col-12 mb-3" : "col-md-6 mb-3"}>
      <label className="form-label text-muted small text-uppercase" htmlFor={id}>
        {label}
      </label>
      {control}
    </div>
  );
}

export function DotFileEditor({
  sections,
  draft,
  saving,
  mergedProfile,
  onChange,
  onSave,
  onCancel,
}: DotFileEditorProps) {
  return (
    <div className="card mb-4">
      <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h6 className="card-title mb-0">Edit DOT file</h6>
        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={onSave}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
      <div className="card-body">
        {mergedProfile ? (
          <p className="text-muted small mb-3">
            This profile combines multiple DOT files. Changes here apply only to the file you opened,
            not other combined records.
          </p>
        ) : null}
        {sections.map((section) => (
          <section key={section.id} className="mb-4">
            <h6 className="text-body mb-3">{section.title}</h6>
            <div className="row">
              {section.fields.map((field) => (
                <FieldInput
                  key={field.key}
                  fieldKey={field.key}
                  label={field.label}
                  {...(field.input !== undefined ? { input: field.input } : {})}
                  {...(field.options !== undefined ? { options: field.options } : {})}
                  {...(field.wide !== undefined ? { wide: field.wide } : {})}
                  value={draft[field.key] ?? ""}
                  disabled={saving}
                  onChange={onChange}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
