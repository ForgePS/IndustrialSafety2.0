/**
 * Left-menu groups match 1.0's Industrial menu (src/lib/navigationGroups.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/navigation-groups.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const { NAV_GROUP_ORDER, activeRoute, groupNavigation } = require(path.join(__dirname, '../src/lib/navigationGroups.ts'))

const entry = (id, category, sortOrder, route = `/${id}`) => ({ id, label: id, route, category, sortOrder })

test("groups follow 1.0's order, with Forge AI and unknown categories before System Tools", () => {
  const groups = groupNavigation([
    entry('settings', 'System Tools', 900),
    entry('ai', 'Forge AI', 255),
    entry('custom', 'Something New', 1),
    entry('loto', 'High-Risk Work', 190),
    entry('incidents', 'Incident & Claims', 120),
    entry('personnel', 'People & Training', 100)
  ])

  assert.deepEqual(groups.map(group => group.name), [
    'People & Training',
    'Incident & Claims',
    'High-Risk Work',
    'Forge AI',
    'Something New',
    'System Tools'
  ])
  assert.equal(NAV_GROUP_ORDER.at(-1), 'System Tools')
})

test('entries keep their sort order within a group, and a blank category lands in System Tools', () => {
  const [people, tools] = groupNavigation([
    entry('jsas', 'People & Training', 125),
    entry('personnel', 'People & Training', 100),
    entry('training', 'People & Training', 110),
    entry('orphan', '  ', 5)
  ])

  assert.deepEqual(people.items.map(item => item.id), ['personnel', 'training', 'jsas'])
  assert.deepEqual([tools.name, tools.items[0].id], ['System Tools', 'orphan'])
})

test('the current page marks only the most specific entry', () => {
  const routes = ['/ai', '/ai/watch', '/company/settings', '/company/settings/forms', null]

  assert.equal(activeRoute('/ai', routes), '/ai')
  assert.equal(activeRoute('/ai/watch', routes), '/ai/watch')
  assert.equal(activeRoute('/ai/command-center', routes), '/ai')
  assert.equal(activeRoute('/company/settings/forms/new', routes), '/company/settings/forms')
  assert.equal(activeRoute('/aisle', routes), null)
  assert.equal(activeRoute('/dashboard', routes), null)
})
