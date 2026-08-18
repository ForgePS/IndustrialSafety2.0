/**
 * Incident body map — OSHA-style body-part regions overlaid on the two-panel
 * "Safety Tim" figure (front on the left panel, back on the right panel).
 *
 * Each region is a rectangular hotspot expressed in percentages of its own view
 * container (0–100 on both axes), so the component can render front and back as
 * two independent figures. Sides are labeled from the worker's perspective, so
 * the worker's right arm sits on the viewer's left in the front view and on the
 * viewer's right in the back view.
 */

export type BodyView = "front" | "back";

export type BodyRegion = {
  /** Stable id persisted on the incident (e.g. "right-arm-front"). */
  id: string;
  /** Human-facing body part label. */
  part: string;
  /** Canonical OSHA body-part group used for aggregation. */
  oshaPart: string;
  view: BodyView;
  /** Hotspot rectangle, percentages of the view container. */
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * The image asset (front + back panels) served from /public. Kept outside the
 * /incidents/ prefix because the CloudFront routing function rewrites
 * /incidents/<segment> to the incident placeholder page. Background is
 * transparent so only Safety Tim paints.
 */
export const BODY_MAP_IMAGE = "/img/incident-body-map.png";

/** Natural aspect ratio (width / height) of a single panel. */
export const BODY_MAP_VIEW_ASPECT = 288 / 433;

export const BODY_VIEWS: ReadonlyArray<{ id: BodyView; label: string }> = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
];

export const BODY_REGIONS: readonly BodyRegion[] = [
  // ---- Front view (worker's right = viewer's left) ----
  { id: "head-front", part: "Head", oshaPart: "Head", view: "front", top: 2, left: 39, width: 22, height: 13 },
  { id: "face-front", part: "Face / eyes", oshaPart: "Face", view: "front", top: 8, left: 42, width: 16, height: 7 },
  { id: "neck-front", part: "Neck", oshaPart: "Neck", view: "front", top: 15, left: 43, width: 14, height: 5 },
  { id: "right-shoulder-front", part: "Right shoulder", oshaPart: "Shoulder", view: "front", top: 19, left: 28, width: 14, height: 7 },
  { id: "left-shoulder-front", part: "Left shoulder", oshaPart: "Shoulder", view: "front", top: 19, left: 58, width: 14, height: 7 },
  { id: "chest-front", part: "Chest", oshaPart: "Chest", view: "front", top: 22, left: 41, width: 18, height: 11 },
  { id: "abdomen-front", part: "Abdomen", oshaPart: "Abdomen", view: "front", top: 33, left: 41, width: 18, height: 9 },
  { id: "right-arm-front", part: "Right arm", oshaPart: "Arm", view: "front", top: 25, left: 23, width: 10, height: 17 },
  { id: "left-arm-front", part: "Left arm", oshaPart: "Arm", view: "front", top: 25, left: 67, width: 10, height: 17 },
  { id: "right-hand-front", part: "Right hand / wrist", oshaPart: "Hand", view: "front", top: 42, left: 20, width: 11, height: 9 },
  { id: "left-hand-front", part: "Left hand / wrist", oshaPart: "Hand", view: "front", top: 42, left: 69, width: 11, height: 9 },
  { id: "hips-front", part: "Hips / groin", oshaPart: "Hip", view: "front", top: 42, left: 40, width: 20, height: 8 },
  { id: "right-leg-front", part: "Right leg", oshaPart: "Leg", view: "front", top: 50, left: 37, width: 12, height: 26 },
  { id: "left-leg-front", part: "Left leg", oshaPart: "Leg", view: "front", top: 50, left: 51, width: 12, height: 26 },
  { id: "right-foot-front", part: "Right foot / ankle", oshaPart: "Foot", view: "front", top: 87, left: 35, width: 14, height: 9 },
  { id: "left-foot-front", part: "Left foot / ankle", oshaPart: "Foot", view: "front", top: 87, left: 51, width: 14, height: 9 },

  // ---- Back view (worker's right = viewer's right) ----
  { id: "head-back", part: "Head (back)", oshaPart: "Head", view: "back", top: 2, left: 39, width: 22, height: 13 },
  { id: "neck-back", part: "Neck (back)", oshaPart: "Neck", view: "back", top: 15, left: 43, width: 14, height: 5 },
  { id: "left-shoulder-back", part: "Left shoulder", oshaPart: "Shoulder", view: "back", top: 19, left: 28, width: 14, height: 7 },
  { id: "right-shoulder-back", part: "Right shoulder", oshaPart: "Shoulder", view: "back", top: 19, left: 58, width: 14, height: 7 },
  { id: "upper-back", part: "Upper back", oshaPart: "Back", view: "back", top: 22, left: 40, width: 20, height: 12 },
  { id: "lower-back", part: "Lower back", oshaPart: "Back", view: "back", top: 34, left: 41, width: 18, height: 9 },
  { id: "left-arm-back", part: "Left arm", oshaPart: "Arm", view: "back", top: 25, left: 23, width: 10, height: 17 },
  { id: "right-arm-back", part: "Right arm", oshaPart: "Arm", view: "back", top: 25, left: 67, width: 10, height: 17 },
  { id: "left-hand-back", part: "Left hand / wrist", oshaPart: "Hand", view: "back", top: 42, left: 20, width: 11, height: 9 },
  { id: "right-hand-back", part: "Right hand / wrist", oshaPart: "Hand", view: "back", top: 42, left: 69, width: 11, height: 9 },
  { id: "buttocks-back", part: "Buttocks", oshaPart: "Hip", view: "back", top: 43, left: 40, width: 20, height: 8 },
  { id: "left-leg-back", part: "Left leg", oshaPart: "Leg", view: "back", top: 51, left: 37, width: 12, height: 26 },
  { id: "right-leg-back", part: "Right leg", oshaPart: "Leg", view: "back", top: 51, left: 51, width: 12, height: 26 },
  { id: "left-foot-back", part: "Left foot / ankle", oshaPart: "Foot", view: "back", top: 87, left: 35, width: 14, height: 9 },
  { id: "right-foot-back", part: "Right foot / ankle", oshaPart: "Foot", view: "back", top: 87, left: 51, width: 14, height: 9 },
];

const REGION_BY_ID = new Map(BODY_REGIONS.map((region) => [region.id, region]));

export function regionById(id: string): BodyRegion | undefined {
  return REGION_BY_ID.get(id);
}

export function regionsForView(view: BodyView): BodyRegion[] {
  return BODY_REGIONS.filter((region) => region.view === view);
}

/** Keep only ids that map to a known region, de-duplicated and order-stable. */
export function parseBodyLocations(raw: unknown): string[] {
  const tokens = collectRawTokens(raw);
  if (tokens.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const id = resolveBodyLocationToken(token);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Pull body-location candidates from an incident payload that may use legacy
 * Firebase / import field names.
 */
export function extractBodyLocationsFromPayload(payload: Record<string, unknown>): string[] {
  const keys = [
    "bodyLocations",
    "bodyParts",
    "bodyPart",
    "affectedBodyParts",
    "injuryLocations",
    "injuryLocation",
    "body_part",
    "body_parts",
    // Safety Incidents Detail report columns
    "InjuriesFront",
    "InjuriesBack",
  ] as const;
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    for (const id of parseBodyLocations(payload[key])) {
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(id);
    }
  }
  return merged;
}

function collectRawTokens(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    // JSON array string, or comma / slash separated labels.
    if (trimmed.startsWith("[")) {
      try {
        return collectRawTokens(JSON.parse(trimmed));
      } catch {
        /* fall through */
      }
    }
    return trimmed.split(/[,;/|]+/).map((part) => part.trim()).filter(Boolean);
  }
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const entry of raw) {
      if (typeof entry === "string") {
        out.push(entry);
        continue;
      }
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const candidate =
          (typeof record.id === "string" && record.id) ||
          (typeof record.part === "string" && record.part) ||
          (typeof record.label === "string" && record.label) ||
          (typeof record.name === "string" && record.name) ||
          "";
        if (candidate) out.push(candidate);
      }
    }
    return out;
  }
  return [];
}

/** Map a region id, part label, or OSHA part name onto a canonical region id. */
export function resolveBodyLocationToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  if (REGION_BY_ID.has(trimmed)) return trimmed;

  const normalized = trimmed.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  // Exact part / osha match, prefer front view when both exist.
  const byPart = BODY_REGIONS.filter(
    (region) =>
      region.part.toLowerCase() === normalized ||
      region.oshaPart.toLowerCase() === normalized ||
      region.id.replace(/-/g, " ") === normalized,
  );
  if (byPart.length === 1) return byPart[0]!.id;
  if (byPart.length > 1) {
    return (byPart.find((r) => r.view === "front") ?? byPart[0])!.id;
  }

  // Loose contains match against part labels.
  const loose = BODY_REGIONS.filter(
    (region) =>
      normalized.includes(region.oshaPart.toLowerCase()) ||
      region.part.toLowerCase().includes(normalized) ||
      normalized.includes(region.part.toLowerCase()),
  );
  if (loose.length === 1) return loose[0]!.id;
  if (loose.length > 1) {
    return (loose.find((r) => r.view === "front") ?? loose[0])!.id;
  }

  return null;
}

export function toggleBodyLocation(list: readonly string[], id: string): string[] {
  if (!REGION_BY_ID.has(id)) return [...list];
  return list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
}

/** "Head, Right arm, Lower back" — de-duplicated by part label, view-order stable. */
export function bodyLocationSummaryLabel(list: readonly string[]): string {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const id of parseBodyLocations([...list])) {
    const region = REGION_BY_ID.get(id);
    if (!region || seen.has(region.part)) continue;
    seen.add(region.part);
    labels.push(region.part);
  }
  return labels.join(", ");
}

export type BodyLocationCount = { region: BodyRegion; count: number };

/**
 * Count how many incidents reference each region. Accepts anything with a
 * `bodyLocations` array (parsed incident records or raw rows).
 */
export function aggregateBodyLocations(
  incidents: ReadonlyArray<{ bodyLocations?: readonly string[] }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const incident of incidents) {
    for (const id of parseBodyLocations(incident.bodyLocations ? [...incident.bodyLocations] : [])) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/** Aggregate to OSHA part groups, sorted by count desc then label asc. */
export function aggregateByOshaPart(
  incidents: ReadonlyArray<{ bodyLocations?: readonly string[] }>,
): Array<{ oshaPart: string; count: number }> {
  const byPart = new Map<string, number>();
  for (const incident of incidents) {
    const parts = new Set<string>();
    for (const id of parseBodyLocations(incident.bodyLocations ? [...incident.bodyLocations] : [])) {
      const region = REGION_BY_ID.get(id);
      if (region) parts.add(region.oshaPart);
    }
    for (const part of parts) byPart.set(part, (byPart.get(part) ?? 0) + 1);
  }
  return [...byPart.entries()]
    .map(([oshaPart, count]) => ({ oshaPart, count }))
    .sort((a, b) => b.count - a.count || a.oshaPart.localeCompare(b.oshaPart));
}

export function maxRegionCount(counts: Map<string, number>): number {
  let max = 0;
  for (const value of counts.values()) if (value > max) max = value;
  return max;
}

/**
 * Bucket a region's count into a Sneat label tone for heatmap shading.
 * Empty regions return null so the caller can skip rendering a marker.
 */
export function heatTone(count: number, max: number): "info" | "warning" | "danger" | null {
  if (count <= 0 || max <= 0) return null;
  const ratio = count / max;
  if (ratio >= 0.66) return "danger";
  if (ratio >= 0.33) return "warning";
  return "info";
}

/** Injury Map year scope: current year-to-date, or a full prior/current calendar year. */
export type BodyMapYearScope = "ytd" | number;

export type BodyMapYearOption = { value: string; label: string };

function incidentYear(iso: string): number | null {
  if (!iso) return null;
  const match = /^(\d{4})/.exec(iso.trim());
  if (match) return Number(match[1]);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCFullYear();
}

/** Parse a year-dropdown value into a typed scope (defaults to YTD). */
export function parseBodyMapYearScope(raw: string | null | undefined): BodyMapYearScope {
  if (!raw || raw === "ytd") return "ytd";
  const year = Number(raw);
  if (Number.isInteger(year) && year >= 2000 && year <= 2100) return year;
  return "ytd";
}

/**
 * Build year dropdown options. Always includes current-year YTD first, then
 * distinct years present on the incident list (newest first).
 */
export function bodyMapYearOptions(
  incidents: ReadonlyArray<{ createdAt: string }>,
  now: Date = new Date(),
): BodyMapYearOption[] {
  const current = now.getFullYear();
  const years = new Set<number>([current]);
  for (const incident of incidents) {
    const year = incidentYear(incident.createdAt);
    if (year != null) years.add(year);
  }
  const sorted = [...years].sort((a, b) => b - a);
  const options: BodyMapYearOption[] = [{ value: "ytd", label: `${current} YTD` }];
  for (const year of sorted) {
    if (year === current) {
      options.push({ value: String(year), label: `${year} (full year)` });
    } else {
      options.push({ value: String(year), label: String(year) });
    }
  }
  return options;
}

/** Keep incidents whose createdAt falls in the selected year scope. */
export function filterIncidentsByYearScope<T extends { createdAt: string }>(
  incidents: readonly T[],
  scope: BodyMapYearScope,
  now: Date = new Date(),
): T[] {
  const current = now.getFullYear();
  if (scope === "ytd") {
    const start = Date.UTC(current, 0, 1);
    const end = now.getTime();
    return incidents.filter((incident) => {
      const d = new Date(incident.createdAt);
      if (Number.isNaN(d.getTime())) return false;
      const t = d.getTime();
      return d.getUTCFullYear() === current && t >= start && t <= end;
    });
  }
  return incidents.filter((incident) => incidentYear(incident.createdAt) === scope);
}

/**
 * Place a callout so the arrow tip sits on the region center and the badge
 * sits outward from Tim's torso (keeps the figure readable).
 */
export function bodyMapArrowPlacement(region: BodyRegion): {
  tipX: number;
  tipY: number;
  badgeX: number;
  badgeY: number;
  angleDeg: number;
} {
  const tipX = region.left + region.width / 2;
  const tipY = region.top + region.height / 2;
  const dx = tipX - 50;
  const dy = tipY - 42;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const offset = 9;
  return {
    tipX,
    tipY,
    badgeX: Math.min(96, Math.max(4, tipX + ux * offset)),
    badgeY: Math.min(96, Math.max(4, tipY + uy * offset)),
    // Line starts at the tip and extends outward toward the badge (0deg = right).
    angleDeg: (Math.atan2(uy, ux) * 180) / Math.PI,
  };
}

/** Incidents that mark this exact region (or the same part label on the other view). */
export function filterIncidentsByBodyRegion<
  T extends { bodyLocations?: readonly string[] },
>(incidents: readonly T[], regionId: string): T[] {
  const target = REGION_BY_ID.get(regionId);
  if (!target) return [];
  return incidents.filter((incident) => {
    const ids = parseBodyLocations(incident.bodyLocations ? [...incident.bodyLocations] : []);
    return ids.some((id) => {
      if (id === regionId) return true;
      const region = REGION_BY_ID.get(id);
      return Boolean(region && region.part === target.part);
    });
  });
}

/** Incidents that mark any region in the given OSHA body-part group. */
export function filterIncidentsByOshaPart<
  T extends { bodyLocations?: readonly string[] },
>(incidents: readonly T[], oshaPart: string): T[] {
  const target = oshaPart.trim().toLowerCase();
  if (!target) return [];
  return incidents.filter((incident) => {
    const ids = parseBodyLocations(incident.bodyLocations ? [...incident.bodyLocations] : []);
    return ids.some((id) => REGION_BY_ID.get(id)?.oshaPart.toLowerCase() === target);
  });
}
