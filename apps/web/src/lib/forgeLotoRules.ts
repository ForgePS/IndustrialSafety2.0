/**
 * Pure Lockout / Tagout rules shared by pages, server actions, the printable sheet and tests.
 * Ported from Industrial 1.0 (legacy/forge-platform/apps/industrial-web/src/lib/loto.ts,
 * loto-image-annotations.ts and apps/platform-api/src/modules/industrial/loto-print.ts).
 */

// ---------------------------------------------------------------------------
// Energy letters and colours
// ---------------------------------------------------------------------------

export type LotoEnergyLetter = 'E' | 'P' | 'H' | 'W' | 'C' | 'G' | 'M' | 'T' | 'CG'

export const LOTO_ENERGY_LETTER_META: Record<LotoEnergyLetter, { bg: string; fg: string; label: string }> = {
  E: { bg: '#dc2626', fg: '#ffffff', label: 'Electrical' },
  P: { bg: '#2563eb', fg: '#ffffff', label: 'Pneumatic' },
  C: { bg: '#ea580c', fg: '#ffffff', label: 'Chemical' },
  G: { bg: '#eab308', fg: '#111827', label: 'Gravity' },
  M: { bg: '#7c3aed', fg: '#ffffff', label: 'Mechanical' },
  T: { bg: '#111827', fg: '#ffffff', label: 'Thermal' },
  W: { bg: '#16a34a', fg: '#ffffff', label: 'Water' },
  CG: { bg: '#800000', fg: '#ffffff', label: 'Controlled Gravity' },
  H: { bg: '#92400e', fg: '#ffffff', label: 'Hydraulic' }
}

/** 2.0 energy-type lookup keys mapped to 1.0's letters. */
const ENERGY_TYPE_LETTER: Record<string, LotoEnergyLetter> = {
  electrical: 'E',
  pneumatic: 'P',
  hydraulic: 'H',
  water: 'W',
  chemical: 'C',
  gravity: 'G',
  controlled_gravity: 'CG',
  mechanical: 'M',
  thermal: 'T'
}

/**
 * The letter for an energy source. A tag code ("E-4 480V", "CG-1") wins; otherwise the energy type
 * (2.0 lookup key or 1.0 free-text name) decides.
 */
export const lotoEnergyLetter = (code?: string | null, energyType?: string | null): LotoEnergyLetter | null => {
  const cleanCode = typeof code === 'string' ? code.trim().toUpperCase() : ''

  if (cleanCode) {
    const match = cleanCode.match(/^(CG)(?=[\s\-_0-9]|$)/) || cleanCode.match(/^([EPHWGMT]|C)(?=[\s\-_0-9]|$)/)

    if (match?.[1]) return match[1] as LotoEnergyLetter
  }

  const name = typeof energyType === 'string' ? energyType.trim().toLowerCase() : ''

  if (!name) return null
  if (ENERGY_TYPE_LETTER[name]) return ENERGY_TYPE_LETTER[name]
  if (name.includes('controlled gravity') || name === 'cg') return 'CG'
  if (name.includes('electric')) return 'E'
  if (name.includes('pneumatic') || /\bair\b/.test(name)) return 'P'
  if (name.includes('hydraulic')) return 'H'
  if (name.includes('water')) return 'W'
  if (name.includes('chemical')) return 'C'
  if (name.includes('gravity')) return 'G'
  if (name.includes('mechanic')) return 'M'
  if (name.includes('thermal') || name.includes('heat') || name.includes('steam')) return 'T'

  return null
}

export const lotoEnergyBadge = (code?: string | null, energyType?: string | null) => {
  const letter = lotoEnergyLetter(code, energyType)

  if (!letter) return { letter: null, bg: '#475569', fg: '#ffffff', label: 'Energy' }

  return { letter, ...LOTO_ENERGY_LETTER_META[letter] }
}

// ---------------------------------------------------------------------------
// Procedure content defaults (1.0 text)
// ---------------------------------------------------------------------------

export type LotoPrecaution = { key: string; category: string; text: string }
export type LotoSequenceStep = { step: string; description: string }
export type LotoRestorationCheck = { key: string; label: string }

export const LOTO_DEFAULT_PRECAUTIONS: Array<LotoPrecaution & { shortName: string }> = [
  { key: 'machine-general', shortName: 'Machine / general', category: 'General', text: 'Ensure machine has come to a complete stop before proceeding.' },
  { key: 'capacitor', shortName: 'Capacitor', category: 'Electrical', text: 'This machine has internal capacitors. You must ensure they are fully discharged before proceeding.' },
  { key: 'chiller', shortName: 'Chiller', category: 'Thermal', text: 'This machine is capable of generating extremely cold temperatures. Allow it to return to room temperature before proceeding.' },
  { key: 'injection-molder', shortName: 'Injection Molder', category: 'Thermal', text: 'Machine generates extreme heat and pressure. Ensure pressure has vented and press is room temperature before proceeding.' },
  { key: 'piping-systems', shortName: 'Piping Systems', category: 'Hydraulic', text: 'Piping systems can store energy hydraulically. Ensure pressures are isolated and/or have been relieved before proceeding.' },
  { key: 'crane', shortName: 'Crane', category: 'Mechanical', text: 'Crane is suspended overhead. Unload and secure crane before proceeding.' },
  { key: 'pneumatic-equipment', shortName: 'Pneumatic Equipment', category: 'Pneumatic', text: 'Pneumatic equipment can store energy. Ensure pressures have bled off before proceeding.' },
  { key: 'steam-pressure-hazard', shortName: 'Steam Pressure Hazard', category: 'Thermal', text: 'Steam pressure and burn hazard. Ensure steam and heat have dissipated before proceeding.' },
  { key: 'thermal-energy-hazard', shortName: 'Thermal Energy Hazard', category: 'Thermal', text: 'Thermal energy and burn hazard. Ensure heat has dissipated before proceeding.' },
  { key: 'raised-load', shortName: 'Raised Load', category: 'Mechanical', text: 'Potential energy is stored with a raised load. Lower unit to lowest position or block in place before proceeding.' },
  { key: 'confined-space', shortName: 'Confined Space', category: 'General', text: 'Confined Space. Authorized personnel only. Permits are required before entering. Follow all Confined Space procedures.' },
  { key: 'fans', shortName: 'Fans', category: 'Mechanical', text: 'Ensure fan has come to a complete stop before proceeding.' },
  { key: 'chemical-hazards', shortName: 'Chemical hazards', category: 'Chemical', text: 'Chemical hazard - reference SDS. Wear proper PPE. Ensure ventilation is adequate and all chemicals are accounted for before proceeding.' },
  { key: 'hydraulic', shortName: 'Hydraulic', category: 'Hydraulic', text: 'Hydraulic equipment can store energy. Ensure to relieve pressure per manufacturers instruction.' },
  { key: 'hydraulic-pneumatic', shortName: 'Hydraulic pneumatic', category: 'Hydraulic', text: 'Hydraulic and pneumatic equipment can store energy. Ensure to relieve pressure per manufacturers instruction.' },
  { key: 'refrigeration', shortName: 'Refrigeration', category: 'Chemical', text: 'Refrigerant gas present. Authorized personnel only to service equipment.' },
  { key: 'radiation', shortName: 'Radiation', category: 'General', text: 'Radiation present. Authorized personnel only to service equipment.' },
  { key: 'flammable-gases-liquids', shortName: 'Flammable gases / liquids', category: 'Chemical', text: 'Flammable gases or liquids present. Ensure all lines have been purged prior to servicing.' },
  { key: 'working-at-heights', shortName: 'Working at heights', category: 'General', text: 'Proper use of mobile lift or ladder required.' },
  { key: 'pinch-point-hazard', shortName: 'Pinch Point Hazard', category: 'Mechanical', text: 'Pinch point hazard. Ensure equipment has come to a complete stop before proceeding. Shutdown adjacent equipment to avoid potential injury.' },
  { key: 'upstream-downstream', shortName: 'Upstream/Downstream', category: 'General', text: 'Upstream and downstream equipment may also require LOTO before performing service.' },
  { key: 'plc-controlled-equipment', shortName: 'PLC Controlled Equipment', category: 'Electrical', text: 'Electricity is controlled via PLC. Ensure with the operator that the equipment is switched OFF at the control system.' },
  { key: 'interconnected-equipment', shortName: 'Interconnected Equipment', category: 'Mechanical', text: 'Beware of pinch points. Nearby, interconnected, and adjacent machinery must also be de-energized and locked out.' }
]

export const LOTO_DEFAULT_PRINT_PURPOSE =
  'To protect authorized employees against unexpected or unplanned activation of equipment or energy while servicing equipment.'

export const LOTO_DEFAULT_PRINT_SCOPE =
  'Utilize this procedure for all scheduled PM shutdowns, any maintenance task that requires you to place your body in harms way of the equipment, or if you have to leave the area while the equipment is in service.'

export const LOTO_DEFAULT_PRINT_ENFORCEMENT =
  'Failure to properly follow lockout-tagout procedure may result in corrective action up to and including termination.'

export const LOTO_DEFAULT_SHUTDOWN_SEQUENCE: LotoSequenceStep[] = [
  { step: 'Notify Employees', description: 'Notify all affected employees that servicing or maintenance is required on a machine or equipment, and that the machine or equipment must be shut down and locked out to perform the servicing or maintenance.' },
  { step: 'Review Lockout Procedure', description: 'The authorized employee shall refer to the company procedure to identify the type and magnitude of the energy that the machine or equipment utilizes, shall understand the hazards of the energy, and shall know the methods to control the energy.' },
  { step: 'Perform Machine Stop', description: 'If the machine or equipment is operating, shut it down by the normal stopping procedure (depress stop button, open toggle switch, etc.).' },
  { step: 'Isolate Energy', description: 'De-activate the energy isolating device(s) so that the machine or equipment is isolated from the energy source(s).' },
  { step: 'Lockout Energy', description: 'Lock out the energy isolating device(s) with assigned individual lock(s).' },
  { step: 'Dissipate Energy', description: 'Stored or residual energy (such as that in capacitors, springs, elevated machine members, rotating flywheels, hydraulic systems, and air, gas, steam, or water pressure, etc.) must be dissipated or restrained by methods such as grounding, repositioning, blocking, bleeding down, etc.' },
  { step: 'Attempt Restart', description: 'Ensure that the equipment is disconnected from the energy source(s) by first checking that no personnel are exposed, then verify the isolation of the equipment by operating the push button or other normal operating control(s) or by testing to make certain the equipment will not operate. Caution: Return operating control(s) to neutral or "off" position after verifying the isolation of the equipment.' }
]

export const LOTO_DEFAULT_RESTORE_SEQUENCE: LotoSequenceStep[] = [
  { step: 'Check Machine', description: 'Check the machine or equipment and the immediate area around the machine or equipment to ensure that nonessential items have been removed and that the machine or equipment components are operationally intact.' },
  { step: 'Check Area', description: 'Check the work area to ensure that all employees have been safely positioned or removed from the area.' },
  { step: 'Verify Machine', description: 'Verify that the controls are in neutral.' },
  { step: 'Remove Lockout', description: 'Remove the lockout devices and reenergize the machine or equipment. Note: The removal of some forms of blocking may require reenergization of the machine before safe removal.' },
  { step: 'Notify Employees', description: 'Notify affected employees that the servicing or maintenance is completed and the machine or equipment is ready for use.' }
]

/** Used when a procedure lists no restoration checks; mirrors forge_loto_build_snapshot. */
export const LOTO_DEFAULT_RESTORATION_CHECK: LotoRestorationCheck = {
  key: 'area_clear',
  label: 'Restoration complete: tools removed, guards replaced, area clear and affected employees notified.'
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

/** Cleans precautions from a form: drops blanks and duplicates, keeps at most 40. */
export const normalizePrecautions = (input: unknown): LotoPrecaution[] => {
  if (!Array.isArray(input)) return []

  const seen = new Set<string>()
  const result: LotoPrecaution[] = []

  for (const item of input) {
    const body = text((item as any)?.text, 1000)

    if (!body) continue

    const key = text((item as any)?.key, 80) || 'custom-' + slug(body)

    if (seen.has(key)) continue
    seen.add(key)
    result.push({ key, category: text((item as any)?.category, 60) || 'General', text: body })
  }

  return result.slice(0, 40)
}

/** Cleans a shutdown or restore sequence: both fields required per row, at most 20 rows. */
export const normalizeSequence = (input: unknown): LotoSequenceStep[] => {
  if (!Array.isArray(input)) return []

  return input
    .map(item => ({ step: text((item as any)?.step, 120), description: text((item as any)?.description, 2000) }))
    .filter(item => item.step && item.description)
    .slice(0, 20)
}

/** Cleans restoration checks. Keys are derived from labels and kept unique. */
export const normalizeRestorationChecks = (input: unknown): LotoRestorationCheck[] => {
  if (!Array.isArray(input)) return []

  const seen = new Set<string>()
  const result: LotoRestorationCheck[] = []

  for (const item of input) {
    const label = text((item as any)?.label, 300)

    if (!label) continue

    let key = text((item as any)?.key, 80) || slug(label) || 'check'
    let n = 2

    while (seen.has(key)) key = slug(label) + '-' + n++
    seen.add(key)
    result.push({ key, label })
  }

  return result.slice(0, 20)
}

/** Content to print or show, with 1.0's defaults filling anything the procedure leaves empty. */
export const effectiveLotoContent = (procedure: {
  print_purpose?: string | null
  print_scope?: string | null
  print_enforcement?: string | null
  shutdown_sequence?: unknown
  restore_sequence?: unknown
  restoration_checks?: unknown
}) => {
  const shutdown = normalizeSequence(procedure.shutdown_sequence)
  const restore = normalizeSequence(procedure.restore_sequence)
  const checks = normalizeRestorationChecks(procedure.restoration_checks)

  return {
    purpose: procedure.print_purpose?.trim() || LOTO_DEFAULT_PRINT_PURPOSE,
    scope: procedure.print_scope?.trim() || LOTO_DEFAULT_PRINT_SCOPE,
    enforcement: procedure.print_enforcement?.trim() || LOTO_DEFAULT_PRINT_ENFORCEMENT,
    shutdownSequence: shutdown.length ? shutdown : LOTO_DEFAULT_SHUTDOWN_SEQUENCE,
    restoreSequence: restore.length ? restore : LOTO_DEFAULT_RESTORE_SEQUENCE,
    restorationChecks: checks.length ? checks : [LOTO_DEFAULT_RESTORATION_CHECK]
  }
}

// ---------------------------------------------------------------------------
// Photo arrows
// ---------------------------------------------------------------------------

/** One arrow on a photo. Coordinates are fractions of the image (0 to 1); x2/y2 is the tip. */
export type LotoArrow = { id: string; x1: number; y1: number; x2: number; y2: number }

export const LOTO_ARROW_COLOR = '#dc2626'
export const LOTO_MAX_ARROWS = 30
const MIN_ARROW_LENGTH_SQUARED = 0.00005

const clamp01 = (value: unknown) => {
  const n = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(n)) return null

  return Math.min(1, Math.max(0, n))
}

/** Clamps coordinates into the image and drops broken or zero-length arrows (1.0 rule). */
export const normalizeLotoArrows = (input: unknown): LotoArrow[] => {
  if (!Array.isArray(input)) return []

  const result: LotoArrow[] = []

  for (const [index, item] of input.entries()) {
    const x1 = clamp01((item as any)?.x1)
    const y1 = clamp01((item as any)?.y1)
    const x2 = clamp01((item as any)?.x2)
    const y2 = clamp01((item as any)?.y2)

    if (x1 == null || y1 == null || x2 == null || y2 == null) continue
    if ((x2 - x1) ** 2 + (y2 - y1) ** 2 < MIN_ARROW_LENGTH_SQUARED) continue

    const rawId = typeof (item as any)?.id === 'string' ? (item as any).id.slice(0, 40) : ''

    result.push({ id: rawId || 'a' + index, x1, y1, x2, y2 })
  }

  return result.slice(0, LOTO_MAX_ARROWS)
}

/** Points of the filled arrow head at the tip, in the same 0..1 space, for an SVG polygon. */
export const lotoArrowHead = (arrow: LotoArrow, aspect = 1, size = 0.045) => {
  const dx = (arrow.x2 - arrow.x1) * aspect
  const dy = arrow.y2 - arrow.y1
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const baseX = arrow.x2 * aspect - ux * size
  const baseY = arrow.y2 - uy * size
  const half = size * 0.55
  const left = [(baseX - uy * half) / aspect, baseY + ux * half]
  const right = [(baseX + uy * half) / aspect, baseY - ux * half]

  return [[arrow.x2, arrow.y2], left, right] as Array<[number, number]>
}

export const LOTO_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const LOTO_PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const LOTO_PHOTOS_PER_SLOT = 6

// ---------------------------------------------------------------------------
// Lockouts
// ---------------------------------------------------------------------------

export type LockoutStatus = 'in_progress' | 'verified' | 'completed' | 'canceled'

export const LOCKOUT_STATUS_LABELS: Record<LockoutStatus, string> = {
  in_progress: 'Issued',
  verified: 'Verified',
  completed: 'Returned to Service',
  canceled: 'Canceled'
}

export const isOpenLockout = (status: string) => status === 'in_progress' || status === 'verified'

type LockoutState = {
  status: string
  try_start_required: boolean
  step_checks: Record<string, unknown> | null
  procedure_snapshot: { steps?: Array<{ id: string }>; restoration_checks?: LotoRestorationCheck[] } | null
}

type LockRow = { removed_at: string | null }

/**
 * What stands between a lockout and its next stage. The database enforces the same rules
 * (forge_loto_verify_lockout / forge_loto_complete_lockout); this is for showing them.
 */
export const lockoutBlockers = (lockout: LockoutState, locks: LockRow[]) => {
  const steps = lockout.procedure_snapshot?.steps || []
  const checks = lockout.step_checks || {}
  const uncheckedSteps = steps.filter(step => !(step.id in checks)).length
  const activeLocks = locks.filter(lock => !lock.removed_at).length

  return {
    uncheckedSteps,
    activeLocks,
    canVerify: lockout.status === 'in_progress' && uncheckedSteps === 0 && activeLocks > 0,
    canComplete: lockout.status === 'verified' && activeLocks === 0,
    canCancel: isOpenLockout(lockout.status) && activeLocks === 0
  }
}

/** Whether the procedure's periodic review is past due on the given day (YYYY-MM-DD). */
export const lotoReviewOverdue = (procedure: { status: string; next_review_date: string | null }, todayIso: string) =>
  procedure.status === 'approved' && Boolean(procedure.next_review_date) && String(procedure.next_review_date) < todayIso
