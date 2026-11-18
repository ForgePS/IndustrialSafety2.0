"use client";

import { SAFETY_COLORS } from "./colors.js";
import type { MarkupTool } from "./types.js";

const FULL_TOOLS: { id: MarkupTool; label: string; shortcut?: string }[] = [
  { id: "select", label: "Select", shortcut: "V" },
  { id: "arrow", label: "Arrow", shortcut: "A" },
  { id: "line", label: "Line", shortcut: "L" },
  { id: "rectangle", label: "Rect", shortcut: "R" },
  { id: "ellipse", label: "Circle" },
  { id: "pen", label: "Draw", shortcut: "P" },
  { id: "highlighter", label: "Highlight" },
  { id: "text", label: "Text", shortcut: "T" },
  { id: "callout", label: "Callout", shortcut: "C" },
  { id: "icon", label: "Icons" },
  { id: "blur", label: "Blur" },
  { id: "redaction", label: "Redact" },
  { id: "crop", label: "Crop" },
  { id: "eraser", label: "Eraser" },
];

const QUICK_TOOLS: { id: MarkupTool; label: string }[] = [
  { id: "arrow", label: "Arrow" },
  { id: "ellipse", label: "Circle" },
  { id: "text", label: "Text" },
  { id: "icon", label: "Hazard" },
  { id: "callout", label: "Callout" },
];

type Props = {
  tool: MarkupTool;
  onToolChange: (tool: MarkupTool) => void;
  mode?: "full" | "quick";
  layout?: "side" | "bottom";
  allowedTools?: readonly MarkupTool[];
};

export function MarkupToolbar({
  tool,
  onToolChange,
  mode = "full",
  layout = "side",
  allowedTools,
}: Props) {
  const base = mode === "quick" ? QUICK_TOOLS : FULL_TOOLS;
  const tools = allowedTools ? base.filter((t) => allowedTools.includes(t.id)) : base;
  // If allowedTools filters everything from quick mode, fall back to full list filtered.
  const resolved =
    tools.length > 0
      ? tools
      : allowedTools
        ? FULL_TOOLS.filter((t) => allowedTools.includes(t.id))
        : base;

  const isBottom = layout === "bottom";

  return (
    <div
      role="toolbar"
      aria-label="Markup tools"
      style={{
        display: "flex",
        flexDirection: isBottom ? "row" : "column",
        gap: 6,
        padding: isBottom ? "8px 10px" : 8,
        overflowX: isBottom ? "auto" : undefined,
        overflowY: isBottom ? undefined : "auto",
        background: isBottom ? "#1f2937" : "#f3f4f6",
        borderRight: isBottom ? undefined : "1px solid #e5e7eb",
        borderTop: isBottom ? "1px solid #374151" : undefined,
        flexShrink: 0,
      }}
    >
      {resolved.map((t) => {
        const active = tool === t.id;
        return (
          <button
            key={t.id}
            type="button"
            title={"shortcut" in t && t.shortcut ? `${t.label} (${t.shortcut})` : t.label}
            aria-label={t.label}
            aria-pressed={active}
            onClick={() => onToolChange(t.id)}
            style={{
              minWidth: 44,
              minHeight: 44,
              padding: "6px 10px",
              borderRadius: 8,
              border: active ? "2px solid #2563eb" : "1px solid #d1d5db",
              background: active
                ? isBottom
                  ? "#1e3a8a"
                  : "#dbeafe"
                : isBottom
                  ? "#374151"
                  : "#ffffff",
              color: isBottom ? "#f9fafb" : "#111827",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: active ? 700 : 500,
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

type ColorProps = {
  color: string;
  onChange: (color: string) => void;
};

export function ColorPicker({ color, onChange }: ColorProps) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {SAFETY_COLORS.map((c) => {
        const active = color.toUpperCase() === c.hex.toUpperCase();
        return (
          <button
            key={c.id}
            type="button"
            title={c.label}
            aria-label={c.label}
            aria-pressed={active}
            onClick={() => onChange(c.hex)}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: c.hex,
              border: active
                ? "2px solid #2563eb"
                : c.hex === "#FFFFFF"
                  ? "1px solid #9ca3af"
                  : "1px solid transparent",
              outline: active ? "2px solid #93c5fd" : undefined,
              outlineOffset: 1,
              cursor: "pointer",
              padding: 0,
            }}
          />
        );
      })}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
        <span>Custom</span>
        <input
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#DC2626"}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Custom color"
          style={{
            width: 32,
            height: 28,
            border: "none",
            background: "transparent",
            cursor: "pointer",
          }}
        />
      </label>
    </div>
  );
}
