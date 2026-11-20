/**
 * Unit tests for src/lib/forgeFetchAll.ts: paging past the Supabase API row cap, and chunking `.in()` lists.
 * Run: node --experimental-strip-types --test apps/web/tests/forge-fetch-all.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const { fetchAllRows, inChunks } = require(path.join(__dirname, '../src/lib/forgeFetchAll.ts'))

/** A fake query builder over `total` rows that, like the API, never returns more than 1,000 at once. */
const fakeTable = total => {
  const calls = []
  const build = () => ({
    range: async (from, to) => {
      calls.push([from, to])
      const end = Math.min(to + 1, total, from + 1000)

      return { data: Array.from({ length: Math.max(0, end - from) }, (_, i) => ({ id: from + i })), error: null }
    }
  })

  return { build, calls }
}

test('fetchAllRows pages until a short page', async () => {
  const big = fakeTable(2500)
  const rows = await fetchAllRows(big.build, 'load')

  assert.equal(rows.length, 2500)
  assert.equal(new Set(rows.map(row => row.id)).size, 2500, 'no duplicates')
  assert.deepEqual(big.calls, [
    [0, 999],
    [1000, 1999],
    [2000, 2999]
  ])

  const exact = fakeTable(1000)

  assert.equal((await fetchAllRows(exact.build, 'load')).length, 1000)
  assert.equal(exact.calls.length, 2, 'a full page asks once more')
  assert.deepEqual(await fetchAllRows(fakeTable(0).build, 'load'), [])
})

test('fetchAllRows reports errors with the label', async () => {
  await assert.rejects(fetchAllRows(() => ({ range: async () => ({ data: null, error: { message: 'boom' } }) }), 'Unable to load lockouts'), /Unable to load lockouts: boom/)
})

test('inChunks', () => {
  assert.deepEqual(inChunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(inChunks([], 2), [])
  assert.equal(inChunks(Array.from({ length: 450 }, (_, i) => i)).length, 3)
})
