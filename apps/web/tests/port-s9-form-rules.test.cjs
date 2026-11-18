/**
 * Port slice 9 (piece D): unit tests for the shared form rules (src/lib/forgeFormRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s9-form-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeFormRules.ts'))

const SIG = { image: 'data:image/png;base64,AAAA', signedAt: '2026-11-17T10:00:00.000Z', signedByName: 'Sam Signer', signedByUserId: null, method: 'in_app' }

const schema = fields => rules.normalizeFormSchema({ fields }).schema.fields

test('normalizeFieldType maps 1.0 aliases and falls back to short text', () => {
  const cases = {
    string: 'text',
    paragraph: 'textarea',
    dropdown: 'select',
    'multi-select': 'multiselect',
    boolean: 'checkbox',
    yes_no_na: 'yesno',
    checklist: 'yesno',
    signaturePad: 'signature',
    draw: 'signature',
    image: 'photo',
    camera: 'photo',
    employeeNumber: 'employee_number',
    emp_number: 'employee_number',
    site: 'location',
    label: 'section',
    heading: 'section',
    html: 'content',
    instructions: 'content',
    datetime: 'date',
    phone: 'tel',
    integer: 'number',
    mystery: 'text',
    '': 'text'
  }

  for (const [raw, expected] of Object.entries(cases)) assert.equal(rules.normalizeFieldType(raw), expected, raw)
})

test('normalizeFormSchema accepts a bare array and label aliases, slugs ids and keeps unique ids', () => {
  const { schema: result, errors } = rules.normalizeFormSchema([
    { title: 'Employee Name', type: 'string', required: 'true' },
    { name: 'Employee Name' },
    { key: 'Shift Notes', label: 'Notes', type: 'paragraph' },
    { label: '' },
    'not an object'
  ])

  assert.deepEqual(errors, [])
  assert.deepEqual(
    result.fields.map(field => [field.id, field.type]),
    [
      ['employee-name', 'text'],
      ['employee-name-2', 'text'],
      ['shift-notes', 'textarea']
    ]
  )
  assert.equal(result.fields[0].required, true)
  assert.equal(result.fields[1].required, undefined)
})

test('normalizeFormSchema requires options on choice fields and de-duplicates them', () => {
  const { schema: result, errors } = rules.normalizeFormSchema({
    fields: [
      { id: 'shift', label: 'Shift', type: 'select', options: 'Day, Night; Day' },
      { id: 'ppe', label: 'PPE', type: 'multiselect', options: [] }
    ]
  })

  assert.deepEqual(result.fields[0].options, ['Day', 'Night'])
  assert.deepEqual(result.fields[1].options, [])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /"PPE" needs at least one option/)
})

test('signature fields: inferred from 1.0 labels, signatory from the label, "Signature Date" is not a signature', () => {
  const fields = schema([
    { label: 'Employee Signature' },
    { label: 'Supervisor Signature' },
    { label: 'EHS Director Signature' },
    { label: 'Safety Director Sign-off', type: 'signature' },
    { label: 'Signature Date' },
    { label: 'Signature Date', type: 'date' },
    { label: 'Witness', type: 'signature', signatory: 'supervisor' }
  ])

  assert.deepEqual(
    fields.map(field => [field.label, field.type, field.signatory]),
    [
      ['Employee Signature', 'signature', 'any'],
      ['Supervisor Signature', 'signature', 'supervisor'],
      ['EHS Director Signature', 'signature', 'ehs_director'],
      ['Safety Director Sign-off', 'signature', 'ehs_director'],
      ['Signature Date', 'text', undefined],
      ['Signature Date', 'date', undefined],
      ['Witness', 'signature', 'supervisor']
    ]
  )

  assert.equal(rules.isSignatureLabel('Date of Signature'), false)
  assert.equal(rules.isSignatureLabel('Sign here'), true)
  assert.equal(rules.inferSignatory({ label: 'Signature', id: 'ehs_signature' }), 'ehs_director')
})

test('normalizeFormSchema keeps visibleWhen pointing at an earlier field and drops forward or self references', () => {
  const { schema: result, errors } = rules.normalizeFormSchema({
    fields: [
      { id: 'injured', label: 'Anyone injured?', type: 'yesno' },
      { id: 'details', label: 'Injury details', visibleWhen: { fieldId: 'injured', equals: 'Yes' } },
      { id: 'early', label: 'Early', visibleWhen: { fieldId: 'later', equals: 'x' } },
      { id: 'self', label: 'Self', visibleWhen: { fieldId: 'self', equals: 'x' } },
      { id: 'later', label: 'Later' }
    ]
  })

  assert.deepEqual(result.fields[1].visibleWhen, { fieldId: 'injured', equals: 'Yes' })
  assert.equal(result.fields[2].visibleWhen, undefined)
  assert.equal(result.fields[3].visibleWhen, undefined)
  assert.equal(errors.length, 2)
})

test('section and content fields are never required; content keeps its text', () => {
  const fields = schema([
    { label: 'Part A', type: 'heading', required: true },
    { type: 'instructions', content: 'Read before you start.' }
  ])

  assert.deepEqual(fields[0], { id: 'part-a', label: 'Part A', type: 'section' })
  assert.equal(fields[1].type, 'content')
  assert.equal(fields[1].label, 'Instructions')
  assert.equal(fields[1].content, 'Read before you start.')
})

const FORM = schema([
  { id: 'name', label: 'Name', required: true },
  { id: 'guard', label: 'Guard in place?', type: 'yesno', required: true },
  { id: 'injured', label: 'Anyone injured?', type: 'yesno' },
  { id: 'details', label: 'Injury details', visibleWhen: { fieldId: 'injured', equals: 'Yes' } },
  { id: 'ppe', label: 'PPE', type: 'multiselect', options: ['Gloves', 'Glasses', 'Boots'] },
  { id: 'ack', label: 'I acknowledge', type: 'checkbox' },
  { id: 'note', label: 'Note', type: 'content', content: 'Static' },
  { id: 'count', label: 'Count', type: 'number' },
  { id: 'email', label: 'Email', type: 'email' },
  { id: 'day', label: 'Day', type: 'date' },
  { id: 'at', label: 'At', type: 'time' },
  { id: 'shift', label: 'Shift', type: 'select', options: ['Day', 'Night'] },
  { id: 'employee-sig', label: 'Employee Signature', required: true },
  { id: 'supervisor-sig', label: 'Supervisor Signature', required: true },
  { id: 'ehs-sig', label: 'EHS Director Signature', required: true }
])

test('normalizeAnswers keeps known fields, yes/no notes, multiselect lists and checkboxes; drops hidden fields', () => {
  const answers = rules.normalizeAnswers(FORM, {
    name: '  Pat  ',
    guard: 'no',
    guard__notes: ' Guard missing on press 4 ',
    injured: 'N',
    details: 'should be dropped (hidden)',
    ppe: 'Gloves, Boots',
    ack: 'on',
    note: 'not stored',
    stranger: 'not on the form',
    'employee-sig': SIG,
    'supervisor-sig': 'a string is not a signature object'
  })

  assert.equal(answers.name, 'Pat')
  assert.equal(answers.guard, 'No')
  assert.equal(answers.guard__notes, 'Guard missing on press 4')
  assert.equal(answers.injured, 'No')
  assert.equal('details' in answers, false)
  assert.deepEqual(answers.ppe, ['Gloves', 'Boots'])
  assert.equal(answers.ack, true)
  assert.equal('note' in answers, false)
  assert.equal('stranger' in answers, false)
  assert.deepEqual(answers['employee-sig'], SIG)
  assert.equal('supervisor-sig' in answers, false)

  const shown = rules.normalizeAnswers(FORM, { injured: 'yes', details: 'Cut finger', ack: false, ppe: ['Gloves', ' '] })

  assert.equal(shown.details, 'Cut finger')
  assert.equal(shown.ack, false)
  assert.deepEqual(shown.ppe, ['Gloves'])
})

test('validateAnswers: drafts only check formats; final checks required fields and the note on No', () => {
  const draft = rules.validateAnswers(FORM, { count: 'abc', email: 'nope', day: '2026-13-45', at: '25', shift: 'Swing', ppe: ['Hat'] }, { final: false })

  assert.deepEqual(draft.map(error => error.fieldId).sort(), ['at', 'count', 'day', 'email', 'ppe', 'shift'])

  const final = rules.validateAnswers(FORM, { guard: 'No' }, { final: true })
  const ids = final.map(error => error.fieldId)

  assert.ok(ids.includes('name'))
  assert.ok(ids.includes('guard'))
  assert.match(final.find(error => error.fieldId === 'guard').message, /Add a note/)
  assert.ok(ids.includes('employee-sig'))
  assert.equal(ids.includes('supervisor-sig'), false, 'supervisor signs later')
  assert.equal(ids.includes('ehs-sig'), false, 'EHS Director signs later')

  const ok = rules.validateAnswers(
    FORM,
    { name: 'Pat', guard: 'No', guard__notes: 'Fixed', count: '3', email: 'a@b.co', day: '2026-11-17', at: '07:30', shift: 'Day', 'employee-sig': SIG },
    { final: true }
  )

  assert.deepEqual(ok, [])
  assert.equal(rules.validateAnswers(FORM, { guard: 'No' }, { final: false }).length, 0)
})

test('resolveSubmissionStatus: draft stays draft, pending until supervisor and EHS sign, archived stays archived', () => {
  assert.equal(rules.resolveSubmissionStatus(FORM, {}, 'draft'), 'draft')
  assert.equal(rules.resolveSubmissionStatus(FORM, {}, 'draft', 'draft'), 'draft')
  assert.equal(rules.resolveSubmissionStatus(FORM, {}, 'submit'), 'pending_signature')
  assert.equal(rules.resolveSubmissionStatus(FORM, { 'supervisor-sig': SIG }, 'submit'), 'pending_signature')
  assert.equal(rules.resolveSubmissionStatus(FORM, { 'supervisor-sig': SIG, 'ehs-sig': SIG }, 'submit'), 'submitted')
  assert.equal(rules.resolveSubmissionStatus(FORM, { 'supervisor-sig': SIG, 'ehs-sig': SIG }, 'draft', 'pending_signature'), 'submitted')
  assert.equal(rules.resolveSubmissionStatus(FORM, {}, 'submit', 'archived'), 'archived')
  assert.equal(rules.resolveSubmissionStatus(schema([{ id: 'a', label: 'A' }]), {}, 'submit'), 'submitted')

  assert.deepEqual(
    rules.missingDirectorSignatures(FORM, { 'supervisor-sig': SIG }).map(field => field.id),
    ['ehs-sig']
  )
})

test('formatAnswer gives one line per answer', () => {
  const byId = Object.fromEntries(FORM.map(field => [field.id, field]))
  const photo = schema([{ id: 'pics', label: 'Photos', type: 'photo' }])[0]

  assert.equal(rules.formatAnswer(byId.name, 'Pat'), 'Pat')
  assert.equal(rules.formatAnswer(byId.name, ''), '')
  assert.equal(rules.formatAnswer(byId.name, null), '')
  assert.equal(rules.formatAnswer(byId.count, 0), '0')
  assert.equal(rules.formatAnswer(byId.ack, true), 'Yes')
  assert.equal(rules.formatAnswer(byId.ack, false), 'No')
  assert.equal(rules.formatAnswer(byId.ppe, ['Gloves', 'Boots']), 'Gloves, Boots')
  assert.equal(rules.formatAnswer(photo, ['a']), '1 photo')
  assert.equal(rules.formatAnswer(photo, ['a', 'b']), '2 photos')
  assert.equal(rules.formatAnswer(byId['employee-sig'], SIG), 'Signed by Sam Signer')
  assert.equal(rules.formatAnswer(byId['employee-sig'], {}), '')
})

test('employeeNumberFromAnswers and normalizeYesNoAnswer', () => {
  const fields = schema([{ id: 'emp', label: 'Employee #', type: 'employee_number' }])

  assert.equal(rules.employeeNumberFromAnswers(fields, { emp: ' E-100 ' }), 'E-100')
  assert.equal(rules.employeeNumberFromAnswers(fields, {}), null)
  assert.equal(rules.normalizeYesNoAnswer('y'), 'Yes')
  assert.equal(rules.normalizeYesNoAnswer('NA'), 'N/A')
  assert.equal(rules.normalizeYesNoAnswer('maybe'), null)
  assert.equal(rules.yesNoNotesFieldId('guard'), 'guard__notes')
})
