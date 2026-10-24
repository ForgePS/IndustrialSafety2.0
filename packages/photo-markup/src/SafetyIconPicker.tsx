"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  SAFETY_ICON_CATEGORIES,
  searchSafetyIcons,
  type SafetyIconCategory,
  type SafetyIconDef,
} from "./safety-icons.js";

type Props = {
  open: boolean;
  color: string;
  onSelect: (icon: SafetyIconDef) => void;
  onClose: () => void;
};

export function SafetyIconPicker({ open, color, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SafetyIconCategory | "all">("all");

  const icons = useMemo(() => {
    const list = searchSafetyIcons(query);
    if (category === "all") return list;
    return list.filter((i) => i.category === category);
  }, [query, category]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Safety icon library"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        background: "rgba(17,24,39,0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "75%",
          background: "#ffffff",
          borderRadius: "16px 16px 0 0",
          display: "flex",
          flexDirection: "column",
          padding: 12,
          gap: 10,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ flex: 1 }}>Safety Icons</strong>
          <button type="button" onClick={onClose} style={btn}>
            Done
          </button>
        </div>
        <input
          type="search"
          placeholder="Search icons…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search safety icons"
          style={{
            minHeight: 44,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
          }}
        />
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          <Chip active={category === "all"} onClick={() => setCategory("all")} label="All" />
          {SAFETY_ICON_CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
              label={c.label}
            />
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
            gap: 8,
            overflowY: "auto",
            flex: 1,
          }}
        >
          {icons.map((icon) => (
            <button
              key={icon.key}
              type="button"
              title={icon.label}
              aria-label={icon.label}
              onClick={() => {
                onSelect(icon);
                onClose();
              }}
              style={{
                minHeight: 72,
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: 6,
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="12" r="11" fill="#fff" stroke={color} strokeWidth="1.5" />
                <path
                  d={icon.paths}
                  fill="none"
                  stroke={color}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span style={{ fontSize: 10, lineHeight: 1.2, textAlign: "center" }}>
                {icon.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 36,
        padding: "4px 12px",
        borderRadius: 999,
        border: active ? "2px solid #2563eb" : "1px solid #d1d5db",
        background: active ? "#dbeafe" : "#fff",
        whiteSpace: "nowrap",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

const btn: CSSProperties = {
  minHeight: 40,
  minWidth: 44,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
};
