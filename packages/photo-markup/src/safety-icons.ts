/** Forge Safety Icon Library — SVG paths in a 24×24 viewBox. */

export type SafetyIconCategory =
  | "general"
  | "ppe"
  | "fire"
  | "electrical"
  | "loto"
  | "equipment"
  | "chemical"
  | "facility";

export type SafetyIconDef = {
  key: string;
  label: string;
  category: SafetyIconCategory;
  /** Path(s) for 24×24 viewBox */
  paths: string;
};

export const SAFETY_ICON_CATEGORIES: { id: SafetyIconCategory; label: string }[] = [
  { id: "general", label: "General" },
  { id: "ppe", label: "PPE" },
  { id: "fire", label: "Fire / Emergency" },
  { id: "electrical", label: "Electrical" },
  { id: "loto", label: "LOTO" },
  { id: "equipment", label: "Equipment" },
  { id: "chemical", label: "Chemical / Environmental" },
  { id: "facility", label: "Facility / Housekeeping" },
];

export const SAFETY_ICONS: SafetyIconDef[] = [
  // General
  { key: "warning", label: "Warning", category: "general", paths: "M12 2 L22 20 H2 Z M12 9 v5 M12 16.5 v1.5" },
  { key: "hazard", label: "Hazard", category: "general", paths: "M12 3 L21 19 H3 Z M11 9 h2 v5 h-2 Z M11 16 h2 v2 h-2 Z" },
  { key: "attention", label: "Attention", category: "general", paths: "M12 2 a10 10 0 1 0 0.01 0 M12 7 v6 M12 16 v2" },
  { key: "information", label: "Information", category: "general", paths: "M12 2 a10 10 0 1 0 0.01 0 M12 10 v7 M12 7 v1.5" },
  { key: "approved", label: "Approved", category: "general", paths: "M12 2 a10 10 0 1 0 0.01 0 M7 12 l3 3 7-7" },
  { key: "pass", label: "Pass", category: "general", paths: "M5 12 l5 5 9-9" },
  { key: "fail", label: "Fail", category: "general", paths: "M6 6 l12 12 M18 6 L6 18" },
  { key: "checkmark", label: "Checkmark", category: "general", paths: "M5 12 l5 5 9-9" },
  { key: "x", label: "X", category: "general", paths: "M6 6 l12 12 M18 6 L6 18" },
  { key: "repair", label: "Repair", category: "general", paths: "M14.7 6.3 a4 4 0 0 1 0 5.6 L9 17.6 6.4 15 12 9.4 a4 4 0 0 1 2.7-3.1 Z M6.4 15 L4 20 l5-2.4" },
  { key: "replace", label: "Replace", category: "general", paths: "M4 12 a8 8 0 0 1 14-5 M18 4 v3 h-3 M20 12 a8 8 0 0 1-14 5 M6 20 v-3 h3" },
  { key: "inspect", label: "Inspect", category: "general", paths: "M11 4 a7 7 0 1 0 0.01 0 M16.5 16.5 L21 21" },
  { key: "restricted", label: "Restricted", category: "general", paths: "M12 2 a10 10 0 1 0 0.01 0 M5 5 L19 19" },
  { key: "stop", label: "Stop", category: "general", paths: "M8 4 h8 l4 4 v8 l-4 4 H8 l-4-4 V8 Z M9 9 h6 v6 H9 Z" },

  // PPE
  { key: "hard-hat", label: "Hard Hat", category: "ppe", paths: "M4 14 h16 v2 H4 Z M6 14 V10 a6 6 0 0 1 12 0 v4 M10 8 h4" },
  { key: "safety-glasses", label: "Safety Glasses", category: "ppe", paths: "M3 12 h3 a3 3 0 0 0 6 0 h0 a3 3 0 0 0 6 0 h3 M9 12 h6" },
  { key: "hearing", label: "Hearing Protection", category: "ppe", paths: "M6 8 v8 M18 8 v8 M6 10 h2 a4 4 0 0 1 8 0 h2 M6 14 h2 a4 4 0 0 0 8 0 h2" },
  { key: "gloves", label: "Gloves", category: "ppe", paths: "M8 21 V10 l-2-2 V6 l2 1 2-3 2 3 2-1 1 2-1 2 v11 Z" },
  { key: "safety-shoes", label: "Safety Shoes", category: "ppe", paths: "M3 16 h14 l4 2 v2 H3 Z M5 16 V11 l4-3 h4 v8" },
  { key: "face-shield", label: "Face Shield", category: "ppe", paths: "M5 6 h14 v2 H5 Z M6 8 h12 v10 a2 2 0 0 1-2 2 H8 a2 2 0 0 1-2-2 Z" },
  { key: "respirator", label: "Respirator", category: "ppe", paths: "M7 10 h10 a4 4 0 0 1 0 8 H7 a4 4 0 0 1 0-8 M9 14 h6" },
  { key: "hi-vis", label: "Hi-Vis", category: "ppe", paths: "M8 4 h8 l2 6 H6 Z M6 10 h12 v10 H6 Z M10 10 v10 M14 10 v10" },
  { key: "fall-protection", label: "Fall Protection", category: "ppe", paths: "M12 3 v6 M9 9 h6 M8 9 l-3 10 M16 9 l3 10 M10 14 h4" },
  { key: "ppe-required", label: "PPE Required", category: "ppe", paths: "M12 2 a10 10 0 1 0 0.01 0 M8 14 l2-5 h4 l2 5 M10 16 h4" },

  // Fire / Emergency
  { key: "fire-extinguisher", label: "Fire Extinguisher", category: "fire", paths: "M10 3 h4 v2 h-1 v2 h3 v14 H8 V7 h3 V5 h-1 Z M11 10 h2" },
  { key: "fire-alarm", label: "Fire Alarm", category: "fire", paths: "M6 10 a6 6 0 0 1 12 0 v4 H6 Z M10 18 h4 v2 h-4 Z M9 6 l-2-2 M15 6 l2-2" },
  { key: "exit", label: "Exit", category: "fire", paths: "M4 4 h10 v16 H4 Z M9 12 h11 M16 9 l4 3-4 3" },
  { key: "emergency-exit", label: "Emergency Exit", category: "fire", paths: "M3 4 h9 v16 H3 Z M8 12 h13 M17 8 l4 4-4 4 M14 4 v4" },
  { key: "muster", label: "Muster Point", category: "fire", paths: "M12 2 L4 20 h16 Z M12 8 v6 M12 16 v2" },
  { key: "aed", label: "AED", category: "fire", paths: "M4 6 h16 v12 H4 Z M8 12 l3-4 2 6 3-4" },
  { key: "first-aid", label: "First Aid", category: "fire", paths: "M4 4 h16 v16 H4 Z M12 7 v10 M7 12 h10" },
  { key: "eyewash", label: "Eyewash", category: "fire", paths: "M4 10 h16 v2 H4 Z M8 12 v6 M16 12 v6 M7 8 a2 2 0 1 0 0.01 0 M17 8 a2 2 0 1 0 0.01 0" },
  { key: "emergency-shower", label: "Emergency Shower", category: "fire", paths: "M8 3 h8 v2 H8 Z M12 5 v4 M6 9 h12 M8 9 v10 M16 9 v10" },

  // Electrical
  { key: "electrical-hazard", label: "Electrical Hazard", category: "electrical", paths: "M13 2 L4 14 h7 l-1 8 10-14 h-7 Z" },
  { key: "high-voltage", label: "High Voltage", category: "electrical", paths: "M12 2 L3 20 h18 Z M12 9 v5 M12 16.5 v1.5 M13 2 L4 14 h7" },
  { key: "arc-flash", label: "Arc Flash", category: "electrical", paths: "M12 2 l2 7 h7 l-5.5 4 2 7 L12 16 l-5.5 4 2-7 L3 9 h7 Z" },
  { key: "lockout-required", label: "Lockout Required", category: "electrical", paths: "M8 11 V8 a4 4 0 0 1 8 0 v3 M7 11 h10 v10 H7 Z M12 15 v3" },
  { key: "electrical-panel", label: "Electrical Panel", category: "electrical", paths: "M5 3 h14 v18 H5 Z M8 7 h8 M8 11 h8 M8 15 h5" },
  { key: "damaged-cord", label: "Damaged Cord", category: "electrical", paths: "M3 12 h6 l2-3 2 6 2-3 h6 M14 8 l2 2-2 2" },

  // LOTO
  { key: "lock", label: "Lock", category: "loto", paths: "M8 11 V8 a4 4 0 0 1 8 0 v3 M7 11 h10 v10 H7 Z M12 15 v3" },
  { key: "lockout", label: "Lockout", category: "loto", paths: "M8 10 V7 a4 4 0 0 1 8 0 v3 M6 10 h12 v11 H6 Z M10 14 h4" },
  { key: "tagout", label: "Tagout", category: "loto", paths: "M4 4 h10 l6 8-6 8 H4 Z M9 11 a1.5 1.5 0 1 0 0.01 0" },
  { key: "energy-source", label: "Energy Source", category: "loto", paths: "M12 2 v6 M8 8 h8 M12 8 v6 M7 18 h10 M9 14 h6 v4 H9 Z" },
  { key: "hydraulic", label: "Hydraulic", category: "loto", paths: "M6 4 h12 v4 H6 Z M8 8 v8 M16 8 v8 M6 16 h12 v4 H6 Z" },
  { key: "pneumatic", label: "Pneumatic", category: "loto", paths: "M4 14 c0-4 4-6 8-6 s8 2 8 6 M8 14 h8 M10 10 v-3 M14 10 v-3" },
  { key: "mechanical", label: "Mechanical", category: "loto", paths: "M12 3 l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1 Z" },
  { key: "thermal", label: "Thermal", category: "loto", paths: "M12 14 a3 3 0 1 0 0.01 0 M12 3 v8 M9 6 h6" },
  { key: "chemical-energy", label: "Chemical", category: "loto", paths: "M9 3 h6 v2 l3 10 a4 4 0 0 1-4 5 h-4 a4 4 0 0 1-4-5 L9 5 Z" },
  { key: "gravity", label: "Gravity", category: "loto", paths: "M12 3 v12 M8 11 l4 4 4-4 M6 20 h12" },

  // Equipment
  { key: "forklift", label: "Forklift", category: "equipment", paths: "M3 16 h10 v-6 H8 L6 7 H3 Z M13 16 h5 l2-5 h-5 Z M6 18 a2 2 0 1 0 0.01 0 M16 18 a2 2 0 1 0 0.01 0" },
  { key: "crane", label: "Crane", category: "equipment", paths: "M4 20 V6 h2 l10-2 v2 M16 6 v10 M14 16 h4 M12 10 h2" },
  { key: "machine-guard", label: "Machine Guard", category: "equipment", paths: "M4 6 h16 v12 H4 Z M8 6 v12 M12 6 v12 M16 6 v12" },
  { key: "conveyor", label: "Conveyor", category: "equipment", paths: "M3 14 h18 v4 H3 Z M6 14 a2 2 0 1 0 0.01 0 M18 14 a2 2 0 1 0 0.01 0 M8 10 h8" },
  { key: "vehicle", label: "Vehicle", category: "equipment", paths: "M4 14 l2-5 h8 l3 5 H4 Z M5 14 v3 M19 14 v3 M7 17 a1.5 1.5 0 1 0 0.01 0 M16 17 a1.5 1.5 0 1 0 0.01 0" },
  { key: "ladder", label: "Ladder", category: "equipment", paths: "M7 3 v18 M17 3 v18 M7 7 h10 M7 11 h10 M7 15 h10 M7 19 h10" },
  { key: "scaffolding", label: "Scaffolding", category: "equipment", paths: "M4 4 h16 v4 H4 Z M4 10 h16 v4 H4 Z M4 16 h16 v4 H4 Z M6 4 v16 M18 4 v16" },
  { key: "tool", label: "Tool", category: "equipment", paths: "M14 4 l6 6-3 3-6-6 Z M11 10 L4 20 l3 0 7-10" },
  { key: "damaged-equipment", label: "Damaged Equipment", category: "equipment", paths: "M4 6 h16 v12 H4 Z M8 10 l8 6 M16 10 l-8 6" },

  // Chemical / Environmental
  { key: "chemical", label: "Chemical", category: "chemical", paths: "M9 3 h6 v2 l3 10 a4 4 0 0 1-4 5 h-4 a4 4 0 0 1-4-5 L9 5 Z M10 12 h4" },
  { key: "corrosive", label: "Corrosive", category: "chemical", paths: "M6 4 h4 v6 H6 Z M14 4 h4 v6 h-4 Z M5 14 h14 l-2 6 H7 Z" },
  { key: "flammable", label: "Flammable", category: "chemical", paths: "M12 3 c4 5 6 8 6 11 a6 6 0 0 1-12 0 c0-3 2-6 6-11" },
  { key: "toxic", label: "Toxic", category: "chemical", paths: "M12 3 a4 4 0 0 1 4 4 v1 H8 V7 a4 4 0 0 1 4-4 M8 10 h8 v2 l2 8 H6 l2-8 Z" },
  { key: "spill", label: "Spill", category: "chemical", paths: "M6 8 c0 0 2 4 6 4 s6-4 6-4 M4 16 c3-2 6-1 8 0 s5 2 8 0" },
  { key: "environmental", label: "Environmental", category: "chemical", paths: "M12 3 c-4 4-7 8-7 12 a7 7 0 0 0 14 0 c0-4-3-8-7-12" },
  { key: "waste", label: "Waste", category: "chemical", paths: "M6 7 h12 l-1 14 H7 Z M9 4 h6 v3 H9 Z M10 11 v6 M14 11 v6" },
  { key: "sds", label: "SDS", category: "chemical", paths: "M6 3 h9 l3 3 v15 H6 Z M14 3 v4 h4 M9 12 h6 M9 16 h4" },

  // Facility
  { key: "trip-hazard", label: "Trip Hazard", category: "facility", paths: "M4 18 h16 M6 18 l4-8 3 5 3-3 4 6" },
  { key: "slip-hazard", label: "Slip Hazard", category: "facility", paths: "M4 18 c4-3 8-3 12 0 M8 10 l2 4 M14 8 l3 5" },
  { key: "blocked-exit", label: "Blocked Exit", category: "facility", paths: "M4 4 h10 v16 H4 Z M9 12 h11 M16 9 l4 3-4 3 M5 5 L21 19" },
  { key: "blocked-equipment", label: "Blocked Equipment", category: "facility", paths: "M4 6 h16 v12 H4 Z M8 10 h8 M8 14 h5 M3 3 L21 21" },
  { key: "housekeeping", label: "Housekeeping", category: "facility", paths: "M4 18 h16 M6 18 V10 l6-5 6 5 v8 M10 18 v-5 h4 v5" },
  { key: "leak", label: "Leak", category: "facility", paths: "M8 4 h8 v6 a6 6 0 0 1-8 0 Z M12 16 v4 M10 20 h4" },
  { key: "water", label: "Water", category: "facility", paths: "M12 3 c4 5 6 8 6 11 a6 6 0 0 1-12 0 c0-3 2-6 6-11" },
  { key: "sanitation", label: "Sanitation", category: "facility", paths: "M8 4 h8 v2 H8 Z M7 6 h10 v2 l-1 12 H8 L7 8 Z M10 10 v6 M14 10 v6" },
  { key: "pest", label: "Pest", category: "facility", paths: "M12 8 a4 4 0 1 0 0.01 0 M8 10 L4 8 M16 10 l4-2 M8 14 L4 16 M16 14 l4 2 M12 16 v4" },
  { key: "food-safety", label: "Food Safety", category: "facility", paths: "M8 3 h2 v10 a2 2 0 0 1-2 2 Z M14 3 c3 0 4 3 4 6 v8 h-2 V9 c0-2-1-3-2-3 Z M7 18 h12" },
  { key: "grain-dust", label: "Grain Dust", category: "facility", paths: "M4 18 h16 M6 18 c2-6 4-10 6-12 2 2 4 6 6 12 M9 10 h0.5 M12 7 h0.5 M15 11 h0.5" },
];

export function getSafetyIcon(key: string): SafetyIconDef | undefined {
  return SAFETY_ICONS.find((i) => i.key === key);
}

export function searchSafetyIcons(query: string): SafetyIconDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return SAFETY_ICONS;
  return SAFETY_ICONS.filter(
    (i) =>
      i.label.toLowerCase().includes(q) ||
      i.key.includes(q) ||
      i.category.includes(q),
  );
}

/** SVG markup for an icon placed at normalized center with size. */
export function safetyIconSvgMarkup(
  iconKey: string,
  x: number,
  y: number,
  size = 0.08,
  color = "#DC2626",
  opacity = 1,
): string {
  const icon = getSafetyIcon(iconKey);
  if (!icon) return "";
  const half = size / 2;
  return [
    `<g transform="translate(${x - half} ${y - half}) scale(${size / 24})" opacity="${opacity}">`,
    `<circle cx="12" cy="12" r="11" fill="#ffffff" stroke="${color}" stroke-width="1.5" />`,
    `<path d="${icon.paths}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`,
    `</g>`,
  ].join("");
}
