/**
 * Port slice 4: unit tests for LOTO rules (src/lib/forgeLotoRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s4-loto-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeLotoRules.ts'))

test('energy letters come from the tag code first, then the 2.0 energy type', () => {
  assert.equal(rules.lotoEnergyLetter('E-1', null), 'E')
  assert.equal(rules.lotoEnergyLetter('CG2', 'electrical'), 'CG')
  assert.equal(rules.lotoEnergyLetter(null, 'pneumatic'), 'P')
  assert.equal(rules.lotoEnergyLetter('', 'steam'), 'T')
  assert.equal(rules.lotoEnergyLetter(null, 'unknown'), null)
})

test('an unknown energy still gets a printable badge', () => {
  const badge = rules.lotoEnergyBadge(null, 'unknown')
  assert.equal(badge.letter, null)
  assert.ok(badge.bg && badge.fg && badge.label)
  assert.equal(rules.lotoEnergyBadge('E', null).letter, 'E')
})

test('precautions drop blanks and duplicates and get keys', () => {
  const result = rules.normalizePrecautions([
    { key: 'ppe', category: 'PPE', text: ' Wear gloves ' },
    { key: 'ppe', text: 'Duplicate key' },
    { text: '' },
    { text: 'Custom one' },
    'not an object'
  ])
  assert.deepEqual(result.map(item => item.key), ['ppe', 'custom-custom-one'])
  assert.equal(result[0].text, 'Wear gloves')
  assert.equal(result[1].category, 'General')
  assert.deepEqual(rules.normalizePrecautions(null), [])
})

test('sequences need both fields and are capped at 20 rows', () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ step: String(i + 1), description: 'Do ' + i }))
  assert.equal(rules.normalizeSequence(rows).length, 20)
  assert.equal(rules.normalizeSequence([{ step: '1', description: '' }, { step: '', description: 'x' }]).length, 0)
})

test('restoration check keys stay unique', () => {
  const checks = rules.normalizeRestorationChecks([{ label: 'Guards on' }, { label: 'Guards on' }, { label: '' }])
  assert.equal(checks.length, 2)
  assert.notEqual(checks[0].key, checks[1].key)
})

test('empty content falls back to the 1.0 defaults', () => {
  const content = rules.effectiveLotoContent({})
  assert.equal(content.purpose, rules.LOTO_DEFAULT_PRINT_PURPOSE)
  assert.equal(content.shutdownSequence.length, rules.LOTO_DEFAULT_SHUTDOWN_SEQUENCE.length)
  assert.equal(content.restoreSequence.length, rules.LOTO_DEFAULT_RESTORE_SEQUENCE.length)
  assert.deepEqual(content.restorationChecks, [rules.LOTO_DEFAULT_RESTORATION_CHECK])

  const custom = rules.effectiveLotoContent({ print_purpose: ' Mine ', shutdown_sequence: [{ step: 'A', description: 'B' }] })
  assert.equal(custom.purpose, 'Mine')
  assert.deepEqual(custom.shutdownSequence, [{ step: 'A', description: 'B' }])
})

test('the default precautions are generic (no customer wording)', () => {
  assert.equal(rules.LOTO_DEFAULT_PRECAUTIONS.length, 23)
  for (const item of rules.LOTO_DEFAULT_PRECAUTIONS) {
    assert.ok(item.key && item.shortName && item.category && item.text)
    assert.ok(!/producers|mill operator/i.test(item.text), item.key)
  }
})

test('arrows are clamped into the photo and tiny or broken ones dropped', () => {
  const arrows = rules.normalizeLotoArrows([
    { id: 'a', x1: -1, y1: 0.5, x2: 2, y2: 0.5 },
    { id: 'tiny', x1: 0.5, y1: 0.5, x2: 0.501, y2: 0.5 },
    { id: 'bad', x1: 'x', y1: 0, x2: 1, y2: 1 },
    { x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9 }
  ])
  assert.deepEqual(arrows[0], { id: 'a', x1: 0, y1: 0.5, x2: 1, y2: 0.5 })
  assert.equal(arrows.length, 2)
  assert.equal(arrows[1].id, 'a3')

  const many = Array.from({ length: 40 }, () => ({ x1: 0, y1: 0, x2: 1, y2: 1 }))
  assert.equal(rules.normalizeLotoArrows(many).length, rules.LOTO_MAX_ARROWS)
})

test('the arrow head starts at the tip', () => {
  const head = rules.lotoArrowHead({ id: 'a', x1: 0, y1: 0.5, x2: 1, y2: 0.5 })
  assert.deepEqual(head[0], [1, 0.5])
  assert.ok(head[1][0] < 1 && head[2][0] < 1)
  assert.ok(head[1][1] !== head[2][1])
})

test('lockout blockers follow the database rules', () => {
  const snapshot = { steps: [{ id: 's1' }, { id: 's2' }] }
  const base = { status: 'in_progress', try_start_required: true, procedure_snapshot: snapshot }

  let state = rules.lockoutBlockers({ ...base, step_checks: { s1: {} } }, [{ removed_at: null }])
  assert.equal(state.uncheckedSteps, 1)
  assert.equal(state.canVerify, false)

  state = rules.lockoutBlockers({ ...base, step_checks: { s1: {}, s2: {} } }, [{ removed_at: null }])
  assert.equal(state.canVerify, true)
  assert.equal(state.canCancel, false, 'cannot cancel with a lock on')

  state = rules.lockoutBlockers({ ...base, step_checks: { s1: {}, s2: {} } }, [{ removed_at: '2026-11-15' }])
  assert.equal(state.canVerify, false, 'verify needs an active lock')
  assert.equal(state.canCancel, true)

  state = rules.lockoutBlockers({ ...base, status: 'verified', step_checks: {} }, [{ removed_at: null }])
  assert.equal(state.canComplete, false, 'all locks off before return to service')
  state = rules.lockoutBlockers({ ...base, status: 'verified', step_checks: {} }, [])
  assert.equal(state.canComplete, true)
})

test('open lockout statuses and overdue reviews', () => {
  assert.equal(rules.isOpenLockout('in_progress'), true)
  assert.equal(rules.isOpenLockout('verified'), true)
  assert.equal(rules.isOpenLockout('completed'), false)
  assert.equal(rules.lotoReviewOverdue({ status: 'approved', next_review_date: '2026-01-01' }, '2026-11-15'), true)
  assert.equal(rules.lotoReviewOverdue({ status: 'draft', next_review_date: '2026-01-01' }, '2026-11-15'), false)
  assert.equal(rules.lotoReviewOverdue({ status: 'approved', next_review_date: null }, '2026-11-15'), false)
})
