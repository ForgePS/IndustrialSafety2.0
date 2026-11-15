export const SAFETY_COLORS = [
  { id: "red", label: "Red", hex: "#DC2626" },
  { id: "orange", label: "Orange", hex: "#EA580C" },
  { id: "yellow", label: "Yellow", hex: "#FACC15" },
  { id: "green", label: "Green", hex: "#16A34A" },
  { id: "blue", label: "Blue", hex: "#2563EB" },
  { id: "purple", label: "Purple", hex: "#7C3AED" },
  { id: "black", label: "Black", hex: "#000000" },
  { id: "white", label: "White", hex: "#FFFFFF" },
  { id: "gray", label: "Gray", hex: "#6B7280" },
] as const;

export const DEFAULT_MARKUP_COLOR = "#DC2626";

export const STROKE_WIDTHS = [1, 2, 3, 5, 8, 12, 16, 24] as const;

/** Normalized stroke width presets (fraction of min image dimension). */
export const STROKE_PRESETS = [
  { id: "thin", label: "Thin", width: 0.006 },
  { id: "medium", label: "Medium", width: 0.01 },
  { id: "thick", label: "Thick", width: 0.016 },
  { id: "extra", label: "Extra Thick", width: 0.024 },
] as const;

export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64] as const;

export const TEXT_QUICK_STYLES = [
  { id: "white-black", label: "White / Black", color: "#FFFFFF", background: "#000000" },
  { id: "black-yellow", label: "Black / Yellow", color: "#000000", background: "#FACC15" },
  { id: "white-red", label: "White / Red", color: "#FFFFFF", background: "#DC2626" },
  { id: "black-white", label: "Black / White", color: "#000000", background: "#FFFFFF" },
] as const;

export const HIGHLIGHT_DEFAULT = {
  color: "#FACC15",
  opacity: 0.4,
} as const;
