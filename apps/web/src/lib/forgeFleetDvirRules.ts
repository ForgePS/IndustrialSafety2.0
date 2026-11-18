/**
 * Port slice 11 (piece B): pure DVIR helpers beyond forgeFleetRules.ts — the checklist "All OK" button, the
 * odometer decision, the out-of-service reason, the follow-up signature checks and the signature record.
 * No database, no Next. Covered by tests/port-s11-dvirs.test.cjs.
 */
import type { DvirAnswer, DvirDefect, DvirSection } from './forgeFleetRules.ts'
import { DVIR_ITEMS, isValidSignatureImage } from './forgeFleetRules.ts'

export type DvirDraftAnswers = Record<string, { answer: DvirAnswer | null; notes: string }>

/** "All OK" for one section: every item not answered yet becomes Yes. Answered items are left alone. */
export const markSectionOk = (answers: DvirDraftAnswers, section: DvirSection): DvirDraftAnswers => {
  const next: DvirDraftAnswers = { ...answers }

  for (const entry of DVIR_ITEMS) {
    if (entry.section !== section) continue

    const current = next[entry.id]

    if (!current?.answer) next[entry.id] = { answer: 'yes', notes: current?.notes || '' }
  }

  return next
}

/** How many items of a section (or of the whole checklist) are still unanswered. */
export const unansweredCount = (answers: DvirDraftAnswers, section?: DvirSection) =>
  DVIR_ITEMS.filter(entry => (!section || entry.section === section) && !answers[entry.id]?.answer).length

export type OdometerDecision = 'none' | 'apply' | 'lower'

/**
 * Whether a DVIR's odometer updates the vehicle's mileage: only when it is at least the current mileage.
 * A lower reading is kept on the DVIR but not applied (a meter correction is a deliberate office action).
 */
export const odometerDecision = (odometer: number | null | undefined, currentMileage: number | null | undefined): OdometerDecision => {
  if (odometer == null) return 'none'
  if (currentMileage == null || odometer >= currentMileage) return 'apply'

  return 'lower'
}

/** "DVIR DVIR-2026-000001: Brakes, Tires" — the out-of-service reason, at most 500 characters. */
export const dvirOutOfServiceReason = (dvirNumber: string, defects: Pick<DvirDefect, 'label' | 'section'>[]) => {
  const labels = defects.map(defect => (defect.section === 'trailer' ? `Trailer ${defect.label.toLowerCase()}` : defect.label))
  const text = `DVIR ${dvirNumber}: ${labels.join(', ')}`

  return text.length > 500 ? `${text.slice(0, 497)}...` : text
}

export const repairTitle = (dvirNumber: string) => `Repair DVIR defects (${dvirNumber})`

export type DvirSignatureRecord = {
  image: string
  signedAt: string
  signedByName: string
  signedByUserId: string | null
  signedByPersonnelId: string | null
  method: 'drawn'
}

export const dvirSignature = ({
  image,
  name,
  userId,
  personnelId,
  now = new Date()
}: {
  image: string
  name: string
  userId: string | null
  personnelId: string | null
  now?: Date
}): DvirSignatureRecord => ({
  image,
  signedAt: now.toISOString(),
  signedByName: name.trim().slice(0, 200),
  signedByUserId: userId,
  signedByPersonnelId: personnelId,
  method: 'drawn'
})

export const MECHANIC_ACTIONS = ['corrected', 'not_needed'] as const
export type MechanicAction = (typeof MECHANIC_ACTIONS)[number]

export const MECHANIC_ACTION_LABELS: Record<MechanicAction, string> = {
  corrected: 'Above defects corrected',
  not_needed: 'Above defects need not be corrected for safe operation of the vehicle'
}

type Check = { ok: true } | { ok: false; error: string }

/** The mechanic certification (1.0 validateDvirMechanicCertify), checked on the server. */
export const validateMechanicCertification = (input: { status: string; action: string; mechanicName: string; signature: unknown }): Check => {
  if (input.status !== 'open') return { ok: false, error: 'Only a DVIR with open defects can be certified.' }
  if (!(MECHANIC_ACTIONS as readonly string[]).includes(input.action)) return { ok: false, error: 'Choose whether the defects were corrected or need no correction.' }
  if (!(input.mechanicName || '').trim()) return { ok: false, error: 'Enter the mechanic name.' }
  if (!isValidSignatureImage(input.signature)) return { ok: false, error: 'The mechanic must sign.' }

  return { ok: true }
}

/** The next driver's review (1.0 validateDvirDriverReview). */
export const validateDriverReview = (input: { status: string; reviewName: string; signature: unknown }): Check => {
  if (input.status !== 'needs_review') return { ok: false, error: 'This DVIR is not waiting for a driver review.' }
  if (!(input.reviewName || '').trim()) return { ok: false, error: 'Enter the driver name.' }
  if (!isValidSignatureImage(input.signature)) return { ok: false, error: 'The driver must sign the review.' }

  return { ok: true }
}

/** A YYYY-MM-DD date string, or null. */
export const parseIsoDate = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : ''

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null

  const date = new Date(`${text}T00:00:00Z`)

  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text
}

export const DVIR_STATUS_LABELS: Record<string, string> = { open: 'Open defects', needs_review: 'Needs driver review', closed: 'Closed' }

export const DVIR_ANSWER_LABELS: Record<DvirAnswer, string> = { yes: 'Yes', no: 'No', na: 'N/A' }
