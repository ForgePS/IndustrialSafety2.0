/**
 * Platform default body map regions. Kept in sync with industrial-web
 * `BODY_REGIONS` — geometry only; labels and ids must remain stable.
 */
export type IncidentBodyRegion = {
  id: string;
  part: string;
  oshaPart: string;
  view: "front" | "back";
  top: number;
  left: number;
  width: number;
  height: number;
};

export const DEFAULT_INCIDENT_BODY_REGIONS: readonly IncidentBodyRegion[] = [
  {
    id: "head-front",
    part: "Head",
    oshaPart: "Head",
    view: "front",
    top: 3.1,
    left: 35.9,
    width: 33.7,
    height: 10.3,
  },
  {
    id: "face-front",
    part: "Face / eyes",
    oshaPart: "Face",
    view: "front",
    top: 12.8,
    left: 37.4,
    width: 29,
    height: 13.3,
  },
  {
    id: "neck-front",
    part: "Neck",
    oshaPart: "Neck",
    view: "front",
    top: 25.5,
    left: 43.3,
    width: 17.7,
    height: 4.7,
  },
  {
    id: "right-shoulder-front",
    part: "Right shoulder",
    oshaPart: "Shoulder",
    view: "front",
    top: 26.9,
    left: 30.1,
    width: 13.9,
    height: 7.5,
  },
  {
    id: "left-shoulder-front",
    part: "Left shoulder",
    oshaPart: "Shoulder",
    view: "front",
    top: 27.2,
    left: 59.1,
    width: 13.9,
    height: 7.5,
  },
  {
    id: "chest-front",
    part: "Chest",
    oshaPart: "Chest",
    view: "front",
    top: 29.6,
    left: 36.2,
    width: 31.2,
    height: 12.8,
  },
  {
    id: "abdomen-front",
    part: "Abdomen",
    oshaPart: "Abdomen",
    view: "front",
    top: 42.4,
    left: 35.2,
    width: 34.1,
    height: 9.4,
  },
  {
    id: "right-arm-front",
    part: "Right arm",
    oshaPart: "Arm",
    view: "front",
    top: 29.7,
    left: 20.5,
    width: 13.7,
    height: 24.8,
  },
  {
    id: "left-arm-front",
    part: "Left arm",
    oshaPart: "Arm",
    view: "front",
    top: 29.5,
    left: 69.3,
    width: 13.4,
    height: 24.8,
  },
  {
    id: "right-hand-front",
    part: "Right hand / wrist",
    oshaPart: "Hand",
    view: "front",
    top: 54.1,
    left: 19.1,
    width: 10.1,
    height: 9.4,
  },
  {
    id: "left-hand-front",
    part: "Left hand / wrist",
    oshaPart: "Hand",
    view: "front",
    top: 54.1,
    left: 74.2,
    width: 10.1,
    height: 9.4,
  },
  {
    id: "hips-front",
    part: "Hips / groin",
    oshaPart: "Hip",
    view: "front",
    top: 51.3,
    left: 35.2,
    width: 34,
    height: 10.4,
  },
  {
    id: "right-leg-front",
    part: "Right leg",
    oshaPart: "Leg",
    view: "front",
    top: 60.9,
    left: 35.5,
    width: 14.2,
    height: 27.5,
  },
  {
    id: "left-leg-front",
    part: "Left leg",
    oshaPart: "Leg",
    view: "front",
    top: 61.4,
    left: 56,
    width: 12.9,
    height: 25.9,
  },
  {
    id: "right-foot-front",
    part: "Right foot / ankle",
    oshaPart: "Foot",
    view: "front",
    top: 88.3,
    left: 28.5,
    width: 18.8,
    height: 7.4,
  },
  {
    id: "left-foot-front",
    part: "Left foot / ankle",
    oshaPart: "Foot",
    view: "front",
    top: 87.4,
    left: 56.2,
    width: 20.7,
    height: 8.9,
  },
  {
    id: "head-back",
    part: "Head (back)",
    oshaPart: "Head",
    view: "back",
    top: 2.3,
    left: 33.1,
    width: 29.2,
    height: 20.6,
  },
  {
    id: "neck-back",
    part: "Neck (back)",
    oshaPart: "Neck",
    view: "back",
    top: 22.3,
    left: 38.5,
    width: 17.8,
    height: 4.7,
  },
  {
    id: "left-shoulder-back",
    part: "Left shoulder",
    oshaPart: "Shoulder",
    view: "back",
    top: 23.7,
    left: 24.6,
    width: 14,
    height: 7.5,
  },
  {
    id: "right-shoulder-back",
    part: "Right shoulder",
    oshaPart: "Shoulder",
    view: "back",
    top: 24.8,
    left: 55.8,
    width: 14,
    height: 7.5,
  },
  {
    id: "upper-back",
    part: "Upper back",
    oshaPart: "Back",
    view: "back",
    top: 26.6,
    left: 28.5,
    width: 36.4,
    height: 18,
  },
  {
    id: "lower-back",
    part: "Lower back",
    oshaPart: "Back",
    view: "back",
    top: 44.5,
    left: 30.2,
    width: 33.9,
    height: 10.5,
  },
  {
    id: "left-arm-back",
    part: "Left arm",
    oshaPart: "Arm",
    view: "back",
    top: 28,
    left: 14.6,
    width: 14.7,
    height: 26.1,
  },
  {
    id: "right-arm-back",
    part: "Right arm",
    oshaPart: "Arm",
    view: "back",
    top: 28.6,
    left: 65.1,
    width: 14.7,
    height: 26.1,
  },
  {
    id: "left-hand-back",
    part: "Left hand / wrist",
    oshaPart: "Hand",
    view: "back",
    top: 54.2,
    left: 15,
    width: 10.2,
    height: 9.4,
  },
  {
    id: "right-hand-back",
    part: "Right hand / wrist",
    oshaPart: "Hand",
    view: "back",
    top: 54.2,
    left: 69.9,
    width: 10.2,
    height: 9.4,
  },
  {
    id: "buttocks-back",
    part: "Buttocks",
    oshaPart: "Hip",
    view: "back",
    top: 54.5,
    left: 30.2,
    width: 34.4,
    height: 8.7,
  },
  {
    id: "left-leg-back",
    part: "Left leg",
    oshaPart: "Leg",
    view: "back",
    top: 63.5,
    left: 28.9,
    width: 14,
    height: 24.9,
  },
  {
    id: "right-leg-back",
    part: "Right leg",
    oshaPart: "Leg",
    view: "back",
    top: 63.5,
    left: 50.9,
    width: 13.7,
    height: 25.3,
  },
  {
    id: "left-foot-back",
    part: "Left foot / ankle",
    oshaPart: "Foot",
    view: "back",
    top: 88.3,
    left: 20.7,
    width: 22.1,
    height: 8.1,
  },
  {
    id: "right-foot-back",
    part: "Right foot / ankle",
    oshaPart: "Foot",
    view: "back",
    top: 88.7,
    left: 50.9,
    width: 21.2,
    height: 7.6,
  },
];

export const INCIDENT_BODY_REGION_IDS = DEFAULT_INCIDENT_BODY_REGIONS.map((region) => region.id);

function clampPercent(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampRegion(region: IncidentBodyRegion): IncidentBodyRegion {
  const width = clampPercent(region.width, 1, 100);
  const height = clampPercent(region.height, 1, 100);
  const left = clampPercent(region.left, 0, 100 - width);
  const top = clampPercent(region.top, 0, 100 - height);
  return { ...region, top, left, width, height };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate and normalize a tenant body-map payload against platform defaults. */
export function normalizeIncidentBodyRegions(raw: unknown): IncidentBodyRegion[] {
  if (!Array.isArray(raw)) {
    throw new Error("regions must be an array");
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.id !== "string") continue;
    byId.set(entry.id, entry);
  }

  return DEFAULT_INCIDENT_BODY_REGIONS.map((baseline) => {
    const saved = byId.get(baseline.id);
    if (!saved) return { ...baseline };

    const top = Number(saved.top);
    const left = Number(saved.left);
    const width = Number(saved.width);
    const height = Number(saved.height);
    if (![top, left, width, height].every((value) => Number.isFinite(value))) {
      throw new Error(`Invalid geometry for region ${baseline.id}`);
    }

    return clampRegion({
      ...baseline,
      part: typeof saved.part === "string" && saved.part.trim() ? saved.part.trim() : baseline.part,
      oshaPart:
        typeof saved.oshaPart === "string" && saved.oshaPart.trim()
          ? saved.oshaPart.trim()
          : baseline.oshaPart,
      view: saved.view === "back" ? "back" : "front",
      top,
      left,
      width,
      height,
    });
  });
}
