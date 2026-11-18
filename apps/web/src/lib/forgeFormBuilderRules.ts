/**
 * Port slice 9 (piece A): pure rules for the form builder and the template library.
 * - Quick text mode: one field per line, `id|label|type|required|options` (options separated by `;`).
 * - CSV import into a new template draft: a structured sheet (label, type, required, options, ...) or a
 *   checklist (a column of questions → Yes / No / N/A fields with notes, 1.0 form-checklist-import).
 * - Library search and category filter.
 *
 * 1.0 reference (legacy/forge-platform/apps):
 * - industrial-web/src/lib/forms-module.ts parseFormFieldsInput / formatFormFieldsForEditor
 * - industrial-web/src/lib/form-checklist-import.ts and platform-api/src/modules/industrial/form-checklist-import.ts
 *
 * Excel (.xlsx) is not supported here: apps/web has no spreadsheet parser dependency. Save the sheet as CSV.
 */

import type { FormField, FormFieldType, FormSignatory } from './forgeFormRules.ts'
import { FORM_FIELD_TYPES, isDisplayField, isSignatureLabel, normalizeFieldType, slugFieldId } from './forgeFormRules.ts'

// ---------------------------------------------------------------------------
// Field types and blank fields
// ---------------------------------------------------------------------------

const CHOICE_TYPES: ReadonlySet<string> = new Set(['select', 'multiselect', 'radio'])

export const isChoiceType = (type: string) => CHOICE_TYPES.has(type)

const typeKey = (raw: unknown) =>
  String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s/-]+/g, '')

/** "Yes/No" and "Yes / No / N/A" read as yesno. */
const slashless = (raw: unknown) => String(raw ?? '').replace(/\//g, '')

const PLAIN_TEXT_NAMES = new Set(['text', 'string', 'input', 'shorttext'])

/** Whether a word names a field type (a 2.0 type or one of 1.0's aliases). */
export const isFieldTypeName = (raw: unknown) => {
  const key = typeKey(raw)

  if (!key) return false
  if (PLAIN_TEXT_NAMES.has(key)) return true
  if ((FORM_FIELD_TYPES as readonly string[]).includes(String(raw).trim().toLowerCase())) return true

  return normalizeFieldType(slashless(raw)) !== 'text'
}

/** 1.0 fieldType: an explicit non-text type wins; plain text or blank becomes a signature for "... Signature" labels. */
export const resolveFieldType = (raw: unknown, label: string): FormFieldType => {
  const type = normalizeFieldType(slashless(raw))

  if (type !== 'text') return type

  return isSignatureLabel(label) ? 'signature' : 'text'
}

/** A field id that is not taken yet: the label's slug, then slug-2, slug-3, ... */
export const uniqueFieldId = (label: string, taken: Iterable<string>) => {
  const used = new Set(taken)
  const base = slugFieldId(label)

  if (!used.has(base)) return base

  let index = 2

  while (used.has(`${base}-${index}`)) index += 1

  return `${base}-${index}`
}

export const blankField = (type: FormFieldType, taken: Iterable<string>): FormField => {
  const label = type === 'section' ? 'New section' : type === 'content' ? 'Instructions' : 'New question'
  const field: FormField = { id: uniqueFieldId(label, taken), label, type }

  if (isChoiceType(type)) field.options = ['Option 1', 'Option 2']
  if (type === 'signature') field.signatory = 'any'
  if (type === 'content') field.content = ''

  return field
}

/** Moves the item at `index` one place up (-1) or down (+1). Out-of-range moves return the list unchanged. */
export const moveItem = <T>(list: readonly T[], index: number, direction: -1 | 1): T[] => {
  const target = index + direction
  const next = [...list]

  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return next

  const [item] = next.splice(index, 1)

  next.splice(target, 0, item as T)

  return next
}

/** Fields a field's "show only when" condition may point at: answerable fields above it. */
export const conditionCandidates = (fields: readonly FormField[], index: number) =>
  fields.slice(0, Math.max(0, index)).filter(field => !isDisplayField(field) && field.type !== 'signature' && field.type !== 'photo')

/** The answers a condition can compare against for a field, when the field has a fixed list. */
export const conditionValues = (field: FormField | undefined): string[] => {
  if (!field) return []
  if (field.type === 'yesno') return ['Yes', 'No', 'N/A']
  if (field.type === 'checkbox') return ['Yes', 'No']
  if (isChoiceType(field.type)) return field.options || []

  return []
}

/** Changes a field's id and repoints conditions that referred to the old id. */
export const renameFieldId = (fields: readonly FormField[], oldId: string, newId: string): FormField[] =>
  fields.map(field => {
    const renamed = field.id === oldId ? { ...field, id: newId } : field

    return renamed.visibleWhen?.fieldId === oldId ? { ...renamed, visibleWhen: { ...renamed.visibleWhen, fieldId: newId } } : renamed
  })

/** How many fields someone answers (section headings and instructions are not counted). */
export const countAnswerFields = (fields: readonly { type: string }[] | null | undefined) =>
  (fields || []).filter(field => !isDisplayField(field as FormField)).length

// ---------------------------------------------------------------------------
// Quick text mode: id|label|type|required|options
// ---------------------------------------------------------------------------

const REQUIRED_WORDS = new Set(['required', 'req', 'true', 'yes', 'y', '1', '*'])
const OPTIONAL_WORDS = new Set(['optional', 'false', 'no', 'n', '0', ''])

const splitOptions = (raw: string) =>
  (raw.includes(';') ? raw.split(';') : raw.split(','))
    .map(part => part.trim())
    .filter(Boolean)

export type FieldLinesResult = { fields: FormField[]; errors: string[] }

/**
 * Turns quick-text lines into fields. Accepts `label|type`, `id|label|type`, `id|label|type|required|options`
 * and 1.0's `id|label|type|opt1,opt2` (options after the type, `required` anywhere after it). Options are
 * separated by `;` (or `,` when there is no `;`). Help text, instructions, signatory and conditions are kept
 * from `previous` for fields with the same id, since the text format has no place for them.
 */
export const parseFieldLines = (text: string, previous: readonly FormField[] = []): FieldLinesResult => {
  const errors: string[] = []
  const fields: FormField[] = []
  const used = new Set<string>()
  const before = new Map(previous.map(field => [field.id, field]))

  String(text || '')
    .split(/\r?\n/)
    .forEach((rawLine, lineIndex) => {
      const line = rawLine.trim()

      if (!line || line.startsWith('#')) return

      const parts = line.split('|').map(part => part.trim())
      let cursor = 0
      let id = ''

      // `id|label|type...` when the second part is not a type (1.0), or when it is (a label such as "Date")
      // but the third part is a type and the first looks like an id.
      if (
        parts.length >= 3 &&
        parts[0] &&
        (!isFieldTypeName(parts[1]) || (isFieldTypeName(parts[2]) && /^[a-z0-9][a-z0-9_-]*$/.test(parts[0])))
      ) {
        id = slugFieldId(parts[0])
        cursor = 1
      }

      const label = parts[cursor] || ''

      if (!label) {
        errors.push(`Line ${lineIndex + 1} has no label and was skipped.`)

        return
      }

      const typePart = parts[cursor + 1] || ''

      if (typePart && !isFieldTypeName(typePart)) errors.push(`Line ${lineIndex + 1}: "${typePart}" is not a field type; it was read as short text.`)

      const type = resolveFieldType(typePart, label)
      const tail = parts.slice(cursor + 2)
      let required = false
      let optionParts = tail

      if (tail.length && (REQUIRED_WORDS.has(tail[0]!.toLowerCase()) || OPTIONAL_WORDS.has(tail[0]!.toLowerCase()))) {
        required = REQUIRED_WORDS.has(tail[0]!.toLowerCase())
        optionParts = tail.slice(1)
      }

      if (optionParts.some(part => part.toLowerCase() === 'required')) {
        required = true
        optionParts = optionParts.filter(part => part.toLowerCase() !== 'required')
      }

      const options = splitOptions(optionParts.join(';'))

      if (!id) id = uniqueFieldId(label, used)

      if (used.has(id)) {
        errors.push(`Line ${lineIndex + 1}: the id "${id}" is used twice; it was renamed.`)
        id = uniqueFieldId(id, used)
      }

      used.add(id)

      const field: FormField = { id, label, type }

      if (required && !isDisplayField(field)) field.required = true

      if (isChoiceType(type)) {
        field.options = options

        if (!options.length) errors.push(`Line ${lineIndex + 1}: "${label}" needs options (separate them with ;).`)
      }

      const old = before.get(id)

      if (old) {
        if (old.help) field.help = old.help
        if (type === 'content' && old.content) field.content = old.content
        if (type === 'signature' && old.signatory) field.signatory = old.signatory
        if (old.visibleWhen) field.visibleWhen = { ...old.visibleWhen }
      }

      if (type === 'signature' && !field.signatory) field.signatory = 'any'

      fields.push(field)
    })

  return { fields, errors }
}

/** Fields as quick-text lines (keeps ids so answers and conditions still match after a round trip). */
export const formatFieldLines = (fields: readonly FormField[]) =>
  fields
    .map(field => {
      const parts = [field.id, field.label.replace(/\|/g, '/'), field.type]
      const options = isChoiceType(field.type) ? (field.options || []).map(option => option.replace(/[|;]/g, ' ').trim()).filter(Boolean) : []

      if (field.required || options.length) parts.push(field.required ? 'required' : 'optional')
      if (options.length) parts.push(options.join(';'))

      return parts.join('|')
    })
    .join('\n')

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180-ish CSV: quoted cells (with "" escapes and line breaks), `,` or `;` delimiter (whichever the first line has more of). */
export const parseCsv = (text: string): string[][] => {
  const source = String(text || '').replace(/^﻿/, '')
  const firstLine = source.split(/\r?\n/, 1)[0] || ''
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!

    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }

      continue
    }

    if (char === '"') quoted = true
    else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }

  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }

  return rows.map(cells => cells.map(value => value.replace(/ /g, ' ').trim())).filter(cells => cells.some(Boolean))
}

const headerKey = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, '')

const isAnswerHeader = (value: string) => ['yes', 'no', 'na', 'n/a', 'notes', 'note', 'comments'].includes(headerKey(value))

const QUESTION_HEADERS = new Set(['question', 'label', 'item', 'prompt', 'checklistitem', 'checklist', 'description', 'task', 'inspectionitem', 'field', 'fieldlabel', 'name'])
const SECTION_HEADERS = new Set(['section', 'category', 'group', 'area'])
const TITLE_HEADERS = new Set(['formname', 'title'])

export type ChecklistImport = {
  title: string
  mode: 'structured' | 'checklist' | 'outline'
  fields: FormField[]
  warnings: string[]
}

/** 1.0 toChecklistField: a required Yes / No / N/A question (the fill page adds a notes box, required on No). */
const checklistQuestion = (label: string, number: number): FormField => ({
  id: `${slugFieldId(label).slice(0, 52)}-${number}`,
  label,
  type: 'yesno',
  required: true
})

/** Adds a section heading field each time the section changes (1.0 kept the section on each question instead). */
const withSections = (items: { label: string; section: string }[]) => {
  const fields: FormField[] = []
  let current = ''
  let sectionNumber = 0

  items.forEach((item, index) => {
    if (item.section && item.section !== current) {
      sectionNumber += 1
      fields.push({ id: `section-${sectionNumber}-${slugFieldId(item.section).slice(0, 40)}`, label: item.section, type: 'section' })
    }

    current = item.section || current
    fields.push(checklistQuestion(item.label, index + 1))
  })

  return fields
}

/** Section headings in column A and questions in column B (section rows have only A). */
const isOutlineLayout = (rows: string[][]) => {
  let sectionOnly = 0
  let questionOnly = 0
  let both = 0

  for (const row of rows) {
    const [first = '', second = ''] = row

    if (!first && !second) continue
    if (first && !second) sectionOnly += 1
    else if (!first && second) questionOnly += 1
    else both += 1
  }

  return questionOnly >= 3 && sectionOnly >= 1 && questionOnly > both
}

const truthy = (value: string) => ['required', 'yes', 'y', 'true', '1', 'x', '*'].includes(String(value || '').trim().toLowerCase())

/**
 * Reads an uploaded CSV into template fields.
 * - Structured: a header row with a type column plus a label / question column (optional id, required,
 *   options, help, section columns). Options are separated by `;` or `|` (or `,` inside a quoted cell).
 * - Checklist (1.0): a question / item / label column, optional section and title columns; or, with no such
 *   header, the first column of every row is a question. Each question becomes a required Yes / No / N/A field.
 * - Outline (1.0 Excel layout): section headings alone in column A, questions in column B.
 */
export const parseTemplateCsv = (text: string, defaultTitle = 'Imported checklist'): ChecklistImport => {
  const rows = parseCsv(text)
  const warnings: string[] = []

  if (!rows.length) throw new Error('The CSV file is empty.')

  const headers = rows[0]!.map(headerKey)
  const typeIndex = headers.indexOf('type')
  const labelIndex = headers.findIndex(header => QUESTION_HEADERS.has(header))
  const titleIndex = headers.findIndex(header => TITLE_HEADERS.has(header))
  const sectionIndex = headers.findIndex(header => SECTION_HEADERS.has(header))
  const title = (titleIndex >= 0 && rows[1]?.[titleIndex]) || defaultTitle

  if (typeIndex >= 0 && labelIndex >= 0) {
    const idIndex = headers.findIndex(header => header === 'id' || header === 'key' || header === 'fieldid')
    const requiredIndex = headers.indexOf('required')
    const optionsIndex = headers.findIndex(header => header === 'options' || header === 'choices')
    const helpIndex = headers.findIndex(header => header === 'help' || header === 'helptext' || header === 'hint')
    const fields: FormField[] = []
    const used = new Set<string>()
    let currentSection = ''

    rows.slice(1).forEach((row, rowIndex) => {
      const label = row[labelIndex] || ''

      if (!label) return

      const section = sectionIndex >= 0 ? row[sectionIndex] || '' : ''

      if (section && section !== currentSection) {
        const sectionId = uniqueFieldId(`section-${section}`, used)

        used.add(sectionId)
        fields.push({ id: sectionId, label: section, type: 'section' })
        currentSection = section
      }

      const rawType = row[typeIndex] || ''

      if (rawType && !isFieldTypeName(rawType)) warnings.push(`Row ${rowIndex + 2}: "${rawType}" is not a field type; it was read as short text.`)

      const type = resolveFieldType(rawType, label)
      const id = uniqueFieldId((idIndex >= 0 && row[idIndex]) || label, used)

      used.add(id)

      const field: FormField = { id, label, type }

      if (!isDisplayField(field) && requiredIndex >= 0 && truthy(row[requiredIndex] || '')) field.required = true

      if (isChoiceType(type)) {
        const raw = optionsIndex >= 0 ? row[optionsIndex] || '' : ''

        field.options = (/[;|]/.test(raw) ? raw.split(/[;|]/) : raw.split(',')).map(option => option.trim()).filter(Boolean)
        if (!field.options.length) warnings.push(`Row ${rowIndex + 2}: "${label}" needs options.`)
      }

      if (type === 'signature') field.signatory = 'any'
      if (type === 'content') field.content = (optionsIndex >= 0 && row[optionsIndex]) || ''

      const help = helpIndex >= 0 ? row[helpIndex] || '' : ''

      if (help) field.help = help
      fields.push(field)
    })

    if (!fields.length) throw new Error('No fields found in the CSV rows.')

    return { title, mode: 'structured', fields, warnings }
  }

  if (labelIndex >= 0) {
    const items = rows
      .slice(1)
      .map(row => ({ label: row[labelIndex] || '', section: sectionIndex >= 0 ? row[sectionIndex] || '' : '' }))
      .filter(item => item.label && !isAnswerHeader(item.label))

    if (!items.length) throw new Error('No questions found in the CSV rows.')

    return { title, mode: 'checklist', fields: withSections(items), warnings }
  }

  if (isOutlineLayout(rows)) {
    const items: { label: string; section: string }[] = []
    let section = ''

    for (const [first = '', second = ''] of rows) {
      if (first && !second) {
        section = first

        continue
      }

      if (first && second) section = first

      const label = second || first

      if (label && !isAnswerHeader(label)) items.push({ label, section })
    }

    if (!items.length) throw new Error('No questions found. Put section headings in column A and questions in column B.')

    return { title: defaultTitle, mode: 'outline', fields: withSections(items), warnings }
  }

  // 1.0: no question header, so every row's first cell (the first row included) is a question.
  const items = rows.map(row => ({ label: row[0] || '', section: '' })).filter(item => item.label && !isAnswerHeader(item.label))

  if (!items.length) throw new Error('Could not find questions in the CSV.')

  return { title: defaultTitle, mode: 'checklist', fields: withSections(items), warnings }
}

/** A template title from an upload's file name ("Forklift Daily.csv" → "Forklift Daily"). */
export const titleFromFilename = (filename: string) =>
  String(filename || '')
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .trim()
    .slice(0, 200) || 'Imported checklist'

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export type LibraryTemplate = {
  id: string
  title: string
  description: string | null
  category: string | null
  status: 'draft' | 'active' | 'archived'
  version: number
  fieldCount: number
  publishedAt: string | null
  updatedAt: string | null
}

export const libraryCategories = (rows: readonly Pick<LibraryTemplate, 'category'>[]) =>
  [...new Set(rows.map(row => (row.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))

/** Search matches title, description and category; category '' means every category, '-' means none set. */
export const filterLibrary = <T extends Pick<LibraryTemplate, 'title' | 'description' | 'category'>>(
  rows: readonly T[],
  { search = '', category = '' }: { search?: string; category?: string }
) => {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)

  return rows.filter(row => {
    if (category === '-' ? Boolean(row.category) : category && (row.category || '').trim() !== category) return false

    const haystack = `${row.title} ${row.description || ''} ${row.category || ''}`.toLowerCase()

    return words.every(word => haystack.includes(word))
  })
}

export const SIGNATORY_LABELS: Record<FormSignatory, string> = {
  any: 'Person filling the form',
  supervisor: 'Supervisor',
  ehs_director: 'EHS Director'
}
