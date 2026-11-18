/**
 * Workers' comp case forms: definitions, validation and print layout. Pure, with no imports, so it can be
 * unit tested with `node --experimental-strip-types`.
 *
 * The forms themselves are tenant documents (a company's own paper forms). Each tenant uploads its original
 * one-page PDF as a template. Printing a blank form serves that file unchanged. Printing a filled form draws the
 * values and signature onto it at the positions below, so it looks like the paper copy filled in by hand.
 *
 * Positions are fractions of the page (0-1) measured from the top-left, so they hold for any page size.
 * `y` is the text baseline. A template can override any position through its `layout` column.
 */

export const WC_FORM_KEYS = ['injury_guidelines_ack', 'hipaa_authorization'] as const
export type WcFormKey = (typeof WC_FORM_KEYS)[number]

export const WC_FORM_STATUSES = ['draft', 'signed', 'voided'] as const
export type WcFormStatus = (typeof WC_FORM_STATUSES)[number]

export type WcFormField = {
  key: string
  label: string
  kind: 'text' | 'date' | 'initials'
  maxLength: number
  required?: boolean
  help?: string
}

export type WcFormTextPosition = { kind: 'text'; key: string; x: number; y: number; size: number; maxWidth: number }
export type WcFormLabelPosition = { kind: 'label'; text: string; x: number; y: number; size: number; bold?: boolean }
export type WcFormSignaturePosition = { kind: 'signature'; x: number; top: number; width: number; height: number }
export type WcFormPosition = WcFormTextPosition | WcFormLabelPosition | WcFormSignaturePosition

export type WcFormDefinition = {
  key: WcFormKey
  title: string
  description: string

  /** HIPAA-protected: view needs workers_comp.medical.view, fill/sign/email needs workers_comp.medical.manage. */
  medical: boolean
  fields: WcFormField[]

  /** Who signs: the employee, or the employee or their personal representative. */
  signerLabel: string
  allowRepresentative: boolean
  layout: WcFormPosition[]
}

// Values the app fills in rather than the user: the signer's printed name and the signing date.
export const WC_FORM_SYSTEM_KEYS = ['signer_line', 'signed_date'] as const

export const WC_FORM_DEFINITIONS: Record<WcFormKey, WcFormDefinition> = {
  injury_guidelines_ack: {
    key: 'injury_guidelines_ack',
    title: 'Employee Injury Guidelines',
    description: 'The employee copy of the injury guidelines. The employee signs to acknowledge receiving it.',
    medical: false,
    fields: [{ key: 'employee_name', label: 'Employee name', kind: 'text', maxLength: 120, required: true }],
    signerLabel: 'Employee',
    allowRepresentative: false,

    // The paper form has no signature lines, so the acknowledgment is drawn in the blank lower part of the page.
    layout: [
      { kind: 'label', text: 'Employee acknowledgment', x: 0.15, y: 0.705, size: 11, bold: true },
      { kind: 'label', text: 'I received a copy of these injury guidelines.', x: 0.15, y: 0.725, size: 10 },
      { kind: 'signature', x: 0.15, top: 0.74, width: 0.38, height: 0.06 },
      { kind: 'label', text: 'Signature', x: 0.15, y: 0.815, size: 9 },
      { kind: 'text', key: 'employee_name', x: 0.15, y: 0.85, size: 11, maxWidth: 0.4 },
      { kind: 'label', text: 'Printed name', x: 0.15, y: 0.866, size: 9 },
      { kind: 'text', key: 'signed_date', x: 0.6, y: 0.85, size: 11, maxWidth: 0.25 },
      { kind: 'label', text: 'Date', x: 0.6, y: 0.866, size: 9 }
    ]
  },
  hipaa_authorization: {
    key: 'hipaa_authorization',
    title: 'HIPAA Authorization',
    description: 'Authorizes a provider to disclose the employee\'s protected health information for the claim.',
    medical: true,
    fields: [
      { key: 'patient_name', label: 'Name', kind: 'text', maxLength: 120, required: true },
      { key: 'date_of_birth', label: 'Date of birth', kind: 'date', maxLength: 10, required: true },
      { key: 'provider_name', label: 'Provider authorized to disclose', kind: 'text', maxLength: 120, required: true },
      { key: 'initial_release_records', label: 'Initials: release clinical notes, test results, visit summary and billing', kind: 'initials', maxLength: 5 },
      { key: 'initial_sensitive_info', label: 'Initials: includes mental health, communicable disease and drug/alcohol information', kind: 'initials', maxLength: 5 },
      { key: 'initial_mail_fax', label: 'Initials: delivery by postal mail and/or fax', kind: 'initials', maxLength: 5 },
      { key: 'initial_unencrypted_email', label: 'Initials: delivery by unencrypted email', kind: 'initials', maxLength: 5 }
    ],
    signerLabel: 'Patient or personal representative',
    allowRepresentative: true,
    layout: [
      { kind: 'text', key: 'patient_name', x: 0.21, y: 0.169, size: 11, maxWidth: 0.32 },
      { kind: 'text', key: 'date_of_birth', x: 0.655, y: 0.169, size: 11, maxWidth: 0.2 },
      { kind: 'text', key: 'provider_name', x: 0.232, y: 0.223, size: 11, maxWidth: 0.27 },
      { kind: 'text', key: 'initial_release_records', x: 0.152, y: 0.266, size: 11, maxWidth: 0.04 },
      { kind: 'text', key: 'initial_sensitive_info', x: 0.152, y: 0.329, size: 11, maxWidth: 0.04 },
      { kind: 'text', key: 'initial_mail_fax', x: 0.152, y: 0.374, size: 11, maxWidth: 0.04 },
      { kind: 'text', key: 'initial_unencrypted_email', x: 0.152, y: 0.4, size: 11, maxWidth: 0.04 },
      { kind: 'signature', x: 0.16, top: 0.674, width: 0.4, height: 0.034 },
      { kind: 'text', key: 'signer_line', x: 0.152, y: 0.757, size: 11, maxWidth: 0.57 },
      { kind: 'text', key: 'signed_date', x: 0.152, y: 0.809, size: 11, maxWidth: 0.3 }
    ]
  }
}

export const isWcFormKey = (value: string): value is WcFormKey => (WC_FORM_KEYS as readonly string[]).includes(value)

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Cleans submitted field values against the form definition. Unknown keys are dropped. */
export const cleanWcFormFields = (formKey: WcFormKey, input: Record<string, unknown>, { forSigning = false } = {}) => {
  const definition = WC_FORM_DEFINITIONS[formKey]
  const values: Record<string, string> = {}
  const errors: string[] = []

  for (const field of definition.fields) {
    const raw = input[field.key]
    const value = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''

    if (value.length > field.maxLength) errors.push(`${field.label} is too long.`)
    else if (value && field.kind === 'date' && (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value + 'T00:00:00Z')))) errors.push(`${field.label} must be a date.`)
    else if (value && field.kind === 'initials' && !/^[A-Za-z.\- ]{1,5}$/.test(value)) errors.push(`${field.label}: use letters only.`)

    if (value) values[field.key] = value
    if (forSigning && field.required && !value) errors.push(`${field.label} is required before signing.`)
  }

  return { values, errors }
}

/** Dates print the way the paper forms are filled in by hand: MM/DD/YYYY. */
export const printedDate = (iso: string | null | undefined) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')

  return match ? `${match[2]}/${match[3]}/${match[1]}` : ''
}

/** Values to draw on the PDF: the form fields with dates as printed, plus the signer line and signing date. */
export const printedValues = (
  formKey: WcFormKey,
  fields: Record<string, unknown>,
  signer: { name: string | null; relationship: string | null; signedDate: string | null }
) => {
  const values: Record<string, string> = {}

  for (const field of WC_FORM_DEFINITIONS[formKey].fields) {
    const value = typeof fields[field.key] === 'string' ? (fields[field.key] as string) : ''

    if (value) values[field.key] = field.kind === 'date' ? printedDate(value) : value
  }

  if (signer.name) values.signer_line = signerLine(signer.name, signer.relationship)
  if (signer.signedDate) values.signed_date = printedDate(signer.signedDate)

  // The guidelines form prints the signer's name on its own line.
  if (formKey === 'injury_guidelines_ack' && signer.name) values.employee_name = signer.name.trim()

  return values
}

/** The printed signer line: "Name" or "Name (relationship)", e.g. "Pat Lee (Self)" or "Sam Lee (Parent)". */
export const signerLine = (name: string, relationship: string | null | undefined) => {
  const rel = (relationship || '').trim()

  return rel ? `${name.trim()} (${rel})` : name.trim()
}

/** Template layout with any per-template overrides applied (matched by text key or signature). */
export const layoutFor = (formKey: WcFormKey, overrides: unknown): WcFormPosition[] => {
  const base = WC_FORM_DEFINITIONS[formKey].layout

  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return base

  const map = overrides as Record<string, Partial<WcFormPosition>>

  return base.map(position => {
    const id = position.kind === 'text' ? position.key : position.kind === 'signature' ? 'signature' : null
    const override = id ? map[id] : null

    if (!override || typeof override !== 'object') return position

    const merged = { ...position } as Record<string, unknown>

    for (const [key, value] of Object.entries(override)) {
      if (['x', 'y', 'top', 'width', 'height', 'maxWidth'].includes(key) && typeof value === 'number' && value >= 0 && value <= 1) merged[key] = value
      if (key === 'size' && typeof value === 'number' && value >= 6 && value <= 24) merged[key] = value
    }

    return merged as WcFormPosition
  })
}

const EMAIL_PATTERN = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[A-Za-z]{2,}$/

export const WC_FORM_EMAIL_MAX_OUTSIDE = 10
export const WC_FORM_EMAIL_MAX_TOTAL = 20

/** Splits typed outside addresses (commas, semicolons, spaces or new lines) into unique, lowercase addresses. */
export const parseOutsideEmails = (raw: string) => {
  const valid: string[] = []
  const invalid: string[] = []

  for (const part of raw.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase()

    if (!email) continue
    if (!EMAIL_PATTERN.test(email) || email.length > 254) invalid.push(email)
    else if (!valid.includes(email)) valid.push(email)
  }

  return { valid, invalid }
}

/** Safe attachment file name, e.g. "WC-2026-0001 HIPAA Authorization.pdf". */
export const wcFormFileName = (caseNumber: string, formKey: WcFormKey, variant: 'filled' | 'blank' = 'filled') =>
  `${caseNumber} ${WC_FORM_DEFINITIONS[formKey].title}${variant === 'blank' ? ' (blank)' : ''}.pdf`.replace(/[^A-Za-z0-9 ._()-]/g, '_')
