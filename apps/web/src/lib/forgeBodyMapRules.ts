/**
 * Injury body map: pure rules. Port of Forge-Platform 1.0
 * apps/industrial-web/src/lib/incident-body-map.ts.
 *
 * No server imports, so it runs under `node --experimental-strip-types` (tests/port-s7-body-map-rules.test.cjs)
 * and in client components.
 *
 * 1.0 regions are rectangular hotspots in percentages (0-100) of one view panel of the two-panel figure
 * (/img/incident-body-map.png: front on the left half, back on the right half). Sides are the worker's, so the
 * worker's right arm sits on the viewer's left in the front view and on the viewer's right in the back view.
 *
 * Kept from 1.0: regions and coordinates, region lookup, token resolution (parseBodyLocations /
 * resolveBodyLocationToken / extractBodyLocationsFromPayload), aggregation (per region, per OSHA part), heat tones,
 * the callout placement and the region / OSHA-part filters.
 * Not ported: the select-mode editing helpers (toggle, dropdown options, legacy InjuriesFront/Back writers) and the
 * calendar-year scope, which 2.0 replaces with rolling 6 / 12 month windows.
 * New in 2.0: bodyRegionsFromText (1.0 stored region ids on the incident; 2.0 records body parts as free text on
 * workers' comp and OSHA cases) and mergeBodyMapInjuries (one injury can appear as a WC case, an OSHA case and an
 * incident).
 */

export type BodyView = 'front' | 'back'

export type BodyRegion = {

  /** Stable id (e.g. "right-arm-front"). */
  id: string

  /** Human-facing body part label. */
  part: string

  /** Canonical OSHA body-part group used for aggregation. */
  oshaPart: string
  view: BodyView

  /** Hotspot rectangle, percentages of the view container. */
  top: number
  left: number
  width: number
  height: number
}

/** Two-panel figure (front left, back right), transparent background. */
export const BODY_MAP_IMAGE = '/img/incident-body-map.png'

/** Natural aspect ratio (width / height) of a single panel. */
export const BODY_MAP_VIEW_ASPECT = 288 / 433

export const BODY_VIEWS: ReadonlyArray<{ id: BodyView; label: string }> = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' }
]

const region = (id: string, part: string, oshaPart: string, view: BodyView, top: number, left: number, width: number, height: number): BodyRegion => ({
  id,
  part,
  oshaPart,
  view,
  top,
  left,
  width,
  height
})

export const BODY_REGIONS: readonly BodyRegion[] = [
  // Front view (worker's right = viewer's left)
  region('head-front', 'Head', 'Head', 'front', 3.1, 35.9, 33.7, 10.3),
  region('face-front', 'Face / eyes', 'Face', 'front', 12.8, 37.4, 29, 13.3),
  region('neck-front', 'Neck', 'Neck', 'front', 25.5, 43.3, 17.7, 4.7),
  region('right-shoulder-front', 'Right shoulder', 'Shoulder', 'front', 26.9, 30.1, 13.9, 7.5),
  region('left-shoulder-front', 'Left shoulder', 'Shoulder', 'front', 27.2, 59.1, 13.9, 7.5),
  region('chest-front', 'Chest', 'Chest', 'front', 29.6, 36.2, 31.2, 12.8),
  region('abdomen-front', 'Abdomen', 'Abdomen', 'front', 42.4, 35.2, 34.1, 9.4),
  region('right-arm-front', 'Right arm', 'Arm', 'front', 29.7, 20.5, 13.7, 24.8),
  region('left-arm-front', 'Left arm', 'Arm', 'front', 29.5, 69.3, 13.4, 24.8),
  region('right-hand-front', 'Right hand / wrist', 'Hand', 'front', 54.1, 19.1, 10.1, 9.4),
  region('left-hand-front', 'Left hand / wrist', 'Hand', 'front', 54.1, 74.2, 10.1, 9.4),
  region('hips-front', 'Hips / groin', 'Hip', 'front', 51.3, 35.2, 34, 10.4),
  region('right-leg-front', 'Right leg', 'Leg', 'front', 60.9, 35.5, 14.2, 27.5),
  region('left-leg-front', 'Left leg', 'Leg', 'front', 61.4, 56, 12.9, 25.9),
  region('right-foot-front', 'Right foot / ankle', 'Foot', 'front', 88.3, 28.5, 18.8, 7.4),
  region('left-foot-front', 'Left foot / ankle', 'Foot', 'front', 87.4, 56.2, 20.7, 8.9),

  // Back view (worker's right = viewer's right)
  region('head-back', 'Head (back)', 'Head', 'back', 2.3, 33.1, 29.2, 20.6),
  region('neck-back', 'Neck (back)', 'Neck', 'back', 22.3, 38.5, 17.8, 4.7),
  region('left-shoulder-back', 'Left shoulder', 'Shoulder', 'back', 23.7, 24.6, 14, 7.5),
  region('right-shoulder-back', 'Right shoulder', 'Shoulder', 'back', 24.8, 55.8, 14, 7.5),
  region('upper-back', 'Upper back', 'Back', 'back', 26.6, 28.5, 36.4, 18),
  region('lower-back', 'Lower back', 'Back', 'back', 44.5, 30.2, 33.9, 10.5),
  region('left-arm-back', 'Left arm', 'Arm', 'back', 28, 14.6, 14.7, 26.1),
  region('right-arm-back', 'Right arm', 'Arm', 'back', 28.6, 65.1, 14.7, 26.1),
  region('left-hand-back', 'Left hand / wrist', 'Hand', 'back', 54.2, 15, 10.2, 9.4),
  region('right-hand-back', 'Right hand / wrist', 'Hand', 'back', 54.2, 69.9, 10.2, 9.4),
  region('buttocks-back', 'Buttocks', 'Hip', 'back', 54.5, 30.2, 34.4, 8.7),
  region('left-leg-back', 'Left leg', 'Leg', 'back', 63.5, 28.9, 14, 24.9),
  region('right-leg-back', 'Right leg', 'Leg', 'back', 63.5, 50.9, 13.7, 25.3),
  region('left-foot-back', 'Left foot / ankle', 'Foot', 'back', 88.3, 20.7, 22.1, 8.1),
  region('right-foot-back', 'Right foot / ankle', 'Foot', 'back', 88.7, 50.9, 21.2, 7.6)
]

const indexRegions = (regions: readonly BodyRegion[]) => new Map(regions.map(item => [item.id, item]))

export const regionById = (id: string, regions: readonly BodyRegion[] = BODY_REGIONS) => indexRegions(regions).get(id)

export const regionsForView = (view: BodyView, regions: readonly BodyRegion[] = BODY_REGIONS) =>
  regions.filter(item => item.view === view)

/** Keep hotspot rectangles inside the 0-100 view container. */
export const clampBodyRegion = (item: BodyRegion): BodyRegion => {
  const width = Math.max(1, Math.min(100, item.width))
  const height = Math.max(1, Math.min(100, item.height))
  const left = Math.max(0, Math.min(100 - width, item.left))
  const top = Math.max(0, Math.min(100 - height, item.top))

  return { ...item, top, left, width, height }
}

const collectRawTokens = (raw: unknown): string[] => {
  if (raw == null) return []

  if (typeof raw === 'string') {
    const trimmed = raw.trim()

    if (!trimmed) return []

    // JSON array string, or comma / slash separated labels.
    if (trimmed.startsWith('[')) {
      try {
        return collectRawTokens(JSON.parse(trimmed))
      } catch {
        /* fall through */
      }
    }

    return trimmed
      .split(/[,;/|]+/)
      .map(part => part.trim())
      .filter(Boolean)
  }

  if (Array.isArray(raw)) {
    const out: string[] = []

    for (const entry of raw) {
      if (typeof entry === 'string') {
        out.push(entry)
        continue
      }

      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>

        const candidate =
          (typeof record.id === 'string' && record.id) ||
          (typeof record.part === 'string' && record.part) ||
          (typeof record.label === 'string' && record.label) ||
          (typeof record.name === 'string' && record.name) ||
          ''

        if (candidate) out.push(candidate)
      }
    }

    return out
  }

  return []
}

/** 1.0: map a region id, part label, or OSHA part name onto a canonical region id. */
export const resolveBodyLocationToken = (token: string, regions: readonly BodyRegion[] = BODY_REGIONS): string | null => {
  const trimmed = token.trim()

  if (!trimmed) return null

  const byId = indexRegions(regions)

  if (byId.has(trimmed)) return trimmed

  const normalized = trimmed.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

  // Exact part / osha match, prefer front view when both exist.
  const byPart = regions.filter(
    item => item.part.toLowerCase() === normalized || item.oshaPart.toLowerCase() === normalized || item.id.replace(/-/g, ' ') === normalized
  )

  if (byPart.length) return (byPart.find(item => item.view === 'front') ?? byPart[0])!.id

  // Loose contains match against part labels.
  const loose = regions.filter(
    item =>
      normalized.includes(item.oshaPart.toLowerCase()) ||
      item.part.toLowerCase().includes(normalized) ||
      normalized.includes(item.part.toLowerCase())
  )

  if (loose.length) return (loose.find(item => item.view === 'front') ?? loose[0])!.id

  return null
}

/** 1.0: keep only ids that map to a known region, de-duplicated and order-stable. */
export const parseBodyLocations = (raw: unknown, regions: readonly BodyRegion[] = BODY_REGIONS): string[] => {
  const seen = new Set<string>()
  const out: string[] = []

  for (const token of collectRawTokens(raw)) {
    const id = resolveBodyLocationToken(token, regions)

    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }

  return out
}

/** Payload keys 1.0 read body locations from (incident payloads, Firebase / import field names). */
export const BODY_LOCATION_PAYLOAD_KEYS = [
  'bodyLocations',
  'bodyParts',
  'bodyPart',
  'affectedBodyParts',
  'injuryLocations',
  'injuryLocation',
  'body_part',
  'body_parts',
  'body_locations',

  // Safety Incidents Detail report columns
  'InjuriesFront',
  'InjuriesBack'
] as const

/** 1.0: pull body-location candidates from an incident payload (2.0: forge_incidents.custom_data). */
export const extractBodyLocationsFromPayload = (payload: Record<string, unknown> | null | undefined, regions: readonly BodyRegion[] = BODY_REGIONS): string[] => {
  if (!payload || typeof payload !== 'object') return []

  const merged: string[] = []
  const seen = new Set<string>()

  for (const key of BODY_LOCATION_PAYLOAD_KEYS) {
    for (const id of parseBodyLocations(payload[key], regions)) {
      if (seen.has(id)) continue
      seen.add(id)
      merged.push(id)
    }
  }

  return merged
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Free text (2.0): "Laceration to left hand", "R knee, lower back", "both wrists", "back of head".               */
/* ------------------------------------------------------------------------------------------------------------ */

type PartKey =
  | 'lowerBack'
  | 'upperBack'
  | 'buttocks'
  | 'back'
  | 'head'
  | 'face'
  | 'neck'
  | 'shoulder'
  | 'chest'
  | 'abdomen'
  | 'hip'
  | 'hand'
  | 'arm'
  | 'leg'
  | 'foot'

/** Order matters: more specific phrases ("lower back", "shoulder blade") come before the general ones. */
const PART_KEYWORDS: ReadonlyArray<[PartKey, string[]]> = [
  ['lowerBack', ['lower back', 'low back', 'lumbar', 'lumbosacral', 'tailbone', 'coccyx', 'sacrum', 'sacral']],
  ['upperBack', ['upper back', 'mid back', 'middle back', 'thoracic', 'shoulder blades?', 'scapulae?']],
  ['buttocks', ['buttocks?', 'glutes?', 'gluteal']],
  ['back', ['backs?', 'spine', 'spinal']],
  ['head', ['head', 'skull', 'scalp', 'forehead', 'temple', 'concussion', 'ears?']],
  ['face', ['face', 'facial', 'eyes?', 'eyelids?', 'eyebrows?', 'nose', 'nasal', 'mouth', 'lips?', 'jaw', 'teeth', 'tooth', 'cheeks?', 'chin']],
  ['neck', ['neck', 'cervical', 'throat']],
  ['shoulder', ['shoulders?', 'rotator cuff', 'clavicles?', 'collarbones?']],
  ['chest', ['chest', 'ribs?', 'rib cage', 'sternum', 'breast', 'torso']],
  ['abdomen', ['abdomen', 'abdominal', 'stomach', 'belly', 'hernia']],
  ['hip', ['hips?', 'groin', 'pelvis', 'pelvic']],
  ['hand', ['hands?', 'wrists?', 'fingers?', 'fingertips?', 'thumbs?', 'palms?', 'knuckles?']],
  ['arm', ['upper arms?', 'arms?', 'forearms?', 'elbows?', 'biceps', 'triceps']],
  ['leg', ['legs?', 'knees?', 'kneecaps?', 'patella', 'thighs?', 'shins?', 'calf', 'calves', 'hamstrings?', 'quadriceps', 'quads?']],
  ['foot', ['foot', 'feet', 'ankles?', 'toes?', 'heels?', 'achilles']]
]

const SIDED_PARTS = new Set<PartKey>(['shoulder', 'hand', 'arm', 'leg', 'foot'])

const UNSIDED_REGION: Partial<Record<PartKey, string>> = {
  lowerBack: 'lower-back',
  upperBack: 'upper-back',
  buttocks: 'buttocks-back',

  // A bare "back" in an injury description is almost always the lumbar region.
  back: 'lower-back',
  head: 'head-front',
  face: 'face-front',
  neck: 'neck-front',
  chest: 'chest-front',
  abdomen: 'abdomen-front',
  hip: 'hips-front'
}

/** Words ending in "s" that are singular. */
const SINGULAR_S = new Set(['biceps', 'triceps', 'quadriceps', 'achilles', 'pelvis'])

const escapePhrase = (phrase: string) => phrase.replace(/ /g, '\\s+')

const TEXT_PATTERN = new RegExp(
  '\\b(?:(?<side>left|right|lt|rt|l|r|both|bilateral)|' +
    PART_KEYWORDS.map(([key, phrases]) => `(?<p_${key}>${[...phrases].sort((a, b) => b.length - a.length).map(escapePhrase).join('|')})`).join('|') +
    ')\\b',
  'gi'
)

type Side = 'left' | 'right' | 'both'

const sideOf = (word: string): Side => {
  const value = word.toLowerCase()

  if (value === 'left' || value === 'lt' || value === 'l') return 'left'
  if (value === 'right' || value === 'rt' || value === 'r') return 'right'

  return 'both'
}

/**
 * Map free-text body parts onto region ids. A side word ("left", "R", "both", "bilateral") applies to every following
 * part until the next side word; a plural with no side ("hands", "knees") marks both sides. A sided part with no side
 * at all falls back to 1.0's resolver behaviour (front view, worker's right).
 * Exact region ids and part labels ("right-hand-front", "Head (back)") resolve directly.
 */
export const bodyRegionsFromText = (text: string | null | undefined, regions: readonly BodyRegion[] = BODY_REGIONS): string[] => {
  if (!text || typeof text !== 'string') return []

  const byId = indexRegions(regions)
  const out: string[] = []

  const add = (id: string) => {
    if (byId.has(id) && !out.includes(id)) out.push(id)
  }

  let side: Side | null = null

  for (const token of text.split(/[,;/|\n]+/)) {
    const trimmed = token.trim()

    if (!trimmed) continue

    const exact = regions.find(item => item.id === trimmed || item.part.toLowerCase() === trimmed.toLowerCase())

    if (exact) {
      add(exact.id)
      continue
    }

    TEXT_PATTERN.lastIndex = 0
    let skipUntil = 0
    let match: RegExpExecArray | null

    while ((match = TEXT_PATTERN.exec(trimmed))) {
      if (match.index < skipUntil) continue

      const groups = match.groups || {}

      if (groups.side) {
        side = sideOf(groups.side)
        continue
      }

      const key = PART_KEYWORDS.find(([partKey]) => groups['p_' + partKey])?.[0]

      if (!key) continue

      const word = match[0].toLowerCase()

      // "back of the head" / "back of neck" are the back view; "back of hand" is the hand.
      if (key === 'back') {
        const after = /^\s+of\s+(?:the\s+|his\s+|her\s+|their\s+|my\s+)?(\w+)/i.exec(trimmed.slice(match.index + match[0].length))

        if (after) {
          const next = after[1]!.toLowerCase()
          const end = match.index + match[0].length + after[0].length

          if (next === 'head' || next === 'skull' || next === 'scalp') {
            add('head-back')
            skipUntil = end
          } else if (next === 'neck') {
            add('neck-back')
            skipUntil = end
          }

          continue
        }
      }

      if (!SIDED_PARTS.has(key)) {
        add(UNSIDED_REGION[key]!)
        continue
      }

      const plural = (word.endsWith('s') && !SINGULAR_S.has(word)) || word === 'feet' || word === 'calves'
      const effective: Side = side ?? (plural ? 'both' : 'right')

      if (effective === 'right' || effective === 'both') add(`right-${key}-front`)
      if (effective === 'left' || effective === 'both') add(`left-${key}-front`)
    }
  }

  return out
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Aggregation (1.0)                                                                                             */
/* ------------------------------------------------------------------------------------------------------------ */

/** "Head, Right arm, Lower back": de-duplicated by part label, order-stable. */
export const bodyLocationSummaryLabel = (list: readonly string[], regions: readonly BodyRegion[] = BODY_REGIONS) => {
  const byId = indexRegions(regions)
  const labels: string[] = []

  for (const id of parseBodyLocations([...list], regions)) {
    const item = byId.get(id)

    if (!item || labels.includes(item.part)) continue
    labels.push(item.part)
  }

  return labels.join(', ')
}

type WithLocations = { bodyLocations?: readonly string[] }

/** Count how many injuries reference each region. */
export const aggregateBodyLocations = (incidents: ReadonlyArray<WithLocations>, regions: readonly BodyRegion[] = BODY_REGIONS) => {
  const counts = new Map<string, number>()

  for (const incident of incidents) {
    for (const id of parseBodyLocations(incident.bodyLocations ? [...incident.bodyLocations] : [], regions)) {
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }

  return counts
}

/** Aggregate to OSHA part groups (once per injury), sorted by count desc then label asc. */
export const aggregateByOshaPart = (incidents: ReadonlyArray<WithLocations>, regions: readonly BodyRegion[] = BODY_REGIONS) => {
  const byId = indexRegions(regions)
  const byPart = new Map<string, number>()

  for (const incident of incidents) {
    const parts = new Set<string>()

    for (const id of parseBodyLocations(incident.bodyLocations ? [...incident.bodyLocations] : [], regions)) {
      const item = byId.get(id)

      if (item) parts.add(item.oshaPart)
    }

    for (const part of parts) byPart.set(part, (byPart.get(part) ?? 0) + 1)
  }

  return [...byPart.entries()].map(([oshaPart, count]) => ({ oshaPart, count })).sort((a, b) => b.count - a.count || a.oshaPart.localeCompare(b.oshaPart))
}

export const maxRegionCount = (counts: Map<string, number> | Record<string, number>) => {
  let max = 0

  for (const value of counts instanceof Map ? counts.values() : Object.values(counts)) if (value > max) max = value

  return max
}

export type HeatTone = 'info' | 'warning' | 'danger'

/** Bucket a region's count for heatmap shading. Empty regions return null so no marker renders. */
export const heatTone = (count: number, max: number): HeatTone | null => {
  if (count <= 0 || max <= 0) return null

  const ratio = count / max

  if (ratio >= 0.66) return 'danger'
  if (ratio >= 0.33) return 'warning'

  return 'info'
}

/** 1.0 callout placement: the tip sits on the region centre, the badge sits outward from the torso. */
export const bodyMapArrowPlacement = (item: BodyRegion) => {
  const tipX = item.left + item.width / 2
  const tipY = item.top + item.height / 2
  const dx = tipX - 50
  const dy = tipY - 42
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const offset = 9

  return {
    tipX,
    tipY,
    badgeX: Math.min(96, Math.max(4, tipX + ux * offset)),
    badgeY: Math.min(96, Math.max(4, tipY + uy * offset)),
    angleDeg: (Math.atan2(uy, ux) * 180) / Math.PI
  }
}

/** Injuries that mark this exact region (or the same part label on the other view). */
export const filterIncidentsByBodyRegion = <T extends WithLocations>(incidents: readonly T[], regionId: string, regions: readonly BodyRegion[] = BODY_REGIONS): T[] => {
  const byId = indexRegions(regions)
  const target = byId.get(regionId)

  if (!target) return []

  return incidents.filter(incident =>
    parseBodyLocations(incident.bodyLocations ? [...incident.bodyLocations] : [], regions).some(id => id === regionId || byId.get(id)?.part === target.part)
  )
}

/** Injuries that mark any region in the given OSHA body-part group. */
export const filterIncidentsByOshaPart = <T extends WithLocations>(incidents: readonly T[], oshaPart: string, regions: readonly BodyRegion[] = BODY_REGIONS): T[] => {
  const byId = indexRegions(regions)
  const target = oshaPart.trim().toLowerCase()

  if (!target) return []

  return incidents.filter(incident =>
    parseBodyLocations(incident.bodyLocations ? [...incident.bodyLocations] : [], regions).some(id => byId.get(id)?.oshaPart.toLowerCase() === target)
  )
}

/* ------------------------------------------------------------------------------------------------------------ */
/* 2.0 sources, de-duplication and periods                                                                       */
/* ------------------------------------------------------------------------------------------------------------ */

export type BodyMapSource = 'workers_comp' | 'osha' | 'incident'

export const BODY_MAP_SOURCE_LABELS: Record<BodyMapSource, string> = {
  workers_comp: "Workers' comp",
  osha: 'OSHA',
  incident: 'Incident'
}

/** One source record, before de-duplication. */
export type BodyMapSourceRow = {
  source: BodyMapSource
  recordId: string
  label: string
  href: string

  /** YYYY-MM-DD (injury date, or the incident's occurred date). */
  date: string
  bodyLocations: string[]
  incidentId?: string | null
  personnelId?: string | null
  employeeName?: string | null

  /** WC: the OSHA case it synced to. */
  oshaCaseId?: string | null
}

export type BodyMapInjury = {
  id: string
  source: BodyMapSource
  label: string
  href: string
  date: string
  bodyLocations: string[]
}

const SOURCE_PRIORITY: Record<BodyMapSource, number> = { workers_comp: 0, osha: 1, incident: 2 }

const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Count each injury once. A WC case, its OSHA case and the incident they hang off are one injury:
 * - WC and OSHA rows on the same incident merge when they name the same worker (personnel id or employee name;
 *   one incident can injure several workers);
 * - a WC case merges with the OSHA case it synced to (osha_case_id);
 * - an incident row is dropped when any WC / OSHA case links to that incident.
 * Each injury takes its body locations and link from the highest-priority row that has locations
 * (workers' comp, then OSHA, then incident). Injuries with no recognised body part are dropped.
 */
export const mergeBodyMapInjuries = (rows: readonly BodyMapSourceRow[]): BodyMapInjury[] => {
  const parent = new Map<string, string>()

  const find = (key: string): string => {
    let root = key

    while (parent.get(root) !== root) root = parent.get(root)!

    parent.set(key, root)

    return root
  }

  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a)
    if (!parent.has(b)) parent.set(b, b)
    parent.set(find(a), find(b))
  }

  const linkedIncidents = new Set(rows.filter(row => row.source !== 'incident' && row.incidentId).map(row => row.incidentId as string))
  const kept = rows.filter(row => !(row.source === 'incident' && linkedIncidents.has(row.recordId)))

  const rowKey = (row: BodyMapSourceRow) => `${row.source}:${row.recordId}`

  for (const row of kept) {
    const own = rowKey(row)

    union(own, own)

    if (row.source === 'osha') union(own, `osha:${row.recordId}`)
    if (row.source === 'workers_comp' && row.oshaCaseId) union(own, `osha:${row.oshaCaseId}`)

    if (row.source !== 'incident' && row.incidentId) {
      if (row.personnelId) union(own, `incident:${row.incidentId}:person:${row.personnelId}`)
      if (row.employeeName?.trim()) union(own, `incident:${row.incidentId}:name:${normalizeName(row.employeeName)}`)
    }
  }

  const groups = new Map<string, BodyMapSourceRow[]>()

  for (const row of kept) {
    const root = find(rowKey(row))

    groups.set(root, [...(groups.get(root) || []), row])
  }

  const injuries: BodyMapInjury[] = []

  for (const group of groups.values()) {
    const best = [...group].filter(row => row.bodyLocations.length).sort((a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source])[0]

    if (!best) continue

    injuries.push({ id: rowKey(best), source: best.source, label: best.label, href: best.href, date: best.date, bodyLocations: [...best.bodyLocations] })
  }

  return injuries.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}

export type BodyMapPeriod = '6m' | '12m' | 'all'

export const BODY_MAP_PERIODS: ReadonlyArray<{ value: BodyMapPeriod; label: string; months: number | null }> = [
  { value: '6m', label: 'Last 6 months', months: 6 },
  { value: '12m', label: 'Last 12 months', months: 12 },
  { value: 'all', label: 'All time', months: null }
]

/** `?bodyMap=` value to a period; defaults to the last 12 months. */
export const parseBodyMapPeriod = (raw: string | string[] | null | undefined): BodyMapPeriod => {
  const value = Array.isArray(raw) ? raw[0] : raw

  return BODY_MAP_PERIODS.some(item => item.value === value) ? (value as BodyMapPeriod) : '12m'
}

export const periodMonths = (period: BodyMapPeriod) => BODY_MAP_PERIODS.find(item => item.value === period)?.months ?? null

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10)

/** First day (YYYY-MM-DD, inclusive) of a rolling window of `months`, or null for all time. */
export const bodyMapWindowStart = (months: number | null | undefined, now: Date = new Date()): string | null => {
  if (!months || months <= 0) return null

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate()))

  return toIsoDate(start)
}

export type BodyMapSummary = {
  months: number | null

  /** Inclusive start date of the window, null for all time. */
  since: string | null

  /** Injuries with at least one mapped region in the window. */
  total: number

  /** Region id -> number of injuries. */
  counts: Record<string, number>
  maxCount: number

  /** Region part labels ranked by injuries (each injury counted once per label). */
  parts: Array<{ part: string; regionIds: string[]; count: number }>

  /** Most recent injuries first, capped. */
  recent: BodyMapInjury[]
}

/** Window the merged injuries and aggregate them for the card. */
export const summarizeBodyMap = (
  injuries: readonly BodyMapInjury[],
  { months = null, now = new Date(), cap = 50, regions = BODY_REGIONS }: { months?: number | null; now?: Date; cap?: number; regions?: readonly BodyRegion[] } = {}
): BodyMapSummary => {
  const since = bodyMapWindowStart(months, now)
  const byId = indexRegions(regions)

  const inWindow = injuries
    .filter(item => item.bodyLocations.some(id => byId.has(id)))
    .filter(item => !since || item.date.slice(0, 10) >= since)
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))

  const counts = Object.fromEntries(aggregateBodyLocations(inWindow, regions))
  const partCounts = new Map<string, { regionIds: string[]; count: number }>()

  for (const injury of inWindow) {
    const seen = new Set<string>()

    for (const id of injury.bodyLocations) {
      const item = byId.get(id)

      if (!item) continue

      const entry = partCounts.get(item.part) || { regionIds: [], count: 0 }

      if (!entry.regionIds.includes(id)) entry.regionIds.push(id)

      if (!seen.has(item.part)) {
        entry.count += 1
        seen.add(item.part)
      }

      partCounts.set(item.part, entry)
    }
  }

  const parts = [...partCounts.entries()]
    .map(([part, entry]) => ({ part, regionIds: entry.regionIds, count: entry.count }))
    .sort((a, b) => b.count - a.count || a.part.localeCompare(b.part))

  return {
    months: months ?? null,
    since,
    total: inWindow.length,
    counts,
    maxCount: maxRegionCount(counts),
    parts,
    recent: inWindow.slice(0, cap)
  }
}
