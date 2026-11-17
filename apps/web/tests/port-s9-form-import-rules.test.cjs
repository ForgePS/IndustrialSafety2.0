/**
 * Port slice 9 (piece D): unit tests for the Forge 1.0 form catalog import parser (src/lib/forgeFormImportRules.ts).
 * Fixture shapes follow 1.0 platform-api industrial/form-catalog-import.test.ts and the
 * industrial_form_definitions / industrial_form_submissions rows.
 * Run: node --experimental-strip-types --test apps/web/tests/port-s9-form-import-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeFormImportRules.ts'))

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const FIXTURE = {
  formTemplates: [
    {
      // An industrial_form_definitions row.
      id: '6a1f0e8e-0000-4000-8000-000000000001',
      title: 'Forklift Pre-Use Inspection',
      formKey: 'forklift',
      version: '1',
      status: 'ACTIVE',
      schemaJson: {
        category: 'Equipment',
        description: 'Daily truck check.',
        fields: [
          { id: 'employeeNumber', label: 'Employee Number', type: 'employeeNumber', required: true },
          { id: 'truck_id', label: 'Truck', type: 'dropdown', options: [{ label: 'T-1' }, { value: 'T-2' }] },
          { id: 'horn', label: 'Horn works?', type: 'yes_no_na' },
          { id: 'ack', label: 'I checked the forks', type: 'boolean' },
          { id: 'pics', label: 'Photos', type: 'camera' },
          { id: 'intro', type: 'html', content: '<p>Check <b>before</b> each shift.</p>' },
          { id: 'operatorSignature', label: 'Operator Signature', type: 'text' },
          { id: 'supervisorSignature', label: 'Supervisor Signature' },
          { id: 'ehsSignature', label: 'EHS Director Signature', type: 'signature' },
          { id: 'sigDate', label: 'Signature Date', type: 'date' },
          { id: 'comments', label: 'Comments', type: 'textarea', showIf: { field: 'horn', value: 'No' } }
        ]
      }
    },
    {
      // A Firebase freeze row.
      sourceDocumentId: 'tpl-mvr',
      sourceCollection: 'formTemplates',
      data: { name: 'MVR Consent', fields: [{ id: 'sig', label: 'Signature', type: 'signature' }, 'Driver License #'] }
    },
    { id: 'tpl-old', title: 'Old Form', status: 'ARCHIVED', schemaJson: { fields: [{ id: 'q', label: 'Question' }] } },
    { id: 'tpl-draft', title: 'Draft Form', status: 'DRAFT', schemaJson: { fields: [{ id: 'q', label: 'Question', type: 'select' }] } },
    { id: 'tpl-old', title: 'Duplicate', schemaJson: { fields: [] } }
  ],
  formSubmissions: [
    {
      id: 'sub-1',
      formDefinitionId: '6a1f0e8e-0000-4000-8000-000000000001',
      title: 'Forklift Pre-Use Inspection',
      status: 'PENDING_SIGNATURE',
      submittedAt: '2025-03-04T15:00:00.000Z',
      answers: {
        employeeNumber: 'E-1001',
        truck_id: 'T-2',
        horn: 'NO',
        horn__notes: 'Horn is quiet',
        ack: 'true',
        pics: [{ fileName: 'a.jpg', dataUrl: 'data:image/jpeg;base64,AAAA' }, 'https://cdn.example.com/b.jpg'],
        operatorSignature: PNG,
        supervisorSignature: { image: PNG, signedAt: '2025-03-04T16:00:00.000Z', signedByName: 'Sam Supervisor' },
        comments: 'Report to maintenance',
        unknown: 'dropped'
      }
    },
    { sourceDocumentId: 'sub-2', data: { templateId: 'tpl-mvr', status: 'SUBMITTED', responses: { sig: { value: 'x', signedBy: 'Dee Driver', signedAt: { _seconds: 1700000000 } } } } },
    { id: 'sub-3', formDefinitionId: 'tpl-old', status: 'DRAFT', answers: '{"q":"Answer"}' },
    { id: 'sub-4', formDefinitionId: 'missing', status: 'weird' },
    { id: 'sub-5', formDefinitionId: 'tpl-old', status: 'ARCHIVED', answers: {} }
  ]
}

const catalog = rules.parseFormCatalog(FIXTURE)
const forklift = catalog.templates[0]

test('templates: sources, titles, statuses and publish flags', () => {
  assert.deepEqual(
    catalog.templates.map(template => [template.sourceId, template.title, template.status, template.publish]),
    [
      ['6a1f0e8e-0000-4000-8000-000000000001', 'Forklift Pre-Use Inspection', 'active', true],
      ['tpl-mvr', 'MVR Consent', 'active', true],
      ['tpl-old', 'Old Form', 'archived', true],
      ['tpl-draft', 'Draft Form', 'draft', false]
    ]
  )
  assert.equal(forklift.category, 'Equipment')
  assert.equal(forklift.description, 'Daily truck check.')
  assert.ok(catalog.problems.some(problem => /in the file twice/.test(problem)))
})

test('1.0 field types map to 2.0 fields with slug ids, signatories and conditions', () => {
  const fields = forklift.schema.fields
  const byId = Object.fromEntries(fields.map(field => [field.id, field]))

  assert.deepEqual(
    fields.map(field => [field.id, field.type]),
    [
      ['employeenumber', 'employee_number'],
      ['truck-id', 'select'],
      ['horn', 'yesno'],
      ['ack', 'checkbox'],
      ['pics', 'photo'],
      ['intro', 'content'],
      ['operatorsignature', 'signature'],
      ['supervisorsignature', 'signature'],
      ['ehssignature', 'signature'],
      ['sigdate', 'date'],
      ['comments', 'textarea']
    ]
  )
  assert.deepEqual(byId['truck-id'].options, ['T-1', 'T-2'])
  assert.equal(byId.horn.required, true)
  assert.equal(byId.intro.content, 'Check before each shift.')
  assert.equal(byId.operatorsignature.signatory, 'any')
  assert.equal(byId.supervisorsignature.signatory, 'supervisor')
  assert.equal(byId.ehssignature.signatory, 'ehs_director')
  assert.deepEqual(byId.comments.visibleWhen, { fieldId: 'horn', equals: 'No' })
  assert.equal(forklift.idMap.truck_id, 'truck-id')

  const mvr = catalog.templates[1].schema.fields

  assert.deepEqual(
    mvr.map(field => [field.id, field.type]),
    [
      ['sig', 'signature'],
      ['field-2', 'text']
    ]
  )

  // A choice field without options becomes short text instead of failing.
  assert.equal(catalog.templates[3].schema.fields[0].type, 'text')
})

test('submissions: link ids and mapped statuses', () => {
  assert.deepEqual(
    catalog.submissions.map(submission => [submission.sourceId, submission.templateSourceId, submission.status]),
    [
      ['sub-1', '6a1f0e8e-0000-4000-8000-000000000001', 'pending_signature'],
      ['sub-2', 'tpl-mvr', 'submitted'],
      ['sub-3', 'tpl-old', 'draft'],
      ['sub-4', 'missing', 'submitted'],
      ['sub-5', 'tpl-old', 'archived']
    ]
  )
  assert.equal(catalog.submissions[0].submittedAt, '2025-03-04T15:00:00.000Z')
  assert.deepEqual(catalog.submissions[2].rawAnswers, { q: 'Answer' })
})

test('answers are re-keyed and converted: yes/no with note, checkbox, signatures, photos, hidden fields', () => {
  const sub = catalog.submissions[0]
  const { answers, employeeNumber, problems } = rules.mapLegacyAnswers(forklift.schema.fields, forklift.idMap, sub.rawAnswers, sub.submittedAt)

  assert.equal(employeeNumber, 'E-1001')
  assert.equal(answers.employeenumber, 'E-1001')
  assert.equal(answers['truck-id'], 'T-2')
  assert.equal(answers.horn, 'No')
  assert.equal(answers.horn__notes, 'Horn is quiet')
  assert.equal(answers.ack, true)
  assert.deepEqual(answers.pics, [])
  assert.equal(answers.comments, 'Report to maintenance')
  assert.equal('unknown' in answers, false)
  assert.deepEqual(answers.operatorsignature, { image: PNG, signedAt: '2025-03-04T15:00:00.000Z', signedByName: '', signedByUserId: null, method: 'imported' })
  assert.deepEqual(answers.supervisorsignature, {
    image: PNG,
    signedAt: '2025-03-04T16:00:00.000Z',
    signedByName: 'Sam Supervisor',
    signedByUserId: null,
    method: 'imported'
  })
  assert.equal('ehssignature' in answers, false)
  assert.deepEqual(problems, ['2 embedded photos not carried over.'])

  const hidden = rules.mapLegacyAnswers(forklift.schema.fields, forklift.idMap, { horn: 'YES', comments: 'hidden' }, null)

  assert.equal('comments' in hidden.answers, false)
})

test('Firebase responses: nested signature objects and answers keyed by label', () => {
  const mvr = catalog.templates[1]
  const sub = catalog.submissions[1]
  const { answers } = rules.mapLegacyAnswers(mvr.schema.fields, mvr.idMap, sub.rawAnswers, sub.submittedAt)

  assert.equal(answers.sig.signedByName, 'Dee Driver')
  assert.equal(answers.sig.signedAt, new Date(1700000000 * 1000).toISOString())
  assert.equal(answers.sig.image, '')
  assert.equal(answers.sig.method, 'imported')

  const byLabel = rules.mapLegacyAnswers(mvr.schema.fields, mvr.idMap, { 'Driver License #': 'D123', employee_number: 'E-7' }, null)

  assert.equal(byLabel.answers['field-2'], 'D123')
  assert.equal(byLabel.employeeNumber, 'E-7')
})

test('signatureFromLegacy accepts data URLs, objects and typed names, and rejects unusable values', () => {
  assert.equal(rules.signatureFromLegacy(PNG, null).image, PNG)
  assert.equal(rules.signatureFromLegacy({ dataUrl: PNG, signedBy: 'A' }, '2025-01-01T00:00:00.000Z').signedAt, '2025-01-01T00:00:00.000Z')
  assert.equal(rules.signatureFromLegacy('Pat Jones', null).signedByName, 'Pat Jones')
  assert.equal(rules.signatureFromLegacy('javascript:alert(1)', null).image, '')
  assert.equal(rules.signatureFromLegacy('data:text/html;base64,AAAA', null), null)
  assert.equal(rules.signatureFromLegacy({}, null), null)
  assert.equal(rules.signatureFromLegacy('', null), null)
})

test('status mapping and payload shapes', () => {
  assert.equal(rules.mapTemplateStatus('ACTIVE'), 'active')
  assert.equal(rules.mapTemplateStatus('ARCHIVED'), 'archived')
  assert.equal(rules.mapTemplateStatus('ACTIVE', '2025-01-01'), 'archived')
  assert.equal(rules.mapTemplateStatus(undefined), 'active')
  assert.equal(rules.mapSubmissionStatus('PENDING_SIGNATURE'), 'pending_signature')
  assert.equal(rules.mapSubmissionStatus('SUBMITTED'), 'submitted')
  assert.equal(rules.mapSubmissionStatus('COMPLETE'), 'submitted')
  assert.equal(rules.mapSubmissionStatus('Draft'), 'draft')

  const single = rules.parseFormCatalog({ title: 'Safety checklist', fields: [{ id: 'location', label: 'Location', type: 'text', required: true }] })

  assert.equal(single.templates.length, 1)
  assert.equal(single.templates[0].sourceId, 'import-template-1')
  assert.equal(single.templates[0].schema.fields[0].required, true)

  assert.equal(rules.parseFormCatalog({}).problems.length, 1)
  assert.equal(rules.parseFormCatalog([{ id: 't', title: 'Array of templates', schemaJson: '{"fields":[{"id":"a","label":"A"}]}' }]).templates[0].schema.fields.length, 1)
})
