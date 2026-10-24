"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../primitives.js";

export type ForgeCommandItem = {
  id: string;
  label: string;
  group: string;
  subtitle?: string;
  disabled?: boolean;
};

export function ForgeCommandPalette({
  open,
  onClose,
  query,
  onQueryChange,
  items,
  onSelect,
  placeholder = "Search or jump to…",
  emptyLabel = "No results",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  items: ForgeCommandItem[];
  onSelect: (item: ForgeCommandItem) => void;
  placeholder?: string;
  emptyLabel?: string;
  loading?: boolean;
}) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const flat = useMemo(() => items.filter((i) => !i.disabled), [items]);
  const grouped = useMemo(() => {
    const map = new Map<string, ForgeCommandItem[]>();
    for (const item of items) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [items]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, items]);

  useEffect(() => {
    if (!open) return;
    function onDocKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onDocKey);
    return () => window.removeEventListener("keydown", onDocKey);
  }, [open, onClose]);

  if (!open) return null;

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(flat.length - 1, i + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = flat[activeIndex];
      if (item) onSelect(item);
    }
  }

  let running = 0;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <button
        type="button"
        aria-label="Close command palette"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          padding: 0,
          margin: 0,
          background: "transparent",
          cursor: "default",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="forge-card"
        style={{
          position: "relative",
          width: "min(36rem, calc(100vw - 2rem))",
          maxHeight: "70vh",
          overflow: "auto",
          boxShadow: "var(--forge-shadow-lg)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: "1rem" }}>
            Search
          </h2>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        <label
          htmlFor="forge-command-palette-input"
          style={{ display: "block", marginTop: "0.75rem" }}
        >
          <span className="forge-visually-hidden">Command</span>
          <input
            id="forge-command-palette-input"
            ref={inputRef}
            className="forge-input"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            style={{ width: "100%" }}
          />
        </label>
        {loading ? <p style={{ marginTop: "0.75rem" }}>Searching…</p> : null}
        {!loading && flat.length === 0 ? (
          <p style={{ marginTop: "0.75rem", color: "var(--forge-color-muted)" }}>{emptyLabel}</p>
        ) : null}
        <div role="listbox" aria-label="Results" style={{ marginTop: "0.75rem" }}>
          {grouped.map(([group, groupItems]) => (
            <div key={group} style={{ marginBottom: "0.75rem" }}>
              <div
                style={{
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--forge-color-muted)",
                  marginBottom: "0.35rem",
                }}
              >
                {group}
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {groupItems.map((item) => {
                  const index = item.disabled ? -1 : running++;
                  const active = index >= 0 && index === activeIndex;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        disabled={item.disabled}
                        onClick={() => onSelect(item)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "0.55rem 0.65rem",
                          border: "1px solid transparent",
                          borderRadius: "0.4rem",
                          background: active
                            ? "var(--forge-color-surface-muted, #f1f5f9)"
                            : "transparent",
                          cursor: item.disabled ? "not-allowed" : "pointer",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{item.label}</div>
                        {item.subtitle ? (
                          <div style={{ fontSize: "0.85rem", color: "var(--forge-color-muted)" }}>
                            {item.subtitle}
                          </div>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
