/**
 * Forge AI Command Center stage 5: how the header assistant reads the page it is opened on.
 * Run: node --experimental-strip-types --test apps/web/tests/forge-ai-command-center.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const context = require(path.join(__dirname, '../src/lib/forgeAiPageContext.ts'))

const ID = '20000000-0000-4000-8000-0000000003AB'

test('record pages give the record as context, with a lower-case id', () => {
  const cases = [
    ['/incidents/', 'incident', 'this incident'],
    ['/inspections/', 'inspection', 'this inspection'],
    ['/assets/', 'asset', 'this asset'],
    ['/personnel/', 'personnel', 'this person'],
    ['/training/courses/', 'training_course', 'this training course'],
    ['/qr/', 'qr', 'this QR code'],
    ['/loto/', 'loto', 'this LOTO procedure'],
    ['/tasks/', 'task', 'this task']
  ]

  for (const [prefix, type, label] of cases) {
    assert.deepEqual(context.recordContextForPath(prefix + ID), { type, id: ID.toLowerCase(), label })
    assert.deepEqual(context.recordContextForPath(prefix + ID + '/edit')?.type, type)
  }
})

test('lists, create pages and malformed ids are not records', () => {
  for (const pathname of [
    null,
    undefined,
    '',
    '/incidents',
    '/incidents/create',
    '/assets/not-a-uuid',
    '/assets/' + ID + 'extra',
    '/training/' + ID,
    '/dashboard',
    '/x/incidents/' + ID
  ]) {
    assert.equal(context.recordContextForPath(pathname), null, String(pathname))
  }
})

test('area pages get area prompts, everything else the general ones', () => {
  const incidents = context.promptsForPath('/incidents')

  assert.ok(incidents.length >= 2)
  assert.notDeepEqual(incidents, context.GENERAL_PROMPTS)
  assert.deepEqual(context.promptsForPath('/inspections/create'), context.promptsForPath('/inspections'))
  assert.deepEqual(context.promptsForPath('/dashboard'), context.GENERAL_PROMPTS)
  assert.deepEqual(context.promptsForPath(null), context.GENERAL_PROMPTS)
  for (const prompt of context.GENERAL_PROMPTS) assert.ok(prompt.length > 10 && prompt.length < 200)
})
