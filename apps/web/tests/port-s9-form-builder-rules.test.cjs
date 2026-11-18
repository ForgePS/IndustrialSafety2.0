/**
 * Port slice 9 (piece A): unit tests for src/lib/forgeFormBuilderRules.ts (quick text mode, CSV / checklist
 * import, builder helpers, library filter).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s9-form-builder-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeFormBuilderRules.ts'))
const formRules = require(path.join(__dirname, '../src/lib/forgeFormRules.ts'))

test('parseFieldLines reads id|label|type|required|options and label|type lines', () => {
  const { fields, errors } = rules.parseFieldLines(
    [
      'crew|Crew name|text|required',
      'Shift|select|required|Day;Night;Swing',
      'Notes|textarea',
      'ppe|PPE worn|multiselect|optional|Hard hat;Gloves',
      '',
      '# comments are ignored',
      'Supervisor Signature'
    ].join('\n')
  )

  assert.deepEqual(errors, [])
  assert.deepEqual(fields[0], { id: 'crew', label: 'Crew name', type: 'text', required: true })
  assert.deepEqual(fields[1], { id: 'shift', label: 'Shift', type: 'select', required: true, options: ['Day', 'Night', 'Swing'] })
  assert.deepEqual(fields[2], { id: 'notes', label: 'Notes', type: 'textarea' })
  assert.deepEqual(fields[3], { id: 'ppe', label: 'PPE worn', type: 'multiselect', options: ['Hard hat', 'Gloves'] })
  assert.equal(fields[4].type, 'signature', 'a "... Signature" label becomes a signature pad (1.0)')
  assert.equal(fields[4].signatory, 'any')
})

test('parseFieldLines accepts 1.0 lines (options after the type, comma separated, required anywhere)', () => {
  const { fields } = rules.parseFieldLines('area|Area|dropdown|North,South|required\nphone|Phone|tel')

  assert.deepEqual(fields[0], { id: 'area', label: 'Area', type: 'select', required: true, options: ['North', 'South'] })
  assert.deepEqual(fields[1], { id: 'phone', label: 'Phone', type: 'tel' })
})

test('parseFieldLines reports unknown types, missing options and duplicate ids', () => {
  const { fields, errors } = rules.parseFieldLines('a|First|bogus\na|Second|text\nPick one|radio')

  assert.equal(fields[0].type, 'text')
  assert.equal(fields[1].id, 'a-2')
  assert.equal(errors.length, 3)
  assert.match(errors[0], /"bogus" is not a field type/)
  assert.match(errors[1], /used twice/)
  assert.match(errors[2], /needs options/)
})

test('formatFieldLines and parseFieldLines round trip, keeping help, content, signatory and conditions', () => {
  const fields = [
    { id: 'date', label: 'Date', type: 'date', required: true },
    { id: 'guard-ok', label: 'Guards in place', type: 'yesno', required: true, help: 'Check every guard' },
    { id: 'why', label: 'Why not', type: 'textarea', visibleWhen: { fieldId: 'guard-ok', equals: 'No' } },
    { id: 'shift', label: 'Shift', type: 'radio', options: ['Day', 'Night'] },
    { id: 'intro', label: 'Read first', type: 'content', content: 'Lock out before you start.' },
    { id: 'sup-sign', label: 'Supervisor sign-off', type: 'signature', signatory: 'supervisor', required: true }
  ]
  const text = rules.formatFieldLines(fields)

  assert.equal(
    text,
    [
      'date|Date|date|required',
      'guard-ok|Guards in place|yesno|required',
      'why|Why not|textarea',
      'shift|Shift|radio|optional|Day;Night',
      'intro|Read first|content',
      'sup-sign|Supervisor sign-off|signature|required'
    ].join('\n')
  )

  const { fields: back, errors } = rules.parseFieldLines(text, fields)

  assert.deepEqual(errors, [])
  assert.deepEqual(back, fields)
})

test('the text-mode result is accepted by normalizeFormSchema without errors', () => {
  const { fields } = rules.parseFieldLines('Inspector|text|required\nPass?|yesno|required\nEHS Director Signature|signature')
  const { schema, errors } = formRules.normalizeFormSchema({ fields })

  assert.deepEqual(errors, [])
  assert.equal(schema.fields.length, 3)
})

test('parseCsv handles quotes, escaped quotes, line breaks in cells, semicolons and a BOM', () => {
  assert.deepEqual(rules.parseCsv('\ufeffa,b\n"x, y","say ""hi"""\n"multi\nline",z\n\n'), [
    ['a', 'b'],
    ['x, y', 'say "hi"'],
    ['multi\nline', 'z']
  ])
  assert.deepEqual(rules.parseCsv('q;section\nOne;A\r\nTwo;B'), [
    ['q', 'section'],
    ['One', 'A'],
    ['Two', 'B']
  ])
})

test('parseTemplateCsv: a single column of questions becomes required Yes/No/N/A fields (1.0 checklist)', () => {
  const result = rules.parseTemplateCsv('Fire extinguisher charged\nExits clear\nFirst aid kit stocked', 'Weekly walk')

  assert.equal(result.mode, 'checklist')
  assert.equal(result.title, 'Weekly walk')
  assert.deepEqual(
    result.fields.map(field => [field.label, field.type, field.required]),
    [
      ['Fire extinguisher charged', 'yesno', true],
      ['Exits clear', 'yesno', true],
      ['First aid kit stocked', 'yesno', true]
    ]
  )
  assert.equal(result.fields[1].id, 'exits-clear-2')
})

test('parseTemplateCsv: question + section + title columns add section headings and the title', () => {
  const csv = 'Form Name,Section,Question,Yes,No,Notes\nForklift daily,Pre-start,Horn works,,,\n,Pre-start,Brakes work,,,\n,Load,Forks not bent,,,'
  const result = rules.parseTemplateCsv(csv, 'fallback')

  assert.equal(result.mode, 'checklist')
  assert.equal(result.title, 'Forklift daily')
  assert.deepEqual(
    result.fields.map(field => `${field.type}:${field.label}`),
    ['section:Pre-start', 'yesno:Horn works', 'yesno:Brakes work', 'section:Load', 'yesno:Forks not bent']
  )
  const { errors } = formRules.normalizeFormSchema({ fields: result.fields })

  assert.deepEqual(errors, [])
})

test('parseTemplateCsv: outline layout (section in column A, questions in column B)', () => {
  const csv = 'Housekeeping,\n,Floors clean\n,Aisles clear\nElectrical,\n,Panels closed\n,Cords intact'
  const result = rules.parseTemplateCsv(csv, 'Plant audit')

  assert.equal(result.mode, 'outline')
  assert.deepEqual(
    result.fields.map(field => `${field.type}:${field.label}`),
    ['section:Housekeeping', 'yesno:Floors clean', 'yesno:Aisles clear', 'section:Electrical', 'yesno:Panels closed', 'yesno:Cords intact']
  )
})

test('parseTemplateCsv: structured columns (label,type,required,options,help)', () => {
  const csv = [
    'label,type,required,options,help',
    'Employee,employee number,yes,,Badge number',
    'Shift,dropdown,required,Day;Night,',
    'Hazards,multiselect,,"Noise, Dust",',
    'Inspected,yes/no,true,,',
    'Thing,weird,,,'
  ].join('\n')
  const result = rules.parseTemplateCsv(csv)

  assert.equal(result.mode, 'structured')
  assert.deepEqual(result.fields[0], { id: 'employee', label: 'Employee', type: 'employee_number', required: true, help: 'Badge number' })
  assert.deepEqual(result.fields[1], { id: 'shift', label: 'Shift', type: 'select', required: true, options: ['Day', 'Night'] })
  assert.deepEqual(result.fields[2].options, ['Noise', 'Dust'])
  assert.equal(result.fields[3].type, 'yesno')
  assert.equal(result.fields[4].type, 'text')
  assert.equal(result.warnings.length, 1)
})

test('parseTemplateCsv rejects an empty file', () => {
  assert.throws(() => rules.parseTemplateCsv('  \n\n'), /empty/)
})

test('builder helpers: blank fields, unique ids, moving, renaming and condition candidates', () => {
  const select = rules.blankField('select', ['new-question'])

  assert.equal(select.id, 'new-question-2')
  assert.deepEqual(select.options, ['Option 1', 'Option 2'])
  assert.equal(rules.blankField('signature', []).signatory, 'any')
  assert.deepEqual(rules.moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c'])
  assert.deepEqual(rules.moveItem(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c'])

  const fields = [
    { id: 'head', label: 'Head', type: 'section' },
    { id: 'ok', label: 'OK', type: 'yesno' },
    { id: 'sig', label: 'Sign', type: 'signature' },
    { id: 'why', label: 'Why', type: 'text', visibleWhen: { fieldId: 'ok', equals: 'No' } }
  ]

  assert.deepEqual(rules.conditionCandidates(fields, 3).map(field => field.id), ['ok'])
  assert.deepEqual(rules.conditionValues(fields[1]), ['Yes', 'No', 'N/A'])
  assert.equal(rules.renameFieldId(fields, 'ok', 'all-ok')[3].visibleWhen.fieldId, 'all-ok')
  assert.equal(rules.countAnswerFields(fields), 3)
})

test('library filter: words across title, description and category; category filter incl. none', () => {
  const rows = [
    { title: 'Forklift daily', description: 'Pre-shift check', category: 'Equipment' },
    { title: 'JSA', description: null, category: 'Safety' },
    { title: 'Visitor log', description: null, category: null }
  ]

  assert.deepEqual(rules.filterLibrary(rows, { search: 'pre-shift fork' }).map(row => row.title), ['Forklift daily'])
  assert.deepEqual(rules.filterLibrary(rows, { category: 'Safety' }).map(row => row.title), ['JSA'])
  assert.deepEqual(rules.filterLibrary(rows, { category: '-' }).map(row => row.title), ['Visitor log'])
  assert.deepEqual(rules.libraryCategories(rows), ['Equipment', 'Safety'])
  assert.equal(rules.titleFromFilename('C:\\fakepath\\Forklift_Daily.csv'), 'Forklift Daily')
})
