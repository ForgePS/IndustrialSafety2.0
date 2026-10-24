"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  bodyLocationSummaryLabel,
  bodyRegionSelectOptions,
  type BodyRegion,
} from "@/lib/incident-body-map";

type Props = {
  id?: string;
  regions: readonly BodyRegion[];
  selected: readonly string[];
  onToggle: (regionId: string) => void;
  onClear?: () => void;
  disabled?: boolean;
};

/** Form-select styled dropdown with checkboxes for multi body-part selection. */
export function BodyPartMultiSelect({
  id,
  regions,
  selected,
  onToggle,
  onClear,
  disabled = false,
}: Props) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const menuId = `${fieldId}-menu`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const options = useMemo(() => bodyRegionSelectOptions(regions), [regions]);
  const front = options.filter((opt) => opt.view === "front");
  const back = options.filter((opt) => opt.view === "back");
  const summary = bodyLocationSummaryLabel(selected, regions);
  const buttonLabel =
    selected.length === 0
      ? "Select body part(s)…"
      : selected.length === 1
        ? summary
        : `${selected.length} body parts selected`;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="dropdown w-100" ref={rootRef}>
      <button
        id={fieldId}
        type="button"
        className={`form-select text-start ${selected.length === 0 ? "text-muted" : ""}`}
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        {buttonLabel}
      </button>
      {open ? (
        <div
          id={menuId}
          className="dropdown-menu show w-100 p-0 shadow"
          style={{ maxHeight: "20rem", overflowY: "auto" }}
          role="group"
          aria-label="Body parts"
        >
          <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
            <span className="small text-muted">
              {selected.length === 0 ? "Select one or more" : `${selected.length} selected`}
            </span>
            {selected.length > 0 && onClear ? (
              <button type="button" className="btn btn-sm btn-link px-0" onClick={() => onClear()}>
                Clear
              </button>
            ) : null}
          </div>
          <Group title="Front" options={front} selectedSet={selectedSet} onToggle={onToggle} />
          <Group title="Back" options={back} selectedSet={selectedSet} onToggle={onToggle} />
        </div>
      ) : null}
      {selected.length > 1 ? <div className="form-text">{summary}</div> : null}
    </div>
  );
}

function Group({
  title,
  options,
  selectedSet,
  onToggle,
}: {
  title: string;
  options: Array<{ value: string; label: string }>;
  selectedSet: Set<string>;
  onToggle: (regionId: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="px-2 py-2">
      <div className="small text-uppercase text-muted px-2 mb-1">{title}</div>
      {options.map((opt) => {
        const checked = selectedSet.has(opt.value);
        const inputId = `body-part-${opt.value}`;
        return (
          <label
            key={opt.value}
            className="dropdown-item d-flex align-items-center gap-2 rounded"
            htmlFor={inputId}
          >
            <input
              id={inputId}
              type="checkbox"
              className="form-check-input m-0"
              checked={checked}
              onChange={() => onToggle(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}
