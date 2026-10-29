"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { LookupRow } from "@/lib/rms-api";
import styles from "../app/page.module.css";

export type SearchableSelectProps = {
  id?: string;
  label: string;
  placeholder?: string;
  selected: LookupRow | null;
  onSearch: (query: string) => Promise<LookupRow[]>;
  onSelect: (option: LookupRow) => void;
  onClear?: () => void;
  disabled?: boolean;
  required?: boolean;
  helpText?: string;
  minSearchLength?: number;
};

export function SearchableSelect({
  id: idProp,
  label,
  placeholder = "Search…",
  selected,
  onSearch,
  onSelect,
  onClear,
  disabled,
  required,
  helpText,
  minSearchLength = 2,
}: SearchableSelectProps) {
  const autoId = useId();
  const inputId = idProp ?? autoId;
  const listboxId = `${inputId}-listbox`;
  const [query, setQuery] = useState(selected?.label ?? "");
  const [options, setOptions] = useState<LookupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(selected?.label ?? "");
  }, [selected]);

  useEffect(() => {
    if (query.trim().length < minSearchLength) {
      setOptions([]);
      setError(null);
      return;
    }
    const handle = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const rows = await onSearch(query.trim());
          setOptions(rows);
          setActiveIndex(rows.length > 0 ? 0 : -1);
        } catch (err) {
          setOptions([]);
          setError(err instanceof Error ? err.message : "Search failed");
        } finally {
          setLoading(false);
        }
      })();
    }, 250);
    return () => clearTimeout(handle);
  }, [query, minSearchLength, onSearch]);

  const choose = useCallback(
    (option: LookupRow) => {
      onSelect(option);
      setQuery(option.label);
      setOptions([]);
      setOpen(false);
      setActiveIndex(-1);
    },
    [onSelect],
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === "Enter" && activeIndex >= 0 && options[activeIndex]) {
      event.preventDefault();
      choose(options[activeIndex]!);
    } else if (event.key === "Escape") {
      setOpen(false);
      setOptions([]);
      setActiveIndex(-1);
    }
  }

  const showEmpty =
    !loading && query.trim().length >= minSearchLength && options.length === 0 && !error;
  const statusId = `${inputId}-status`;

  return (
    <div className={styles.formRow}>
      <label htmlFor={inputId}>
        {label}
        {required ? " *" : ""}
      </label>
      <div className={styles.lookupControl}>
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
          aria-describedby={helpText || error || loading || showEmpty ? statusId : undefined}
          aria-required={required || undefined}
          disabled={disabled}
          placeholder={selected ? selected.label : placeholder}
          value={query}
          className={styles.lookupInput}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (selected && event.target.value !== selected.label) {
              onClear?.();
            }
          }}
          onFocus={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            setOpen(true);
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={onKeyDown}
        />
        {selected && onClear ? (
          <button
            type="button"
            className={styles.lookupClear}
            disabled={disabled}
            aria-label={`Clear ${label}`}
            onClick={() => {
              onClear();
              setQuery("");
              setOptions([]);
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      {helpText ? <p className={styles.fieldHelp}>{helpText}</p> : null}
      <div id={statusId} aria-live="polite">
        {loading ? <p className={styles.fieldHelp}>Searching…</p> : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {showEmpty ? <p className={styles.fieldHelp}>No results. Try a different search.</p> : null}
      </div>
      {open && options.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className={styles.lookupList}
          aria-label={`${label} options`}
        >
          {options.map((option, index) => (
            <li key={option.id} role="presentation">
              <button
                id={`${listboxId}-opt-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? styles.lookupOptionActive : undefined}
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <strong>{option.label}</strong>
                {option.subtitle ? (
                  <span className={styles.muted}> — {option.subtitle}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function PrefillBadge({ source }: { source: string }) {
  const label = source.replaceAll("_", " ").toLowerCase();
  return (
    <span className={styles.prefillBadge} title={`Prefilled from ${label}`}>
      Prefilled · {label}
    </span>
  );
}
