/**
 * Port slice 10: pure rules for inspections run from a QR scan (Industrial 1.0 scan-inspection-runner.tsx).
 * No database, no Next: shared by the mobile runner, its server actions and the unit tests.
 *
 * 1.0 asked YES / NO / N/A for every item and required notes on a NO. 2.0 checklist items keep their own
 * response type (pass_fail_na, yes_no_na, text, number) and their own finding_on list, so "needs notes"
 * means "this answer will raise a finding".
 */

export const SCAN_RESPONSE_TYPES = ['pass_fail_na', 'yes_no_na', 'text', 'number'] as const
export type ScanResponseType = (typeof SCAN_RESPONSE_TYPES)[number]

export const SCAN_CHOICE_OPTIONS: Record<'pass_fail_na' | 'yes_no_na', { value: string; label: string }[]> = {
  pass_fail_na: [
    { value: 'pass', label: 'Pass' },
    { value: 'fail', label: 'Fail' },
    { value: 'na', label: 'N/A' }
  ],
  yes_no_na: [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'na', label: 'N/A' }
  ]
}

export const SCAN_TEXT_MAX = 2000
export const SCAN_NOTES_MAX = 2000

/** Inspection statuses an inspection run from a scan can still be answered in. */
export const SCAN_UNFINISHED_STATUSES = ['draft', 'in_progress'] as const

export type ScanChecklistItem = {
  id: string
  prompt: string
  response_type: string
  is_required: boolean
  finding_on: string[] | null
}

export type ScanAnswer = { value: string | null; notes: string | null }

const NUMBER = /^-?\d+(\.\d+)?$/

/**
 * The stored form of an answer, or null when it is empty. Returns { error } for an answer the item's
 * response type does not accept.
 */
export const normalizeScanAnswer = (responseType: string, raw: unknown): { value: string | null } | { error: string } => {
  const text = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : ''

  if (!text) return { value: null }

  if (responseType === 'pass_fail_na' || responseType === 'yes_no_na') {
    const value = text.toLowerCase()

    return SCAN_CHOICE_OPTIONS[responseType].some(option => option.value === value) ? { value } : { error: 'Choose one of the answers.' }
  }

  if (responseType === 'number') {
    const value = text.replace(',', '.')

    return NUMBER.test(value) && value.length <= 30 ? { value } : { error: 'Enter a number.' }
  }

  return text.length <= SCAN_TEXT_MAX ? { value: text } : { error: `Keep the answer under ${SCAN_TEXT_MAX} characters.` }
}

/** Whether this answer raises a finding (the item's finding_on list, case-insensitive). */
export const answerTriggersFinding = (item: Pick<ScanChecklistItem, 'finding_on'>, value: string | null | undefined) => {
  if (!value) return false

  const answer = value.trim().toLowerCase()

  return (item.finding_on || []).some(entry => String(entry).trim().toLowerCase() === answer)
}

/** Notes are required when the answer raises a finding (1.0: "a NO needs notes"). */
export const answerNeedsNotes = answerTriggersFinding

/**
 * Checks every item before completing: required items answered, answers valid for their type, and a
 * note on every answer that raises a finding. Returns a message per item id; empty when all is well.
 */
export const validateScanAnswers = (items: ScanChecklistItem[], answers: Record<string, ScanAnswer | undefined>) => {
  const errors: Record<string, string> = {}

  for (const item of items) {
    const answer = answers[item.id]
    const normalized = normalizeScanAnswer(item.response_type, answer?.value ?? null)

    if ('error' in normalized) {
      errors[item.id] = normalized.error
      continue
    }

    if (!normalized.value) {
      if (item.is_required) errors[item.id] = 'Answer this item.'
      continue
    }

    const notes = (answer?.notes || '').trim()

    if (notes.length > SCAN_NOTES_MAX) errors[item.id] = `Keep the note under ${SCAN_NOTES_MAX} characters.`
    else if (answerNeedsNotes(item, normalized.value) && !notes) errors[item.id] = 'Describe the problem in the notes.'
  }

  return errors
}

/** Items whose answers raise a finding. */
export const findingItems = <T extends ScanChecklistItem>(items: T[], answers: Record<string, ScanAnswer | undefined>) =>
  items.filter(item => {
    const normalized = normalizeScanAnswer(item.response_type, answers[item.id]?.value ?? null)

    return 'value' in normalized && answerTriggersFinding(item, normalized.value)
  })

/** The inspection result, as submitInspection computes it: any fail / no answer or finding → fail. */
export const scanInspectionResult = (items: ScanChecklistItem[], answers: Record<string, ScanAnswer | undefined>): 'pass' | 'fail' => {
  const anyFail = items.some(item => {
    const value = String(answers[item.id]?.value || '').toLowerCase()

    return value === 'fail' || value === 'no'
  })

  return anyFail || findingItems(items, answers).length ? 'fail' : 'pass'
}

/** Finding title from the checklist prompt (forge_inspection_findings.title). */
export const scanFindingTitle = (prompt: string) => {
  const title = (prompt || '').trim() || 'Checklist item'

  return title.length > 200 ? title.slice(0, 197) + '...' : title
}

/** Finding description: the inspector's note, with the answer given. */
export const scanFindingDescription = (answer: string, notes: string | null | undefined, inspectorName?: string | null) =>
  [notes?.trim() || null, `Answer: ${answer.toUpperCase()}.`, inspectorName ? `Reported by ${inspectorName} from a QR scan.` : 'Reported from a QR scan.']
    .filter(Boolean)
    .join('\n\n')

/** Today's date (UTC) as stored in forge_inspections.inspection_date. */
export const scanInspectionDate = (now: Date = new Date()) => now.toISOString().slice(0, 10)

/** "Started from QR QR-0001 · Daily · Forklift 7" for the inspection record. */
export const scanInspectionOriginLabel = ({ qrNumber, frequency, assetName }: { qrNumber: string | null; frequency: string | null; assetName?: string | null }) =>
  [
    `Started from QR ${qrNumber || ''}`.trim(),
    frequency ? frequency.charAt(0).toUpperCase() + frequency.slice(1) : null,
    assetName || null
  ]
    .filter(Boolean)
    .join(' · ')
