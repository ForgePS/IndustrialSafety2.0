/**
 * Port slice 9: pure parsing for the Forge 1.0 form catalog import. No imports with side effects, so unit
 * tests can load it. The server side (forgeFormImport.ts) writes what this returns.
 *
 * Accepts the same JSON 1.0 accepted at POST /industrial/forms/import (platform-api industrial/
 * form-catalog-import.ts parseFormCatalogImportPayload): `formTemplates` / `templates` / `definitions`,
 * `formSubmissions` / `submissions`, a single form with title and fields, Firebase freeze rows
 * ({sourceDocumentId, data: {...}}) and rows exported from industrial_form_definitions /
 * industrial_form_submissions ({id, title, status, schemaJson: {fields}} and {id, formDefinitionId, answers}).
 */

import type { FormField, FormSchema, FormSubmissionStatus, SignatureAnswer } from './forgeFormRules.ts'
import {
  employeeNumberFromAnswers,
  isSignatureLabel,
  normalizeAnswers,
  normalizeFieldType,
  normalizeFormSchema,
  normalizeYesNoAnswer,
  slugFieldId,
  yesNoNotesFieldId
} from './forgeFormRules.ts'

export const FORM_IMPORT_SOURCE_SYSTEM = 'forge_1x'
export const MAX_FORM_IMPORT_BYTES = 20 * 1024 * 1024
export const MAX_IMPORTED_IMAGE_CHARS = 1_000_000
export const MAX_IMPORTED_ANSWERS_CHARS = 3_500_000
export const MAX_IMPORTED_SCHEMA_CHARS = 250_000

export type ImportTemplateStatus = 'draft' | 'active' | 'archived'

export type ParsedImportTemplate = {
  sourceId: string
  title: string
  description: string | null
  category: string | null
  status: ImportTemplateStatus

  /** Active and archived 1.0 forms were in use, so they are published as version 1. */
  publish: boolean
  schema: FormSchema

  /** 1.0 field id → 2.0 field id, used to re-key answers. */
  idMap: Record<string, string>
  problems: string[]
}

export type ParsedImportSubmission = {
  sourceId: string
  templateSourceId: string | null
  title: string
  status: FormSubmissionStatus
  submittedAt: string | null
  createdAt: string | null
  rawAnswers: Record<string, unknown>
}

export type ParsedFormCatalog = {
  templates: ParsedImportTemplate[]
  submissions: ParsedImportSubmission[]
  problems: string[]
}

type Rec = Record<string, unknown>

const isRecord = (value: unknown): value is Rec => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** 1.0 unwrapJsonRecord: objects, or JSON text holding an object (up to three levels of string encoding). */
export const unwrapJsonRecord = (raw: unknown): Rec => {
  let current: unknown = raw

  for (let index = 0; index < 3; index += 1) {
    if (typeof current === 'string') {
      const trimmed = current.trim()

      if (!trimmed) return {}

      try {
        current = JSON.parse(trimmed)
        continue
      } catch {
        return {}
      }
    }

    return isRecord(current) ? { ...current } : {}
  }

  return {}
}

const text = (value: unknown, max = 500) => {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim().slice(0, max)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).slice(0, max)

  return ''
}

const firstText = (max: number, ...values: unknown[]) => {
  for (const value of values) {
    const result = text(value, max)

    if (result) return result
  }

  return ''
}

/** ISO timestamp from a date string, epoch millis or a Firestore timestamp ({seconds} / {_seconds}). */
export const legacyTimestamp = (value: unknown): string | null => {
  if (value == null || value === '') return null

  let date: Date | null = null

  if (isRecord(value)) {
    const seconds = Number(value.seconds ?? value._seconds)

    if (Number.isFinite(seconds)) date = new Date(seconds * 1000)
  } else if (typeof value === 'number') {
    date = new Date(value)
  } else if (typeof value === 'string') {
    date = new Date(value)
  }

  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

export const mapTemplateStatus = (raw: unknown, archivedAt?: unknown): ImportTemplateStatus => {
  const status = text(raw, 64).toUpperCase()

  if (status === 'ARCHIVED' || status === 'INACTIVE' || legacyTimestamp(archivedAt)) return 'archived'
  if (status === 'DRAFT') return 'draft'

  return 'active'
}

export const mapSubmissionStatus = (raw: unknown, archivedAt?: unknown): FormSubmissionStatus => {
  const status = text(raw, 64).toUpperCase().replace(/[\s-]+/g, '_')

  if (status === 'ARCHIVED' || legacyTimestamp(archivedAt)) return 'archived'
  if (status === 'DRAFT') return 'draft'
  if (status === 'PENDING_SIGNATURE' || status === 'PENDING_SIGNATURES' || status === 'AWAITING_SIGNATURE') return 'pending_signature'

  return 'submitted'
}

const optionList = (raw: unknown): string[] | undefined => {
  if (Array.isArray(raw)) {
    const options = raw
      .map(item => (isRecord(item) ? firstText(200, item.label, item.value, item.name) : text(item, 200)))
      .filter(Boolean)

    return options.length ? options : undefined
  }

  if (typeof raw === 'string' && raw.trim()) {
    const options = raw
      .split(/[\n,|;]/)
      .map(part => part.trim())
      .filter(Boolean)

    return options.length ? options : undefined
  }

  return undefined
}

const stripHtml = (value: string) =>
  value
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()

/** Every field array a 1.0 definition may hold (1.0 form-print collectFieldArrays). */
const collectFieldArrays = (root: unknown): unknown[] => {
  if (Array.isArray(root)) return root

  const rec = unwrapJsonRecord(root)
  const out: unknown[] = []

  for (const bucket of [rec.fields, rec.questions, rec.formFields, rec.items, rec.elements, rec.schema]) {
    if (Array.isArray(bucket)) out.push(...bucket)

    const nested = unwrapJsonRecord(bucket)

    if (Array.isArray(nested.fields)) out.push(...nested.fields)
    if (Array.isArray(nested.questions)) out.push(...nested.questions)
  }

  if (Array.isArray(rec.sections)) {
    for (const section of rec.sections) {
      const sec = unwrapJsonRecord(section)
      const title = firstText(300, sec.title, sec.label, sec.name)

      if (title) out.push({ id: sec.id ?? `section-${title}`, label: title, type: 'section' })
      if (Array.isArray(sec.fields)) out.push(...sec.fields)
      if (Array.isArray(sec.questions)) out.push(...sec.questions)
    }
  }

  return out
}

/**
 * 1.0 fields → raw 2.0 fields with unique slug ids (so normalizeFormSchema keeps them unchanged), and the
 * 1.0 id → 2.0 id map for answers. 1.0 rules kept: an explicit date type wins, a plain text field labelled
 * "... Signature" (not "Signature Date") is a signature pad, Yes / No / N/A fields were required.
 */
export const legacyFieldsToSchema = (rawFields: unknown[]) => {
  const idMap: Record<string, string> = {}
  const seen = new Set<string>()
  const fields: Rec[] = []

  rawFields.forEach((raw, index) => {
    const rec: Rec = typeof raw === 'string' ? { label: raw } : unwrapJsonRecord(raw)

    if (!Object.keys(rec).length) return

    const rawId = firstText(200, rec.id, rec.key, rec.name, rec.fieldId) || `field-${index + 1}`
    const label = firstText(300, rec.label, rec.title, rec.question, rec.name, rec.prompt) || rawId
    const declared = rec.type ?? rec.inputType ?? rec.fieldType
    const declaredKey = text(declared, 60).toLowerCase()

    let type: string = declaredKey === 'date' || declaredKey === 'datetime' ? 'date' : normalizeFieldType(declared)

    if (type === 'text' && isSignatureLabel(label)) type = 'signature'

    let id = slugFieldId(rawId)

    if (seen.has(id)) {
      let suffix = 2

      while (seen.has(`${id}-${suffix}`)) suffix += 1
      id = `${id}-${suffix}`
    }

    seen.add(id)
    if (!(rawId in idMap)) idMap[rawId] = id

    const field: Rec = { id, label, type }

    if (rec.required === true || rec.required === 'true' || rec.isRequired === true || rec.mandatory === true) field.required = true
    if (type === 'yesno' && ['yesno', 'yes_no_na', 'checklist'].includes(declaredKey)) field.required = true

    const options = optionList(rec.options ?? rec.choices ?? rec.values)

    if (options) field.options = options

    if ((type === 'select' || type === 'radio' || type === 'multiselect') && !options) field.type = 'text'

    const help = firstText(500, rec.help, rec.helpText, rec.hint)

    if (help) field.help = help

    if (type === 'content') {
      const content = stripHtml(firstText(4000, rec.content, rec.body, rec.html, rec.placeholder, rec.text))

      if (content) field.content = content
    }

    if (type === 'signature' && (rec.signatory === 'any' || rec.signatory === 'supervisor' || rec.signatory === 'ehs_director')) {
      field.signatory = rec.signatory
    }

    const condition = unwrapJsonRecord(rec.visibleWhen ?? rec.showIf ?? rec.when)
    const target = firstText(200, condition.fieldId, condition.field, condition.id)

    if (target) {
      field.visibleWhen = { fieldId: idMap[target] ?? slugFieldId(target), equals: firstText(200, condition.equals, condition.value, condition.is) }
    }

    fields.push(field)
  })

  const { schema, errors } = normalizeFormSchema({ fields })

  return { schema, idMap, errors }
}

const recordData = (raw: unknown) => {
  const rec = unwrapJsonRecord(raw)
  const nested = unwrapJsonRecord(rec.data)

  return { rec, data: Object.keys(nested).length ? nested : rec }
}

const parseTemplate = (raw: unknown, index: number): ParsedImportTemplate | null => {
  const { rec, data } = recordData(raw)

  if (!Object.keys(data).length) return null

  const sourceId = firstText(200, rec.sourceDocumentId, data.id, data.templateId) || `import-template-${index + 1}`
  const title = firstText(200, data.title, data.name, rec.title, rec.name) || 'Form'
  const schemaRoot = unwrapJsonRecord(data.schemaJson ?? data.schema_json ?? data.schema)

  let rawFields = collectFieldArrays(schemaRoot)

  if (!rawFields.length) rawFields = collectFieldArrays(data)

  const { schema, idMap, errors } = legacyFieldsToSchema(rawFields)
  const status = mapTemplateStatus(data.status ?? rec.status, data.archivedAt ?? data.archived_at)
  const problems = errors.map(error => `${title}: ${error}`)

  if (!schema.fields.length) problems.push(`${title}: the form has no fields.`)
  if (JSON.stringify(schema).length > MAX_IMPORTED_SCHEMA_CHARS) problems.push(`${title}: the form is too large to import.`)

  return {
    sourceId,
    title,
    description: firstText(4000, data.description, schemaRoot.description) || null,
    category: firstText(100, data.category, schemaRoot.category) || null,
    status,
    publish: status !== 'draft',
    schema,
    idMap,
    problems
  }
}

const parseSubmission = (raw: unknown, index: number): ParsedImportSubmission | null => {
  const { rec, data } = recordData(raw)

  if (!Object.keys(data).length) return null

  const sourceId = firstText(200, rec.sourceDocumentId, data.id) || `import-submission-${index + 1}`
  const templateSourceId = firstText(200, data.templateId, data.formTemplateId, data.formDefinitionId, data.form_definition_id) || null
  const answersSource = data.answers ?? data.responses ?? data.values
  let rawAnswers = unwrapJsonRecord(answersSource)

  // 1.0 kept Firebase answers in source_payload.responses when the answers column was empty.
  if (!Object.keys(rawAnswers).length) {
    const payload = unwrapJsonRecord(data.sourcePayload ?? data.source_payload)

    rawAnswers = unwrapJsonRecord(payload.responses ?? payload.answers ?? payload.values)
  }

  return {
    sourceId,
    templateSourceId,
    title: firstText(300, data.templateName, data.title, data.name) || 'Form submission',
    status: mapSubmissionStatus(data.status, data.archivedAt ?? data.archived_at),
    submittedAt: legacyTimestamp(data.submittedAt ?? data.submitted_at ?? data.createdAt),
    createdAt: legacyTimestamp(data.createdAt ?? data.created_at),
    rawAnswers
  }
}

/** Parses an uploaded 1.0 catalog (already JSON.parse'd). */
export const parseFormCatalog = (payload: unknown): ParsedFormCatalog => {
  const body = Array.isArray(payload) ? { formTemplates: payload } : unwrapJsonRecord(payload)
  const problems: string[] = []
  const templateRows: unknown[] = []
  const submissionRows: unknown[] = []

  for (const key of ['formTemplates', 'templates', 'definitions', 'formDefinitions']) {
    if (Array.isArray(body[key])) templateRows.push(...(body[key] as unknown[]))
  }

  if (!templateRows.length && (body.fields || body.schemaJson || body.title || body.name)) templateRows.push(body)

  for (const key of ['formSubmissions', 'submissions']) {
    if (Array.isArray(body[key])) submissionRows.push(...(body[key] as unknown[]))
  }

  const templates: ParsedImportTemplate[] = []
  const templateIds = new Set<string>()

  templateRows.forEach((row, index) => {
    const parsed = parseTemplate(row, index)

    if (!parsed) return

    if (templateIds.has(parsed.sourceId)) {
      problems.push(`Form "${parsed.title}" (${parsed.sourceId}) is in the file twice; the first copy is used.`)

      return
    }

    templateIds.add(parsed.sourceId)
    templates.push(parsed)
  })

  const submissions: ParsedImportSubmission[] = []
  const submissionIds = new Set<string>()

  submissionRows.forEach((row, index) => {
    const parsed = parseSubmission(row, index)

    if (!parsed || submissionIds.has(parsed.sourceId)) return

    submissionIds.add(parsed.sourceId)
    submissions.push(parsed)
  })

  if (!templates.length && !submissions.length) {
    problems.push('No forms found. Upload the JSON with formTemplates (or templates) and optionally formSubmissions.')
  }

  return { templates, submissions, problems }
}

const IMAGE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i
const URL_IMAGE = /^https?:\/\/\S+$/i

const usableImage = (value: unknown) => {
  const image = typeof value === 'string' ? value.trim() : ''

  if (!image || image.length > MAX_IMPORTED_IMAGE_CHARS) return ''

  return IMAGE.test(image) || (URL_IMAGE.test(image) && image.length <= 2000) ? image : ''
}

/**
 * A 1.0 signature answer (a data URL string, or {image | dataUrl | url, signedAt, signedByName | signedBy})
 * as a 2.0 SignatureAnswer marked 'imported'. Null when nothing usable was signed.
 */
export const signatureFromLegacy = (value: unknown, fallbackAt: string | null): SignatureAnswer | null => {
  if (value == null || value === '') return null

  if (typeof value === 'string') {
    const image = usableImage(value)

    if (image) return { image, signedAt: fallbackAt || '', signedByName: '', signedByUserId: null, method: 'imported' }

    // A typed name in place of a drawn signature.
    const name = text(value, 200)

    return name && !value.trim().startsWith('data:') ? { image: '', signedAt: fallbackAt || '', signedByName: name, signedByUserId: null, method: 'imported' } : null
  }

  if (!isRecord(value)) return null

  const image = usableImage(value.image ?? value.dataUrl ?? value.url)
  const signedAt = legacyTimestamp(value.signedAt) || ''
  const signedByName = firstText(200, value.signedByName, value.signedBy, value.name)

  if (!image && !signedAt && !signedByName) return null

  return { image, signedAt: signedAt || fallbackAt || '', signedByName, signedByUserId: null, method: 'imported' }
}

/** 1.0 flattenFormResponseValue, without the signature case (signatures are mapped separately). */
const flattenValue = (value: unknown): unknown => {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(flattenValue).filter(item => item != null)

  if (isRecord(value)) {
    for (const key of ['value', 'answer', 'label', 'text']) {
      if (typeof value[key] === 'string' || typeof value[key] === 'number' || typeof value[key] === 'boolean') return value[key]
    }

    for (const key of ['image', 'dataUrl', 'url']) if (typeof value[key] === 'string' && value[key]) return value[key]
  }

  return null
}

const checked = (value: unknown) => {
  if (value === true || value === 1) return true

  return ['true', '1', 'yes', 'y', 'on', 'checked', 'x'].includes(text(value, 20).toLowerCase())
}

const EMPLOYEE_NUMBER_KEYS = ['employeeNumber', 'employee_number', 'empNumber', 'emp_number', 'employeeNo', 'employee_no']

/**
 * Re-keys 1.0 answers onto the 2.0 fields (by 1.0 id, by slug, then by label), converts each to the 2.0
 * shape and cleans them with normalizeAnswers. 1.0 photos (embedded images or storage links) are not carried over.
 */
export const mapLegacyAnswers = (
  fields: FormField[],
  idMap: Record<string, string>,
  raw: Record<string, unknown>,
  fallbackAt: string | null
) => {
  const problems: string[] = []
  const byId = new Map(fields.map(field => [field.id, field]))
  const byLabel = new Map(fields.map(field => [field.label.trim().toLowerCase(), field.id]))

  const resolve = (key: string) => {
    if (idMap[key]) return idMap[key]

    const slug = slugFieldId(key)

    if (byId.has(slug)) return slug

    return byLabel.get(key.trim().toLowerCase()) ?? null
  }

  const keyed: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (key.endsWith('__notes')) {
      const base = resolve(key.slice(0, -'__notes'.length))

      if (base) keyed[yesNoNotesFieldId(base)] = flattenValue(value)
      continue
    }

    const id = resolve(key)

    if (id && !(id in keyed)) keyed[id] = value
  }

  const converted: Record<string, unknown> = {}
  let droppedPhotos = 0

  for (const field of fields) {
    const notes = keyed[yesNoNotesFieldId(field.id)]

    if (notes != null) converted[yesNoNotesFieldId(field.id)] = notes
    if (!(field.id in keyed)) continue

    const value = keyed[field.id]

    if (field.type === 'signature') {
      const signature = signatureFromLegacy(value, fallbackAt)

      if (signature) converted[field.id] = signature
    } else if (field.type === 'photo') {
      // 2.0 photo answers are forge_record_evidence ids; 1.0 photos were embedded images or storage links.
      droppedPhotos += (Array.isArray(value) ? value : [value]).map(flattenValue).filter(item => item != null && item !== '').length
      converted[field.id] = []
    } else if (field.type === 'checkbox') {
      converted[field.id] = checked(flattenValue(value))
    } else if (field.type === 'yesno') {
      converted[field.id] = normalizeYesNoAnswer(flattenValue(value)) || ''
    } else {
      const flat = flattenValue(value)

      converted[field.id] = Array.isArray(flat) && field.type !== 'multiselect' ? flat.join(', ') : flat
    }
  }

  if (droppedPhotos) problems.push(`${droppedPhotos} embedded photo${droppedPhotos === 1 ? '' : 's'} not carried over.`)

  const answers = normalizeAnswers(fields, converted)

  let employeeNumber = employeeNumberFromAnswers(fields, answers)

  if (!employeeNumber) {
    for (const key of EMPLOYEE_NUMBER_KEYS) {
      const value = text(flattenValue(raw[key]), 100)

      if (value) {
        employeeNumber = value
        break
      }
    }
  }

  if (JSON.stringify(answers).length > MAX_IMPORTED_ANSWERS_CHARS) problems.push('The answers are too large to import.')

  return { answers, employeeNumber, problems }
}
