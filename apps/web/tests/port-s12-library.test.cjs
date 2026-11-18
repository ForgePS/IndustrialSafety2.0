/**
 * Port slice 12 (library): unit tests for src/lib/forgeDocumentLibrary.ts (document form validation, library
 * filters, who may download which version, version numbering, exact ilike patterns).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s12-library.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const lib = require(path.join(__dirname, '../src/lib/forgeDocumentLibrary.ts'))

const LOC = '11111111-1111-4111-8111-111111111111'

test('parseDocumentInput trims, upper-cases the number and defaults acknowledgment on', () => {
  const { values, errors } = lib.parseDocumentInput({
    documentNumber: '  hs-001 ',
    name: '  Lockout   procedure ',
    description: '  Steps  ',
    category: ' EHS   Policies ',
    locationId: LOC,
    reviewIntervalMonths: '24'
  })

  assert.deepEqual(errors, {})
  assert.equal(values.document_number, 'HS-001')
  assert.equal(values.name, 'Lockout procedure')
  assert.equal(values.description, 'Steps')
  assert.equal(values.category, 'EHS Policies')
  assert.equal(values.location_id, LOC)
  assert.equal(values.review_interval_months, 24)
  assert.equal(values.requires_acknowledgment, true)
})

test('parseDocumentInput leaves blanks as null (automatic number, company-wide, default interval)', () => {
  const { values, errors } = lib.parseDocumentInput({ name: 'Policy', documentNumber: '', locationId: '', reviewIntervalMonths: '', requiresAcknowledgment: false })

  assert.deepEqual(errors, {})
  assert.equal(values.document_number, null)
  assert.equal(values.location_id, null)
  assert.equal(values.review_interval_months, null)
  assert.equal(values.requires_acknowledgment, false)
})

test('parseDocumentInput reports each bad field', () => {
  const { errors } = lib.parseDocumentInput({
    documentNumber: 'bad#number',
    name: ' ',
    locationId: 'nope',
    ownerUserId: '123',
    reviewIntervalMonths: '61',
    reviewDueOn: '2026-02-30',
    category: 'x'.repeat(121)
  })

  assert.deepEqual(Object.keys(errors).sort(), ['category', 'documentNumber', 'locationId', 'name', 'ownerUserId', 'reviewDueOn', 'reviewIntervalMonths'])
  assert.equal(lib.parseDocumentInput({ name: 'A', reviewIntervalMonths: '1.5' }).errors.reviewIntervalMonths, 'Choose 1 to 60 months.')
  assert.deepEqual(lib.parseDocumentInput({ name: 'A', reviewDueOn: '2027-01-31' }).errors, {})
})

const docs = [
  { id: 'a', document_number: 'DOC-000001', name: 'Hot work', description: 'Permit rules', category: 'EHS Policies', location_id: null, status: 'published' },
  { id: 'b', document_number: 'DOC-000002', name: 'Forklift', description: null, category: 'Training', location_id: LOC, status: 'draft' },
  { id: 'c', document_number: 'SOP-9', name: 'Spill kit', description: null, category: null, location_id: LOC, status: 'published' }
]

test('filterLibraryDocuments searches and filters by status, location and folder', () => {
  const ids = filters => lib.filterLibraryDocuments(docs, filters).map(doc => doc.id)

  assert.deepEqual(ids({}), ['a', 'b', 'c'])
  assert.deepEqual(ids({ q: 'permit' }), ['a'])
  assert.deepEqual(ids({ q: 'sop-9' }), ['c'])
  assert.deepEqual(ids({ status: 'published' }), ['a', 'c'])
  assert.deepEqual(ids({ location: 'company' }), ['a'])
  assert.deepEqual(ids({ location: LOC }), ['b', 'c'])
  assert.deepEqual(ids({ folder: 'ehs policies' }), ['a'])
  assert.deepEqual(ids({ folder: 'none' }), ['c'])
  assert.deepEqual(ids({ folder: 'Training', status: 'published' }), [])
})

test('canDownloadVersion: staff open any version, view-only users only the current approved one', () => {
  const doc = { status: 'published', current_version_id: 'v1', archived_at: null }
  const v1 = { id: 'v1', status: 'approved' }
  const v2 = { id: 'v2', status: 'draft' }
  const old = { id: 'v0', status: 'superseded' }
  const reader = { manage: false, approve: false, viewAcknowledgments: false, read: true }

  assert.equal(lib.canDownloadVersion(reader, doc, v1), true)
  assert.equal(lib.canDownloadVersion(reader, doc, v2), false)
  assert.equal(lib.canDownloadVersion(reader, doc, old), false)
  assert.equal(lib.canDownloadVersion(reader, { ...doc, archived_at: '2026-01-01' }, v1), false)
  assert.equal(lib.canDownloadVersion(reader, { ...doc, status: 'obsolete' }, v1), false)
  assert.equal(lib.canDownloadVersion({ ...reader, read: false }, doc, v1), false)
  assert.equal(lib.canDownloadVersion(null, doc, v1), false)
  assert.equal(lib.canDownloadVersion({ ...reader, manage: true }, doc, old), true)
  assert.equal(lib.canDownloadVersion({ ...reader, read: false, approve: true }, doc, v2), true)
})

test('nextVersionNumber and exactIlike', () => {
  assert.equal(lib.nextVersionNumber([]), 1)
  assert.equal(lib.nextVersionNumber([{ version_number: 3 }, { version_number: 1 }]), 4)
  assert.equal(lib.exactIlike('50%_off\\'), '50\\%\\_off\\\\')
  assert.equal(lib.exactIlike('EHS Policies'), 'EHS Policies')
})
