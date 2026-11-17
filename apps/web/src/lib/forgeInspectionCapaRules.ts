/**
 * Pure rules for turning an inspection finding into a Corrective Action (S8 piece A). 1.0 opened a CAPA for every
 * failed checklist item when the inspection was completed; 2.0 records deficiencies as findings, so each finding
 * that still needs action opens one CAPA when the inspection is submitted.
 */

export type CapaSeverity = 'low' | 'moderate' | 'high' | 'critical'

export const INSPECTION_FINDING_CAPA_SOURCE = 'inspection_finding'

/** 1.0 gave inspection CAPAs a 90-day close-out window; used when the finding has no due date of its own. */
export const DEFAULT_FINDING_CAPA_DUE_DAYS = 90

const SEVERITY_ALIASES: Record<string, CapaSeverity> = {
  low: 'low',
  minor: 'low',
  minimal: 'low',
  moderate: 'moderate',
  medium: 'moderate',
  normal: 'moderate',
  high: 'high',
  major: 'high',
  serious: 'high',
  critical: 'critical',
  severe: 'critical',
  extreme: 'critical',
  imminent: 'critical'
}

/** Maps a (tenant-configurable) finding severity key to the fixed CAPA severity scale. Unknown keys → moderate. */
export const capaSeverityForFinding = (severity: string | null | undefined): CapaSeverity => {
  const key = String(severity || '')
    .trim()
    .toLowerCase()

  return SEVERITY_ALIASES[key] || 'moderate'
}

/** A finding needs a CAPA while it is still open; closed and canceled findings are left alone. */
export const findingNeedsCapa = (finding: { status?: string | null }) => !['closed', 'canceled'].includes(String(finding.status || 'open'))

/** Finding due date (a date) → CAPA due_at (end of that day, UTC); otherwise the 1.0 default window from `now`. */
export const capaDueAtForFinding = (dueDate: string | null | undefined, now: Date = new Date()) => {
  if (dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return dueDate + 'T23:59:00.000Z'
  if (dueDate && !Number.isNaN(Date.parse(dueDate))) return new Date(dueDate).toISOString()

  return new Date(now.getTime() + DEFAULT_FINDING_CAPA_DUE_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/** `INS-0001 / Guard missing` — the CAPA's source reference. */
export const findingCapaReference = (inspectionNumber: string | null | undefined, findingTitle: string) =>
  [inspectionNumber, findingTitle].filter(Boolean).join(' / ').slice(0, 200)

export const findingCapaTitle = (findingTitle: string) => ('Inspection finding: ' + findingTitle).slice(0, 200)

export const findingCapaDescription = (finding: { title: string; description?: string | null; corrective_action?: string | null }, inspectionNumber?: string | null) => {
  const parts = [finding.description?.trim() || finding.title]

  if (finding.corrective_action?.trim()) parts.push('Proposed corrective action (from the inspection): ' + finding.corrective_action.trim())
  if (inspectionNumber) parts.push('Raised on inspection ' + inspectionNumber + '.')

  return parts.join('\n\n')
}
