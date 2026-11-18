/**
 * Batch 1: unit tests for the LOTO list helpers (src/lib/forgeLotoList.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-b1-loto-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const list = require(path.join(__dirname, '../src/lib/forgeLotoList.ts'))

const row = (over = {}) => ({
  id: over.id || 'id-' + Math.random(),
  procedure_number: 'LOTO-0001',
  title: 'Press',
  status: 'draft',
  next_review_date: null,
  updated_at: '2026-01-01T00:00:00Z',
  assetName: null,
  assetNumber: null,
  locationId: null,
  locationName: null,
  divisionId: null,
  divisionName: null,
  ...over
})

test('params fall back to defaults and reject bad values', () => {
  const params = list.parseLotoListParams({ sort: 'bogus', dir: 'up', page: '-3', size: '7', q: '  press  ' })
  assert.equal(params.sort, 'updated')
  assert.equal(params.dir, 'desc')
  assert.equal(params.page, 1)
  assert.equal(params.size, 25)
  assert.equal(params.q, 'press')
  assert.equal(params.status, 'active')

  const titled = list.parseLotoListParams({ sort: 'title', size: '100', page: ['3'] })
  assert.equal(titled.dir, 'asc')
  assert.equal(titled.size, 100)
  assert.equal(titled.page, 3)
})

test('the query string leaves out defaults and resets the page on any other change', () => {
  const params = { ...list.LOTO_LIST_DEFAULTS, page: 4 }
  assert.equal(list.lotoListQuery(list.LOTO_LIST_DEFAULTS), '')
  assert.equal(list.lotoListQuery(params, { status: 'draft' }), '?status=draft')
  assert.equal(list.lotoListQuery(params, { page: 5 }), '?page=5')
  assert.equal(list.lotoListQuery(params, { sort: 'title', dir: 'asc', size: 50 }), '?sort=title&dir=asc&size=50')
})

test('clicking a sorted column flips it; a new column starts ascending', () => {
  const params = { ...list.LOTO_LIST_DEFAULTS, sort: 'title', dir: 'asc' }
  assert.deepEqual(list.nextSort(params, 'title'), { sort: 'title', dir: 'desc' })
  assert.deepEqual(list.nextSort(params, 'review'), { sort: 'review', dir: 'asc' })
  assert.deepEqual(list.nextSort(params, 'updated'), { sort: 'updated', dir: 'desc' })
})

test('filters: retired hidden by default, status, location, division, "not set" and text', () => {
  const rows = [
    row({ id: 'a', status: 'approved', locationId: 'L1', locationName: 'Plant 1', divisionId: 'D1' }),
    row({ id: 'b', status: 'retired', locationId: 'L1' }),
    row({ id: 'c', status: 'draft', locationId: null, title: 'Conveyor', assetName: 'Belt 7' }),
    row({ id: 'd', status: 'review', locationId: 'L2', divisionId: 'D2' })
  ]
  const base = { q: '', status: 'active', location: '', division: '' }
  const ids = params => list.filterLotoRows(rows, { ...base, ...params }).map(item => item.id)

  assert.deepEqual(ids({}), ['a', 'c', 'd'])
  assert.deepEqual(ids({ status: 'all' }), ['a', 'b', 'c', 'd'])
  assert.deepEqual(ids({ status: 'retired' }), ['b'])
  assert.deepEqual(ids({ location: 'L1' }), ['a'])
  assert.deepEqual(ids({ location: 'none' }), ['c'])
  assert.deepEqual(ids({ division: 'D2' }), ['d'])
  assert.deepEqual(ids({ q: 'belt' }), ['c'])
  assert.deepEqual(ids({ q: 'plant 1' }), ['a'])
})

test('sorting by number is natural; review dates put blanks last both ways', () => {
  const rows = [
    row({ id: 'x', procedure_number: 'LOTO-10', next_review_date: null, status: 'approved' }),
    row({ id: 'y', procedure_number: 'LOTO-2', next_review_date: '2026-05-01', status: 'draft' }),
    row({ id: 'z', procedure_number: 'LOTO-1', next_review_date: '2026-03-01', status: 'review' })
  ]
  const ids = (sort, dir) => list.sortLotoRows(rows, sort, dir).map(item => item.id)

  assert.deepEqual(ids('number', 'asc'), ['z', 'y', 'x'])
  assert.deepEqual(ids('number', 'desc'), ['x', 'y', 'z'])
  assert.deepEqual(ids('review', 'asc'), ['z', 'y', 'x'])
  assert.deepEqual(ids('review', 'desc'), ['y', 'z', 'x'])
  assert.deepEqual(ids('status', 'asc'), ['y', 'z', 'x'])
  assert.equal(rows[0].id, 'x', 'sorting returns a copy')
})

test('paging clamps the page and reports the shown range', () => {
  const rows = Array.from({ length: 23 }, (_, index) => index)
  const second = list.paginate(rows, 2, 10)
  assert.deepEqual(second.rows, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
  assert.equal(second.pageCount, 3)
  assert.equal(second.from, 11)
  assert.equal(second.to, 20)

  const beyond = list.paginate(rows, 9, 10)
  assert.equal(beyond.page, 3)
  assert.deepEqual(beyond.rows, [20, 21, 22])

  const empty = list.paginate([], 1, 25)
  assert.equal(empty.pageCount, 1)
  assert.equal(empty.from, 0)
})

test('summary counts leave out retired procedures', () => {
  const stats = list.lotoListStats(
    [{ status: 'draft' }, { status: 'draft' }, { status: 'review' }, { status: 'approved' }, { status: 'retired' }],
    2
  )
  assert.deepEqual(stats, { procedures: 4, drafts: 2, reviews: 1, active: 1, openLockouts: 2 })
})

test('filter options are distinct, sorted, with "Not set" when needed', () => {
  const options = list.distinctOptions([
    { id: 'b', name: 'Bay' },
    { id: 'a', name: 'Annex' },
    { id: 'b', name: 'Bay' },
    { id: null, name: null }
  ])
  assert.deepEqual(options, [{ id: 'a', name: 'Annex' }, { id: 'b', name: 'Bay' }, { id: 'none', name: 'Not set' }])
  assert.deepEqual(list.distinctOptions([{ id: 'a', name: 'A' }]), [{ id: 'a', name: 'A' }])
})

test('lock holder keys round-trip and bad keys are dropped', () => {
  const uuid = '11111111-2222-3333-4444-555555555555'
  assert.equal(list.lockHolderKey({ personnel_id: uuid, holder_name: 'Pat' }), 'p:' + uuid)
  assert.equal(list.lockHolderKey({ personnel_id: null, holder_name: ' Pat Lee ' }), 'n:pat lee')
  assert.deepEqual(list.lockHolderFromKey('p:' + uuid), { personnelId: uuid })
  assert.deepEqual(list.lockHolderFromKey('n:pat lee'), { name: 'pat lee' })
  assert.equal(list.lockHolderFromKey('p:not-a-uuid'), null)
  assert.equal(list.lockHolderFromKey('x'), null)

  const search = list.parseLockoutSearch({ holder: 'p:bad', asset: uuid, procedure: 'nope', q: ' LKO-1 ' })
  assert.deepEqual(search, { q: 'LKO-1', holder: '', asset: uuid, procedure: '' })
})

test('search terms cannot break a PostgREST or() filter', () => {
  assert.equal(list.searchTermForIlike('a,b(c)%*d:e'), 'a b c d e')
  assert.equal(list.searchTermForIlike('  O"Brien  '), 'O Brien')
  assert.equal(list.lockoutSearchQuery('history', { q: 'x', holder: '', asset: '', procedure: '' }), '?view=history&q=x')
  assert.equal(list.lockoutSearchQuery('open', { q: '', holder: '', asset: '', procedure: '' }), '')
})
