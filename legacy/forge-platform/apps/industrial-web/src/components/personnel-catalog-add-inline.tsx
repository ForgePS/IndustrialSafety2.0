"use client";

import { useState } from "react";

type PersonnelCatalogAddInlineProps = {
  label: string;
  disabled?: boolean;
  busy?: boolean;
  onAdd: (name: string) => Promise<void>;
};

/** Inline control to append a division, department, or position to the org catalog. */
export function PersonnelCatalogAddInline({
  label,
  disabled,
  busy,
  onAdd,
}: PersonnelCatalogAddInlineProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (disabled) return null;

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAdd(trimmed);
      setName("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add.");
    } finally {
      setSaving(false);
    }
  }

  const blocked = busy || saving;

  return (
    <div className="mt-2">
      {!open ? (
        <button
          type="button"
          className="btn btn-sm btn-link p-0 align-baseline"
          onClick={() => setOpen(true)}
          disabled={blocked}
        >
          + Add {label}
        </button>
      ) : (
        <div className="d-flex flex-column gap-2">
          <div className="d-flex flex-wrap gap-2 align-items-start">
            <input
              type="text"
              className="form-control form-control-sm"
              style={{ minWidth: "12rem", flex: "1 1 12rem" }}
              placeholder={`New ${label}`}
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              disabled={blocked}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => void submit()}
              disabled={blocked}
            >
              {saving ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => {
                setOpen(false);
                setName("");
                setError(null);
              }}
              disabled={blocked}
            >
              Cancel
            </button>
          </div>
          {error ? <div className="text-danger small">{error}</div> : null}
        </div>
      )}
    </div>
  );
}
