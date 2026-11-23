/**
 * Forge Waypoint, phase 0: pure rules for areas and Area Cards. No database, no Next. Used by the Waypoint
 * pages and actions, the public scan page (/scan/<token> for area QRs) and the unit tests.
 *
 * The status light an Area Card shows before someone walks in:
 * - red ("Stop"): the area has restricted entry, or equipment in it is locked out right now
 * - amber ("Caution"): equipment in it is out of service, or issues reported here are still open
 * - green ("Clear"): none of the above
 */

export const AREA_NAME_MAX = 120
export const AREA_CODE_MAX = 40
export const AREA_DESCRIPTION_MAX = 2000
export const AREA_LOCATOR_MAX = 300
export const AREA_NOTES_MAX = 1000
export const AREA_LIST_MAX = 30

export const WAYPOINT_HAZARD_LOOKUP = 'waypoint.hazard'
export const WAYPOINT_PPE_LOOKUP = 'waypoint.ppe'

export type AreaStatusLevel = 'clear' | 'caution' | 'stop'

export const AREA_STATUS_LABELS: Record<AreaStatusLevel, string> = {
  clear: 'Clear',
  caution: 'Caution',
  stop: 'Stop — check before entering'
}

export type AreaStatusInput = {
  restrictedEntry: boolean
  entryRequirements?: string | null

  /** LOTO applications in progress or verified on equipment in the area. */
  activeLockouts: { assetName: string }[]
  outOfService: { assetName: string }[]

  /** Issues reported from this area (or its equipment) whose Corrective Action is not closed. */
  openIssues: number
}

export type AreaStatus = {
  level: AreaStatusLevel
  label: string

  /** Plain-language reasons, most serious first. */
  reasons: string[]
}

const names = (items: { assetName: string }[]) => {
  const list = items.map(item => item.assetName).filter(Boolean)

  if (list.length <= 3) return list.join(', ')

  return `${list.slice(0, 3).join(', ')} and ${list.length - 3} more`
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * The status light. `detailed` lists equipment names; without it (anonymous scanners) only counts are given,
 * so nobody learns what equipment a company has without identifying.
 */
export const areaStatus = (input: AreaStatusInput, { detailed = true }: { detailed?: boolean } = {}): AreaStatus => {
  const reasons: string[] = []

  if (input.restrictedEntry) {
    const requirement = (input.entryRequirements || '').trim()

    reasons.push(requirement ? `Restricted entry: ${requirement}` : 'Restricted entry. Authorized people only.')
  }

  if (input.activeLockouts.length) {
    reasons.push(
      detailed
        ? `Locked out now: ${names(input.activeLockouts)}`
        : `${plural(input.activeLockouts.length, 'piece of equipment is', 'pieces of equipment are')} locked out now`
    )
  }

  const stop = reasons.length > 0

  if (input.outOfService.length) {
    reasons.push(
      detailed
        ? `Out of service: ${names(input.outOfService)}`
        : `${plural(input.outOfService.length, 'piece of equipment is', 'pieces of equipment are')} out of service`
    )
  }

  if (input.openIssues > 0) reasons.push(`${plural(input.openIssues, 'open issue', 'open issues')} reported here`)

  const level: AreaStatusLevel = stop ? 'stop' : reasons.length ? 'caution' : 'clear'

  return { level, label: AREA_STATUS_LABELS[level], reasons }
}

/** CAPA statuses that still count as open for the status light. */
export const OPEN_CAPA_STATUSES = ['open', 'in_progress', 'pending_verification'] as const

/** LOTO application statuses that mean equipment is locked out right now. */
export const ACTIVE_LOTO_STATUSES = ['in_progress', 'verified'] as const

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type AreaInput = {
  name: string
  code: string | null
  locationId: string
  description: string | null
  hazards: string[]
  requiredPpe: string[]
  restrictedEntry: boolean
  entryRequirements: string | null
  nearestExit: string | null
  musterPoint: string | null
  nearestEyewash: string | null
  nearestExtinguisher: string | null
  nearestFirstAid: string | null
  emergencyNotes: string | null
}

export type AreaRow = {
  name: string
  code: string | null
  location_id: string
  description: string | null
  hazards: string[]
  required_ppe: string[]
  restricted_entry: boolean
  entry_requirements: string | null
  nearest_exit: string | null
  muster_point: string | null
  nearest_eyewash: string | null
  nearest_extinguisher: string | null
  nearest_first_aid: string | null
  emergency_notes: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '')

const optional = (value: unknown) => text(value) || null

const bool = (value: unknown) => value === true || value === 'true' || value === 'on' || value === '1'

/** Keeps only known option keys, once each, in the order given. */
export const pickOptionKeys = (value: unknown, allowed: readonly string[]) => {
  const list = Array.isArray(value) ? value : typeof value === 'string' && value ? value.split(',') : []
  const known = new Set(allowed)

  return [...new Set(list.map(item => text(item)).filter(item => known.has(item)))].slice(0, AREA_LIST_MAX)
}

/**
 * Validates a submitted area. Hazard and PPE keys outside the tenant's lookups are dropped, not errors: an
 * option a tenant hid since the form loaded should not block saving.
 */
export const parseAreaInput = (
  raw: Record<string, unknown>,
  { hazardKeys, ppeKeys }: { hazardKeys: readonly string[]; ppeKeys: readonly string[] }
): { ok: true; value: AreaInput } | { ok: false; errors: Record<string, string> } => {
  const errors: Record<string, string> = {}
  const name = text(raw.name)
  const code = optional(raw.code)
  const locationId = text(raw.locationId)

  if (!name) errors.name = 'Enter a name for the area.'
  else if (name.length > AREA_NAME_MAX) errors.name = `Use ${AREA_NAME_MAX} characters or fewer.`

  if (code && code.length > AREA_CODE_MAX) errors.code = `Use ${AREA_CODE_MAX} characters or fewer.`
  if (!UUID.test(locationId)) errors.locationId = 'Choose the location this area is in.'

  const description = optional(raw.description)

  if (description && description.length > AREA_DESCRIPTION_MAX)
    errors.description = `Use ${AREA_DESCRIPTION_MAX} characters or fewer.`

  const restrictedEntry = bool(raw.restrictedEntry)
  const entryRequirements = optional(raw.entryRequirements)

  if (entryRequirements && entryRequirements.length > AREA_NOTES_MAX)
    errors.entryRequirements = `Use ${AREA_NOTES_MAX} characters or fewer.`

  const locators = {
    nearestExit: optional(raw.nearestExit),
    musterPoint: optional(raw.musterPoint),
    nearestEyewash: optional(raw.nearestEyewash),
    nearestExtinguisher: optional(raw.nearestExtinguisher),
    nearestFirstAid: optional(raw.nearestFirstAid)
  }

  for (const [key, value] of Object.entries(locators)) {
    if (value && value.length > AREA_LOCATOR_MAX) errors[key] = `Use ${AREA_LOCATOR_MAX} characters or fewer.`
  }

  const emergencyNotes = optional(raw.emergencyNotes)

  if (emergencyNotes && emergencyNotes.length > AREA_NOTES_MAX)
    errors.emergencyNotes = `Use ${AREA_NOTES_MAX} characters or fewer.`

  if (Object.keys(errors).length) return { ok: false, errors }

  return {
    ok: true,
    value: {
      name,
      code,
      locationId,
      description,
      hazards: pickOptionKeys(raw.hazards, hazardKeys),
      requiredPpe: pickOptionKeys(raw.requiredPpe, ppeKeys),
      restrictedEntry,
      entryRequirements,
      ...locators,
      emergencyNotes
    }
  }
}

export const areaInputToRow = (value: AreaInput): AreaRow => ({
  name: value.name,
  code: value.code,
  location_id: value.locationId,
  description: value.description,
  hazards: value.hazards,
  required_ppe: value.requiredPpe,
  restricted_entry: value.restrictedEntry,
  entry_requirements: value.entryRequirements,
  nearest_exit: value.nearestExit,
  muster_point: value.musterPoint,
  nearest_eyewash: value.nearestEyewash,
  nearest_extinguisher: value.nearestExtinguisher,
  nearest_first_aid: value.nearestFirstAid,
  emergency_notes: value.emergencyNotes
})

const FIELD_LABELS: Record<keyof AreaRow, string> = {
  name: 'name',
  code: 'code',
  location_id: 'location',
  description: 'description',
  hazards: 'hazards',
  required_ppe: 'required PPE',
  restricted_entry: 'restricted entry',
  entry_requirements: 'entry requirements',
  nearest_exit: 'nearest exit',
  muster_point: 'muster point',
  nearest_eyewash: 'nearest eyewash',
  nearest_extinguisher: 'nearest extinguisher',
  nearest_first_aid: 'nearest first aid',
  emergency_notes: 'emergency notes'
}

/** Fields that differ between a stored row and an update, for the audit log and activity message. */
export const changedAreaFields = (before: Partial<AreaRow>, after: AreaRow) =>
  (Object.keys(after) as (keyof AreaRow)[]).filter(
    key => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)
  )

export const describeAreaChanges = (fields: (keyof AreaRow)[]) =>
  fields.length ? `Updated ${fields.map(field => FIELD_LABELS[field]).join(', ')}.` : 'No changes.'

/** The emergency rows on an Area Card, in reading order, skipping blanks. */
export const areaEmergencyRows = (
  area: Pick<
    AreaRow,
    'nearest_exit' | 'muster_point' | 'nearest_eyewash' | 'nearest_extinguisher' | 'nearest_first_aid'
  >
) =>
  (
    [
      ['Nearest exit', area.nearest_exit],
      ['Muster point', area.muster_point],
      ['Eyewash / shower', area.nearest_eyewash],
      ['Fire extinguisher', area.nearest_extinguisher],
      ['First aid / AED', area.nearest_first_aid]
    ] as const
  )
    .filter(([, value]) => Boolean(value && value.trim()))
    .map(([label, value]) => ({ label, value: (value as string).trim() }))

/** Labels for stored option keys; keys the tenant no longer has show as written (never dropped silently). */
export const optionLabels = (keys: readonly string[], options: { key: string; label: string }[]) => {
  const byKey = new Map(options.map(option => [option.key, option.label]))

  return keys.map(key => ({ key, label: byKey.get(key) || key.replaceAll('_', ' ') }))
}
