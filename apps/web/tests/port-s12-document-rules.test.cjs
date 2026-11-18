/**
 * Port slice 12 (Document Control): unit tests for src/lib/forgeDocumentRules.ts (distribution matching,
 * review states, month math, 1.0 folder rules, file sniffing, workflow guards, acknowledgment summary).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s12-document-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeDocumentRules.ts'))

const member = { locationIds: ['L1'], departmentIds: ['D1'], roleIds: ['R1'] }

test('documentReaches: no rows or organization reaches everyone', () => {
  assert.equal(rules.documentReaches([], member), true)
  assert.equal(rules.documentReaches([{ scope_type: 'organization', scope_id: null }], { locationIds: [], departmentIds: [], roleIds: [] }), true)
})

test('documentReaches: location, department and role rules match only their people (1.0 ignored them)', () => {
  assert.equal(rules.documentReaches([{ scope_type: 'location', scope_id: 'L1' }], member), true)
  assert.equal(rules.documentReaches([{ scope_type: 'location', scope_id: 'L2' }], member), false)
  assert.equal(rules.documentReaches([{ scope_type: 'department', scope_id: 'D1' }], member), true)
  assert.equal(rules.documentReaches([{ scope_type: 'role', scope_id: 'R2' }], member), false)
  assert.equal(rules.documentReaches([{ scope_type: 'role', scope_id: 'R2' }, { scope_type: 'role', scope_id: 'R1' }], member), true)
  assert.equal(rules.documentReaches([{ scope_type: 'location', scope_id: null }], member), false)
})

test('normalizeDistributions drops bad rows and duplicates, and "everyone" wins', () => {
  assert.deepEqual(
    rules.normalizeDistributions([
      { scope_type: 'Location', scope_id: ' L1 ' },
      { scope_type: 'location', scope_id: 'L1' },
      { scope_type: 'site', scope_id: 'X' },
      { scope_type: 'role', scope_id: '' }
    ]),
    [{ scope_type: 'location', scope_id: 'L1' }]
  )
  assert.deepEqual(rules.normalizeDistributions([{ scope_type: 'role', scope_id: 'R1' }, { scope_type: 'organization', scope_id: 'ignored' }]), [
    { scope_type: 'organization', scope_id: null }
  ])
})

test('reviewState and daysUntil', () => {
  const now = new Date('2026-11-17T15:00:00Z')

  assert.equal(rules.reviewState(null, 30, now), 'none')
  assert.equal(rules.reviewState('bad', 30, now), 'none')
  assert.equal(rules.reviewState('2026-11-16', 30, now), 'overdue')
  assert.equal(rules.reviewState('2026-11-17', 30, now), 'due_soon')
  assert.equal(rules.reviewState('2026-12-17', 30, now), 'due_soon')
  assert.equal(rules.reviewState('2026-12-18', 30, now), 'ok')
  assert.equal(rules.daysUntil('2026-11-10', now), -7)
})

test('addMonths clamps to the end of the month like Postgres', () => {
  assert.equal(rules.addMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(rules.addMonths('2028-01-31', 1), '2028-02-29')
  assert.equal(rules.addMonths('2026-11-17', 12), '2027-11-17')
  assert.equal(rules.addMonths('2026-12-15', 2), '2027-02-15')
})

test('folders: merge built-ins, stored folders and categories, case-insensitive, sorted', () => {
  const folders = rules.mergeDocumentFolders({
    stored: [{ id: 'f1', name: 'Procedures' }],
    categoryCounts: [
      { category: 'procedures', count: 2 },
      { category: 'ehs policies', count: 1 },
      { category: 'Forms 10', count: 1 },
      { category: 'Forms 9', count: 1 },
      { category: null, count: 5 }
    ]
  })

  assert.deepEqual(
    folders.map(folder => [folder.name, folder.documentCount, folder.builtIn]),
    [
      ['EHS Policies', 1, true],
      ['Forms 9', 1, false],
      ['Forms 10', 1, false],
      ['Procedures', 2, false]
    ]
  )
  assert.equal(folders[0].canRename, false)
  assert.equal(folders[3].id, 'f1')
})

test('folders: rename checks', () => {
  const folders = rules.mergeDocumentFolders({ stored: [{ id: 'f1', name: 'Procedures' }, { id: 'f2', name: 'Programs' }], categoryCounts: [] })

  assert.equal(rules.checkFolderRename(folders, 'EHS Policies', 'Policies').ok, false)
  assert.equal(rules.checkFolderRename(folders, 'Missing', 'X').ok, false)
  assert.equal(rules.checkFolderRename(folders, 'Procedures', 'programs').ok, false)
  assert.deepEqual(rules.checkFolderRename(folders, 'procedures', '  PROCEDURES  '), { ok: true, name: 'PROCEDURES', caseOnly: true })
  assert.equal(rules.checkFolderRename(folders, 'Procedures', ' ').ok, false)
  assert.equal(rules.normalizeFolderName('  a   b '), 'a b')
  assert.equal(rules.normalizeFolderName('x'.repeat(121)), null)
})

const bytes = (...parts) => {
  const out = []

  for (const part of parts) {
    if (typeof part === 'string') out.push(...[...part].map(char => char.charCodeAt(0)))
    else out.push(...part)
  }

  return new Uint8Array(out)
}

test('sniffDocumentType checks the real bytes, not the browser type', () => {
  assert.equal(rules.sniffDocumentType(bytes('%PDF-1.7'), 'a.pdf'), 'application/pdf')
  assert.equal(rules.sniffDocumentType(bytes('%PDF-1.7'), 'renamed.docx'), 'application/pdf')
  assert.equal(rules.sniffDocumentType(bytes([0x50, 0x4b, 3, 4], 'xx'), 'Policy.DOCX'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  assert.equal(rules.sniffDocumentType(bytes([0x50, 0x4b, 3, 4], 'xx'), 'archive.zip'), null)
  assert.equal(rules.sniffDocumentType(bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'old.xls'), 'application/vnd.ms-excel')
  assert.equal(rules.sniffDocumentType(bytes([0xff, 0xd8, 0xff, 0xe0]), 'p.jpg'), 'image/jpeg')
  assert.equal(rules.sniffDocumentType(bytes('Hello\r\nworld\t!'), 'notes.txt'), 'text/plain')
  assert.equal(rules.sniffDocumentType(bytes('Hello', [0]), 'notes.txt'), null)
  assert.equal(rules.sniffDocumentType(bytes('<html>'), 'page.html'), null)
  assert.equal(rules.sniffDocumentType(bytes('MZ'), 'tool.exe'), null)
})

test('safeFileName and formatBytes', () => {
  assert.equal(rules.safeFileName('../../etc/passwd'), '.._.._etc_passwd')
  assert.equal(rules.safeFileName('   '), 'document')
  assert.equal(rules.formatBytes(500), '500 B')
  assert.equal(rules.formatBytes(2048), '2 KB')
  assert.equal(rules.formatBytes(5 * 1024 * 1024), '5 MB')
})

test('workflow guards: one in review, no self-approval, inactive documents', () => {
  const doc = { status: 'published', archived_at: null }
  const draft = { status: 'draft', submitted_by: null }
  const review = { status: 'in_review', submitted_by: 'u1' }

  assert.equal(rules.canSubmitVersion(doc, draft, [draft]), true)
  assert.equal(rules.canSubmitVersion(doc, draft, [draft, review]), false)
  assert.equal(rules.canSubmitVersion({ status: 'obsolete', archived_at: null }, draft, [draft]), false)
  assert.equal(rules.canDecideVersion(doc, review, 'u1', false), false)
  assert.equal(rules.canDecideVersion(doc, review, 'u1', true), true)
  assert.equal(rules.canDecideVersion(doc, review, 'u2', false), true)
  assert.equal(rules.canDecideVersion({ status: 'in_review', archived_at: '2026-01-01' }, review, 'u2', false), false)
  assert.equal(rules.canObsolete({ status: 'draft', archived_at: null }), false)
  assert.equal(rules.canObsolete(doc), true)
  assert.equal(rules.canConfirmReview({ status: 'in_review', archived_at: null }), false)
  assert.equal(rules.canUploadVersion({ status: 'draft', archived_at: '2026-01-01' }), false)
})

test('acknowledgmentSummary counts only the current audience', () => {
  assert.deepEqual(rules.acknowledgmentSummary(['a', 'b', 'c', 'c'], ['a', 'x']), { audience: 3, acknowledged: 1, pending: 2, percent: 33 })
  assert.deepEqual(rules.acknowledgmentSummary([], []), { audience: 0, acknowledged: 0, pending: 0, percent: 0 })
})
