"use client";

import { useMemo, useState } from "react";
import { adminLabelToneClass, type AdminLabelTone } from "@/lib/admin-ui";

export type AdminSelectOption = {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
};

type Props = {
  id?: string;
  label?: string;
  options: AdminSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  maxHeight?: string;
};

/** Searchable checkbox list — easier than native multi-select for roles and permissions. */
export function AdminSearchMultiSelect({
  id,
  label,
  options,
  value,
  onChange,
  placeholder = "Search…",
  emptyMessage = "No matches.",
  maxHeight = "14rem",
}: Props) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const hay = query.trim().toLowerCase();
    if (!hay) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(hay) ||
        option.value.toLowerCase().includes(hay) ||
        (option.hint ?? "").toLowerCase().includes(hay),
    );
  }, [options, query]);

  function toggle(optionValue: string) {
    if (selected.has(optionValue)) {
      onChange(value.filter((item) => item !== optionValue));
      return;
    }
    onChange([...value, optionValue]);
  }

  return (
    <div>
      {label ? (
        <label className="form-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <div className="settings-admin-multiselect border rounded">
        <div className="settings-admin-multiselect__toolbar p-2">
          <input
            id={id}
            type="search"
            className="form-control form-control-sm"
            placeholder={placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {value.length > 0 ? (
            <div className="d-flex flex-wrap gap-1 mt-2">
              {value.map((item) => {
                const option = options.find((row) => row.value === item);
                return (
                  <button
                    key={item}
                    type="button"
                    className="settings-admin-multiselect__chip btn btn-sm border-0"
                    onClick={() => toggle(item)}
                    title="Remove"
                  >
                    {option?.label ?? item}
                    <i className="bx bx-x" />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="small text-muted mb-0 mt-2">Nothing selected yet.</p>
          )}
        </div>
        <div className="p-2" style={{ maxHeight, overflowY: "auto" }} role="listbox" aria-multiselectable>
          {filtered.length === 0 ? (
            <p className="small text-muted mb-0">{emptyMessage}</p>
          ) : (
            filtered.map((option) => (
              <label
                key={option.value}
                className={`d-flex align-items-start gap-2 py-1 px-1 rounded${option.disabled ? " text-muted" : ""}`}
                style={{ cursor: option.disabled ? "not-allowed" : "pointer" }}
              >
                <input
                  type="checkbox"
                  className="form-check-input mt-1"
                  checked={selected.has(option.value)}
                  disabled={option.disabled}
                  onChange={() => toggle(option.value)}
                />
                <span className="flex-grow-1">
                  <span className="d-block">{option.label}</span>
                  {option.hint ? <small className="text-muted">{option.hint}</small> : null}
                </span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminToneIcon({
  icon,
  tone = "primary",
}: {
  icon: string;
  tone?: AdminLabelTone;
}) {
  return (
    <span className="settings-admin-stat-icon rounded">
      <span className={`avatar-initial rounded ${adminLabelToneClass(tone)}`}>
        <i className={`bx ${icon}`} />
      </span>
    </span>
  );
}
