/**
 * Port slice 10 (agent C): unit tests for src/lib/forgeScanIssues.ts (issue report validation, priority →
 * CAPA due date / severity, out-of-service rule, image sniffing).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s10-scan-issues.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const issues = require(path.join(__dirname, '../src/lib/forgeScanIssues.ts'))

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

test('issueDueAt: critical 1 day, high 7, medium 14, low 30 (end of that UTC day)', () => {
  const now = new Date('2026-11-17T10:00:00.000Z')

  assert.equal(issues.issueDueAt('critical', now), '2026-11-18T23:59:59.000Z')
  assert.equal(issues.issueDueAt('high', now), '2026-11-24T23:59:59.000Z')
  assert.equal(issues.issueDueAt('medium', now), '2026-12-01T23:59:59.000Z')
  assert.equal(issues.issueDueAt('low', now), '2026-12-17T23:59:59.000Z')
})

test('severity map and immediate hazard raises priority to at least high', () => {
  assert.deepEqual(issues.ISSUE_CAPA_SEVERITY, { low: 'low', medium: 'moderate', high: 'high', critical: 'critical' })
  assert.equal(issues.effectiveIssuePriority('low', true), 'high')
  assert.equal(issues.effectiveIssuePriority('medium', true), 'high')
  assert.equal(issues.effectiveIssuePriority('critical', true), 'critical')
  assert.equal(issues.effectiveIssuePriority('low', false), 'low')
  assert.equal(issues.isUrgentIssue('low', true), true)
  assert.equal(issues.isUrgentIssue('critical', false), true)
  assert.equal(issues.isUrgentIssue('high', false), false)
})

test('validateIssueReport: description required, title defaults from the target', () => {
  const missing = issues.validateIssueReport({ description: '   ' }, { targetName: 'Forklift 7' })

  assert.equal(missing.ok, false)
  assert.ok(missing.errors.description)

  const ok = issues.validateIssueReport({ description: ' Leaking hydraulic hose ', priority: 'nonsense', category: 'leak_spill', immediateHazard: 'on' }, { targetName: 'Forklift 7' })

  assert.equal(ok.ok, true)
  assert.equal(ok.value.title, 'Issue reported for Forklift 7')
  assert.equal(ok.value.description, 'Leaking hydraulic hose')
  assert.equal(ok.value.priority, 'medium')
  assert.equal(ok.value.category, 'leak_spill')
  assert.equal(ok.value.immediateHazard, true)
  assert.equal(ok.value.outOfService, false)
  assert.equal(ok.value.reporterName, null)
})

test('validateIssueReport: unknown category dropped, limits enforced, upload ids checked', () => {
  const base = { description: 'Guard missing' }

  assert.equal(issues.validateIssueReport({ ...base, category: 'aliens' }, { targetName: 'X' }).value.category, null)
  assert.ok(issues.validateIssueReport({ ...base, title: 'x'.repeat(201) }, { targetName: 'X' }).errors.title)
  assert.ok(issues.validateIssueReport({ description: 'x'.repeat(5001) }, { targetName: 'X' }).errors.description)
  assert.ok(issues.validateIssueReport({ ...base, reporterName: 'x'.repeat(121) }, { targetName: 'X' }).errors.reporterName)
  assert.ok(issues.validateIssueReport({ ...base, uploadIds: ['../../etc/passwd'] }, { targetName: 'X' }).errors.photos)
  assert.ok(issues.validateIssueReport({ ...base, uploadIds: [UUID_A, UUID_B, UUID_A.replace('1', '3'), UUID_B.replace('2', '4')] }, { targetName: 'X' }).errors.photos)

  const upper = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
  const dedup = issues.validateIssueReport({ ...base, uploadIds: [UUID_A, upper, upper.toLowerCase()] }, { targetName: 'X' })

  assert.equal(dedup.ok, true)
  assert.deepEqual(dedup.value.uploadIds, [UUID_A, upper.toLowerCase()])
})

test('shouldMarkOutOfService: asset only, viewer must be allowed, hazard implies it', () => {
  const rule = issues.shouldMarkOutOfService

  assert.equal(rule({ targetType: 'asset', viewerMayMarkOutOfService: true, requested: true, immediateHazard: false }), true)
  assert.equal(rule({ targetType: 'asset', viewerMayMarkOutOfService: true, requested: false, immediateHazard: true }), true)
  assert.equal(rule({ targetType: 'asset', viewerMayMarkOutOfService: true, requested: false, immediateHazard: false }), false)
  assert.equal(rule({ targetType: 'asset', viewerMayMarkOutOfService: false, requested: true, immediateHazard: true }), false)
  assert.equal(rule({ targetType: 'location', viewerMayMarkOutOfService: true, requested: true, immediateHazard: true }), false)
})

test('sniffImageType reads magic bytes, not names', () => {
  assert.equal(issues.sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
  assert.equal(issues.sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')
  assert.equal(issues.sniffImageType(new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')])), 'image/webp')
  assert.equal(issues.sniffImageType(new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))), null)
  assert.equal(issues.sniffImageType(new Uint8Array(Buffer.from('GIF89a'))), null)
  assert.equal(issues.safePhotoName('../evil<script>.png', 'image/png'), '.._evil_script_.png')
  assert.equal(issues.safePhotoName('', 'image/webp'), 'issue-photo.webp')
})

test('issueCapaDescription carries the QR, report and flags', () => {
  const text = issues.issueCapaDescription({
    description: 'Hose leaking',
    qrNumber: 'QR-000001',
    targetName: 'Forklift 7',
    reportId: UUID_A,
    category: 'leak_spill',
    immediateHazard: true,
    reporter: 'Sam Field',
    outOfService: true,
    photoCount: 1
  })

  assert.match(text, /^Hose leaking/)
  assert.match(text, /QR QR-000001 \(Forklift 7\) by Sam Field/)
  assert.match(text, /Category: Leak or spill\./)
  assert.match(text, /immediate hazard/)
  assert.match(text, /out of service/)
  assert.match(text, /1 photo attached/)
  assert.ok(text.includes(UUID_A))
})
