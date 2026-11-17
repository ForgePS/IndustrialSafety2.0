/**
 * Port slice 9: Forms. Pure rules shared by the builder, the fill page, signing, print and import.
 * No imports, so unit tests and client components can use it.
 *
 * 1.0 reference (legacy/forge-platform/apps):
 * - industrial-web/src/lib/forms-module.ts (field types), form-yesno.ts (Yes / No / N/A with notes)
 * - field-web/src/lib/field-forms.ts (photo, multiselect, sections, visibleWhen)
 * - platform-api/src/modules/industrial/form-signatory.ts (EHS Director and supervisor signatures, PENDING_SIGNATURE)
 */

export const FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'time',
  'email',
  'tel',
  'select',
  'multiselect',
  'radio',
  'checkbox',
  'yesno',
  'signature',
  'photo',
  'location',
  'employee_number',
  'section',
  'content'
] as const

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number]

export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  number: 'Number',
  date: 'Date',
  time: 'Time',
  email: 'Email',
  tel: 'Phone',
  select: 'Dropdown',
  multiselect: 'Multiple choice (many)',
  radio: 'Multiple choice (one)',
  checkbox: 'Checkbox',
  yesno: 'Yes / No / N/A',
  signature: 'Signature',
  photo: 'Photo',
  location: 'Location',
  employee_number: 'Employee number',
  section: 'Section heading',
  content: 'Instructions text'
}

/** Who signs a signature field. 'any' is signed by whoever fills the form. */
export type FormSignatory = 'any' | 'supervisor' | 'ehs_director'

export type FormField = {
  id: string
  label: string
  type: FormFieldType
  required?: boolean
  options?: string[]
  help?: string

  /** Static text shown on the form (content fields) and never submitted. */
  content?: string
  signatory?: FormSignatory

  /** Show this field only when another field's answer equals a value (1.0 field app). */
  visibleWhen?: { fieldId: string; equals: string } | null
}

export type FormSchema = { fields: FormField[] }

export type SignatureAnswer = {
  image: string
  signedAt: string
  signedByName: string
  signedByUserId: string | null
  method: 'in_app' | 'remote_link' | 'imported'
}

export type FormSubmissionStatus = 'draft' | 'pending_signature' | 'submitted' | 'archived'

export const FORM_SUBMISSION_STATUS_LABELS: Record<FormSubmissionStatus, string> = {
  draft: 'Draft',
  pending_signature: 'Needs signature',
  submitted: 'Submitted',
  archived: 'Archived'
}

export const MAX_FORM_FIELDS = 300
export const MAX_SIGNATURE_BYTES = 300_000
const MAX_TEXT = 10_000

const CHOICE_TYPES: ReadonlySet<string> = new Set(['select', 'multiselect', 'radio'])
const DISPLAY_TYPES: ReadonlySet<string> = new Set(['section', 'content'])

export const YES_NO_NA_OPTIONS = ['Yes', 'No', 'N/A'] as const

/** Answer key for the note under a Yes / No / N/A field (required when the answer is No). */
export const yesNoNotesFieldId = (fieldId: string) => `${fieldId}__notes`

export const isDisplayField = (field: Pick<FormField, 'type'>) => DISPLAY_TYPES.has(field.type)

export const normalizeYesNoAnswer = (raw: unknown): 'Yes' | 'No' | 'N/A' | null => {
  const upper = String(raw ?? '')
    .trim()
    .toUpperCase()

  if (upper === 'YES' || upper === 'Y') return 'Yes'
  if (upper === 'NO' || upper === 'N') return 'No'
  if (upper === 'NA' || upper === 'N/A') return 'N/A'

  return null
}

const blob = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')

/** A field id from a label: lower-case words joined by dashes. */
export const slugFieldId = (label: string) =>
  String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'field'

/** Old 1.0 type names and aliases → 2.0 types. Anything unknown becomes short text. */
export const normalizeFieldType = (raw: unknown): FormFieldType => {
  const value = blob(raw).replace(/\s+/g, '')

  const aliases: Record<string, FormFieldType> = {
    string: 'text',
    input: 'text',
    paragraph: 'textarea',
    multiline: 'textarea',
    longtext: 'textarea',
    integer: 'number',
    decimal: 'number',
    phone: 'tel',
    telephone: 'tel',
    dropdown: 'select',
    multi: 'multiselect',
    multiselect: 'multiselect',
    multiplechoice: 'radio',
    boolean: 'checkbox',
    yesnona: 'yesno',
    yesno: 'yesno',
    checklist: 'yesno',
    signaturepad: 'signature',
    sign: 'signature',
    draw: 'signature',
    ink: 'signature',
    image: 'photo',
    picture: 'photo',
    camera: 'photo',
    attachment: 'photo',
    attachments: 'photo',
    site: 'location',
    facility: 'location',
    employeenumber: 'employee_number',
    employee: 'employee_number',
    'employee#': 'employee_number',
    empnumber: 'employee_number',
    personnel: 'employee_number',
    personnelnumber: 'employee_number',
    label: 'section',
    heading: 'section',
    header: 'section',
    group: 'section',
    sectionheading: 'section',
    instructions: 'content',
    paragraphtext: 'content',
    html: 'content',
    static: 'content',
    info: 'content',
    datetime: 'date'
  }

  if ((FORM_FIELD_TYPES as readonly string[]).includes(value)) return value as FormFieldType
  if (aliases[value]) return aliases[value]

  return 'text'
}

/** 1.0's label rules for who signs a signature field, used when a field has no explicit signatory. */
export const inferSignatory = (field: { id?: string; label?: string; type?: string }): FormSignatory => {
  const text = `${blob(field.label)} ${blob(field.id)}`

  if (/\behs\s+director\b/.test(text) || /\bsafety\s+director\b/.test(text)) return 'ehs_director'
  if (/\behs\b/.test(text) && /\bsignature\b/.test(text)) return 'ehs_director'
  if (/\bsupervisor\b/.test(text)) return 'supervisor'

  return 'any'
}

/** 1.0 treated a field labelled "... Signature" (not "Signature Date") as a signature pad. */
export const isSignatureLabel = (label: string) => {
  const text = String(label || '').trim()

  if (!text) return false
  if (/\bsignature\s*date\b/i.test(text) || /\bdate\s*(of\s+)?signature\b/i.test(text)) return false

  return /\bsignature\b/i.test(text) || /^sign(\s+here)?$/i.test(text)
}

const cleanString = (value: unknown, max: number) => {
  const text = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()

  return text.slice(0, max)
}

/**
 * Cleans a builder or imported schema: valid types, unique ids, options for choice fields, signatory for
 * signature fields, conditions that point at an earlier field. Returns the problems it could not fix.
 */
export const normalizeFormSchema = (raw: unknown): { schema: FormSchema; errors: string[] } => {
  const errors: string[] = []
  const input = raw && typeof raw === 'object' ? (raw as { fields?: unknown }).fields : null
  const list = Array.isArray(raw) ? raw : Array.isArray(input) ? input : []
  const fields: FormField[] = []
  const seen = new Set<string>()

  for (const item of list.slice(0, MAX_FORM_FIELDS)) {
    if (!item || typeof item !== 'object') continue

    const source = item as Record<string, unknown>
    const label = cleanString(source.label ?? source.title ?? source.name, 300)
    let type = normalizeFieldType(source.type)

    if (type === 'text' && isSignatureLabel(label) && !source.type) type = 'signature'

    const content = cleanString(source.content ?? source.text, 4000)

    if (!label && !(type === 'content' && content)) continue

    let id = slugFieldId(cleanString(source.id ?? source.key, 60) || label || type)

    if (seen.has(id)) {
      let index = 2

      while (seen.has(`${id}-${index}`)) index += 1
      id = `${id}-${index}`
    }

    seen.add(id)

    const field: FormField = { id, label: label || (type === 'content' ? 'Instructions' : id), type }

    if (!isDisplayField(field) && (source.required === true || source.required === 'true' || source.required === 'yes')) field.required = true

    const help = cleanString(source.help ?? source.helpText, 500)

    if (help) field.help = help
    if (type === 'content' && content) field.content = content

    if (CHOICE_TYPES.has(type)) {
      const options = Array.isArray(source.options)
        ? source.options
        : typeof source.options === 'string'
          ? source.options.split(/[,;]/)
          : []

      const clean = [...new Set(options.map(option => cleanString(option, 200)).filter(Boolean))].slice(0, 100)

      if (!clean.length) errors.push(`"${field.label}" needs at least one option.`)
      field.options = clean
    }

    if (type === 'signature') {
      const signatory = source.signatory

      field.signatory = signatory === 'any' || signatory === 'supervisor' || signatory === 'ehs_director' ? signatory : inferSignatory(field)
    }

    const condition = source.visibleWhen as { fieldId?: unknown; equals?: unknown } | null | undefined

    if (condition && typeof condition === 'object' && condition.fieldId) {
      const target = slugFieldId(cleanString(condition.fieldId, 60))

      if (seen.has(target) && target !== id) field.visibleWhen = { fieldId: target, equals: cleanString(condition.equals, 200) }
      else errors.push(`"${field.label}" is shown only when a field that is not above it has an answer; the condition was removed.`)
    }

    fields.push(field)
  }

  if (list.length > MAX_FORM_FIELDS) errors.push(`A form can have at most ${MAX_FORM_FIELDS} fields.`)

  return { schema: { fields }, errors }
}

/** Whether a field is shown for the current answers (hidden fields are neither required nor kept). */
export const isFieldVisible = (field: FormField, answers: Record<string, unknown>) => {
  if (!field.visibleWhen) return true

  const value = answers[field.visibleWhen.fieldId]
  const expected = field.visibleWhen.equals.trim().toLowerCase()

  if (Array.isArray(value)) return value.some(item => String(item).trim().toLowerCase() === expected)
  if (typeof value === 'boolean') return String(value) === expected || (value ? 'yes' : 'no') === expected

  return String(value ?? '')
    .trim()
    .toLowerCase() === expected
}

export const isSignatureAnswerPresent = (value: unknown) => {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''

  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>

    return Boolean(String(record.image ?? '').trim() || String(record.signedAt ?? '').trim())
  }

  return false
}

/** Signature fields someone other than the person filling in signs later (supervisor, EHS Director). */
export const isDeferredSignatureField = (field: FormField) =>
  field.type === 'signature' && (field.signatory === 'supervisor' || field.signatory === 'ehs_director')

export const missingDeferredSignatures = (fields: FormField[], answers: Record<string, unknown>) =>
  fields.filter(field => isDeferredSignatureField(field) && isFieldVisible(field, answers) && !isSignatureAnswerPresent(answers[field.id]))

export const missingDirectorSignatures = (fields: FormField[], answers: Record<string, unknown>) =>
  missingDeferredSignatures(fields, answers).filter(field => field.signatory === 'ehs_director')

/**
 * The status a submission is saved with. Saving as a draft keeps it a draft. Submitting gives 'submitted',
 * or 'pending_signature' while a supervisor or EHS Director signature is still missing (1.0
 * resolveFormSubmissionStatus). An archived submission stays archived.
 */
export const resolveSubmissionStatus = (
  fields: FormField[],
  answers: Record<string, unknown>,
  requested: 'draft' | 'submit',
  current: FormSubmissionStatus | null = null
): FormSubmissionStatus => {
  if (current === 'archived') return 'archived'
  if (requested === 'draft' && (current === null || current === 'draft')) return 'draft'

  return missingDeferredSignatures(fields, answers).length ? 'pending_signature' : 'submitted'
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}(:\d{2})?$/

export const isValidSignatureImage = (value: unknown) =>
  typeof value === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= MAX_SIGNATURE_BYTES

/**
 * Keeps only answers for fields on the form (plus Yes/No notes), trims text and drops hidden fields.
 * Signature answers are left to the signing rules; photos are stored elsewhere and referenced by id.
 */
export const normalizeAnswers = (fields: FormField[], raw: unknown): Record<string, unknown> => {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const answers: Record<string, unknown> = {}

  for (const field of fields) {
    if (isDisplayField(field)) continue

    const value = input[field.id]

    if (field.type === 'multiselect') {
      const list = Array.isArray(value) ? value : typeof value === 'string' && value ? value.split(/[,;]/) : []

      answers[field.id] = list.map(item => cleanString(item, 200)).filter(Boolean)
    } else if (field.type === 'checkbox') {
      answers[field.id] = value === true || value === 'true' || value === 'on' || value === 'yes'
    } else if (field.type === 'yesno') {
      answers[field.id] = normalizeYesNoAnswer(value) || ''

      const note = cleanString(input[yesNoNotesFieldId(field.id)], MAX_TEXT)

      if (note) answers[yesNoNotesFieldId(field.id)] = note
    } else if (field.type === 'signature') {
      if (value && typeof value === 'object') answers[field.id] = value
    } else if (field.type === 'photo') {
      const list = Array.isArray(value) ? value : value ? [value] : []

      answers[field.id] = list.map(item => cleanString(item, 500)).filter(Boolean)
    } else {
      answers[field.id] = cleanString(value, MAX_TEXT)
    }
  }

  for (const field of fields) {
    if (!isFieldVisible(field, answers)) {
      delete answers[field.id]
      delete answers[yesNoNotesFieldId(field.id)]
    }
  }

  return answers
}

const isEmpty = (value: unknown) =>
  value == null || value === '' || value === false || (Array.isArray(value) && value.length === 0)

/**
 * Problems with the answers. Drafts are only checked for format; submitting also checks required fields and
 * Yes/No notes. Supervisor and EHS Director signatures are never required at submit (they are signed later).
 */
export const validateAnswers = (fields: FormField[], answers: Record<string, unknown>, { final }: { final: boolean }) => {
  const errors: { fieldId: string; message: string }[] = []

  for (const field of fields) {
    if (isDisplayField(field) || !isFieldVisible(field, answers)) continue

    const value = answers[field.id]

    if (field.type === 'signature') {
      if (value != null && !isSignatureAnswerPresent(value)) errors.push({ fieldId: field.id, message: `${field.label} is not a valid signature.` })

      if (final && field.required && !isDeferredSignatureField(field) && !isSignatureAnswerPresent(value)) {
        errors.push({ fieldId: field.id, message: `${field.label} is required.` })
      }

      continue
    }

    if (final && field.required && isEmpty(value)) {
      errors.push({ fieldId: field.id, message: `${field.label} is required.` })
      continue
    }

    if (isEmpty(value)) continue

    const text = String(value)

    if (field.type === 'number' && !Number.isFinite(Number(text))) errors.push({ fieldId: field.id, message: `${field.label} must be a number.` })
    if (field.type === 'email' && !EMAIL.test(text)) errors.push({ fieldId: field.id, message: `${field.label} must be an email address.` })

    if (field.type === 'date' && (!DATE.test(text) || Number.isNaN(new Date(text + 'T00:00:00Z').getTime()))) {
      errors.push({ fieldId: field.id, message: `${field.label} must be a date.` })
    }

    if (field.type === 'time' && !TIME.test(text)) errors.push({ fieldId: field.id, message: `${field.label} must be a time.` })

    if ((field.type === 'select' || field.type === 'radio') && field.options?.length && !field.options.includes(text)) {
      errors.push({ fieldId: field.id, message: `${field.label} has an answer that is not one of its options.` })
    }

    if (field.type === 'multiselect' && field.options?.length && Array.isArray(value) && value.some(item => !field.options!.includes(String(item)))) {
      errors.push({ fieldId: field.id, message: `${field.label} has an answer that is not one of its options.` })
    }

    if (field.type === 'yesno' && final && value === 'No' && !String(answers[yesNoNotesFieldId(field.id)] ?? '').trim()) {
      errors.push({ fieldId: field.id, message: `Add a note for "${field.label}" (answered No).` })
    }
  }

  return errors
}

/** The employee number answered on the form, used to link the submission to a personnel profile (1.0 form-subject). */
export const employeeNumberFromAnswers = (fields: FormField[], answers: Record<string, unknown>) => {
  for (const field of fields) {
    if (field.type !== 'employee_number') continue

    const value = cleanString(answers[field.id], 100)

    if (value) return value
  }

  return null
}

/** A one-line answer for lists, print and CSV. */
export const formatAnswer = (field: FormField, value: unknown): string => {
  if (value == null || value === '') return ''
  if (field.type === 'signature') return isSignatureAnswerPresent(value) ? `Signed by ${(value as SignatureAnswer).signedByName || 'unknown'}` : ''
  if (field.type === 'checkbox') return value === true ? 'Yes' : 'No'
  if (Array.isArray(value)) return field.type === 'photo' ? `${value.length} photo${value.length === 1 ? '' : 's'}` : value.join(', ')

  return String(value)
}
