/**
 * Port slice 7: unit tests for the pure injury body map rules (src/lib/forgeBodyMapRules.ts).
 * Ported from Forge-Platform 1.0 apps/industrial-web/src/lib/incident-body-map.test.ts, plus the 2.0 free-text
 * matcher, cross-source de-duplication and rolling periods.
 * Run: node --experimental-strip-types --test apps/web/tests/port-s7-body-map-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeBodyMapRules.ts'))

const {
  BODY_REGIONS,
  aggregateBodyLocations,
  aggregateByOshaPart,
  bodyLocationSummaryLabel,
  bodyMapArrowPlacement,
  bodyMapWindowStart,
  bodyRegionsFromText,
  clampBodyRegion,
  extractBodyLocationsFromPayload,
  filterIncidentsByBodyRegion,
  filterIncidentsByOshaPart,
  heatTone,
  maxRegionCount,
  mergeBodyMapInjuries,
  parseBodyLocations,
  parseBodyMapPeriod,
  regionById,
  regionsForView,
  resolveBodyLocationToken,
  summarizeBodyMap
} = rules

// ---- 1.0: regions ----

test('has unique region ids', () => {
  const ids = BODY_REGIONS.map(r => r.id)

  assert.equal(new Set(ids).size, ids.length)
})

test('keeps every hotspot within the 0-100 container bounds', () => {
  for (const region of BODY_REGIONS) {
    assert.ok(region.left >= 0 && region.top >= 0, region.id)
    assert.ok(region.left + region.width <= 100, region.id)
    assert.ok(region.top + region.height <= 100, region.id)
  }
})

test('splits regions across both views', () => {
  assert.ok(regionsForView('front').length > 0)
  assert.ok(regionsForView('back').length > 0)
  assert.ok(regionsForView('front').every(r => r.view === 'front'))
})

test('looks up a region by id', () => {
  assert.equal(regionById('head-front')?.part, 'Head')
  assert.equal(regionById('nope'), undefined)
})

test('clampBodyRegion keeps rectangles inside the view container', () => {
  const region = regionById('head-front')
  const clamped = clampBodyRegion({ ...region, top: -5, left: 95, width: 20, height: 20 })

  assert.deepEqual([clamped.top, clamped.left, clamped.width, clamped.height], [0, 80, 20, 20])
})

// ---- 1.0: parsing ----

test('parseBodyLocations drops unknown ids, non-strings, and duplicates', () => {
  assert.deepEqual(parseBodyLocations(['head-front', 'head-front', 'bogus', 7, null]), ['head-front'])
})

test('parseBodyLocations accepts comma-separated labels and legacy payload keys', () => {
  assert.deepEqual(parseBodyLocations('Head, Right arm'), ['head-front', 'right-arm-front'])
  assert.deepEqual(extractBodyLocationsFromPayload({ bodyPart: 'Lower back', bodyLocations: ['chest-front'] }), ['chest-front', 'lower-back'])
  assert.deepEqual(extractBodyLocationsFromPayload(null), [])
})

test('parseBodyLocations returns [] for empty values', () => {
  assert.deepEqual(parseBodyLocations(undefined), [])
  assert.deepEqual(parseBodyLocations(''), [])
})

test('resolveBodyLocationToken resolves ids and human labels', () => {
  assert.equal(resolveBodyLocationToken('head-front'), 'head-front')
  assert.equal(resolveBodyLocationToken('Head'), 'head-front')
  assert.equal(resolveBodyLocationToken('nope'), null)
})

test('bodyLocationSummaryLabel joins de-duplicated part labels', () => {
  assert.equal(bodyLocationSummaryLabel(['head-front', 'right-arm-front']), 'Head, Right arm')
  assert.equal(bodyLocationSummaryLabel(['left-shoulder-front', 'left-shoulder-back']), 'Left shoulder')
  assert.equal(bodyLocationSummaryLabel([]), '')
})

// ---- 1.0: aggregation ----

const incidents = [{ bodyLocations: ['head-front', 'right-arm-front'] }, { bodyLocations: ['head-front'] }, { bodyLocations: ['lower-back', 'bogus'] }, {}]

test('counts region references across incidents', () => {
  const counts = aggregateBodyLocations(incidents)

  assert.equal(counts.get('head-front'), 2)
  assert.equal(counts.get('right-arm-front'), 1)
  assert.equal(counts.get('lower-back'), 1)
  assert.equal(counts.has('bogus'), false)
  assert.equal(maxRegionCount(counts), 2)
  assert.equal(maxRegionCount(Object.fromEntries(counts)), 2)
})

test('rolls up to OSHA parts sorted by count, once per incident', () => {
  const parts = aggregateByOshaPart(incidents)

  assert.deepEqual(parts[0], { oshaPart: 'Head', count: 2 })
  assert.equal(parts.find(p => p.oshaPart === 'Arm')?.count, 1)
  assert.equal(parts.find(p => p.oshaPart === 'Back')?.count, 1)
  assert.equal(aggregateByOshaPart([{ bodyLocations: ['left-shoulder-front', 'right-shoulder-front'] }]).find(p => p.oshaPart === 'Shoulder')?.count, 1)
})

test('heatTone buckets by ratio of count to max', () => {
  assert.equal(heatTone(0, 5), null)
  assert.equal(heatTone(1, 6), 'info')
  assert.equal(heatTone(3, 6), 'warning')
  assert.equal(heatTone(6, 6), 'danger')
  assert.equal(heatTone(2, 0), null)
})

test('places callout tip on the region center', () => {
  const region = regionById('head-front')
  const place = bodyMapArrowPlacement(region)

  assert.ok(Math.abs(place.tipX - (region.left + region.width / 2)) < 1e-9)
  assert.ok(Math.abs(place.tipY - (region.top + region.height / 2)) < 1e-9)
})

test('filters incidents that mark a body region or matching part', () => {
  const rows = [
    { id: '1', bodyLocations: ['left-hand-front'] },
    { id: '2', bodyLocations: ['left-hand-back'] },
    { id: '3', bodyLocations: ['head-front'] }
  ]

  assert.deepEqual(filterIncidentsByBodyRegion(rows, 'left-hand-front').map(r => r.id), ['1', '2'])
  assert.deepEqual(filterIncidentsByBodyRegion(rows, 'head-front').map(r => r.id), ['3'])
})

test('filters incidents by OSHA part group', () => {
  const rows = [
    { id: '1', bodyLocations: ['left-hand-front'] },
    { id: '2', bodyLocations: ['right-hand-back'] },
    { id: '3', bodyLocations: ['head-front'] }
  ]

  assert.deepEqual(filterIncidentsByOshaPart(rows, 'Hand').map(r => r.id), ['1', '2'])
  assert.deepEqual(filterIncidentsByOshaPart(rows, 'Head').map(r => r.id), ['3'])
})

// ---- 2.0: free text ----

test('free text: sides, synonyms and multiple parts', () => {
  assert.deepEqual(bodyRegionsFromText('Laceration to left hand'), ['left-hand-front'])
  assert.deepEqual(bodyRegionsFromText('Laceration to left hand from belt guard'), ['left-hand-front'])
  assert.deepEqual(bodyRegionsFromText('R knee, lower back'), ['right-leg-front', 'lower-back'])
  assert.deepEqual(bodyRegionsFromText('left wrist and right ankle'), ['left-hand-front', 'right-foot-front'])
  assert.deepEqual(bodyRegionsFromText('Left index finger'), ['left-hand-front'])
  assert.deepEqual(bodyRegionsFromText('second degree burns on right forearm'), ['right-arm-front'])
  assert.deepEqual(bodyRegionsFromText('foreign body in eye'), ['face-front'])
  assert.deepEqual(bodyRegionsFromText('Back strain'), ['lower-back'])
  assert.deepEqual(bodyRegionsFromText('shoulder blade contusion'), ['upper-back'])
})

test('free text: both / plural / side carry-over', () => {
  assert.deepEqual(bodyRegionsFromText('both knees'), ['right-leg-front', 'left-leg-front'])
  assert.deepEqual(bodyRegionsFromText('bilateral wrists'), ['right-hand-front', 'left-hand-front'])
  assert.deepEqual(bodyRegionsFromText('hands'), ['right-hand-front', 'left-hand-front'])
  assert.deepEqual(bodyRegionsFromText('left hand, wrist'), ['left-hand-front'])
})

test('free text: unsided singular follows 1.0 (front view, worker right)', () => {
  assert.deepEqual(bodyRegionsFromText('Wrist strain'), ['right-hand-front'])
  assert.equal(resolveBodyLocationToken('hand'), 'right-hand-front')
})

test('free text: back of head / neck map to the back view; back of hand is the hand', () => {
  assert.deepEqual(bodyRegionsFromText('struck on back of the head'), ['head-back'])
  assert.deepEqual(bodyRegionsFromText('cut on back of left hand'), ['left-hand-front'])
  assert.deepEqual(bodyRegionsFromText('back of neck'), ['neck-back'])
})

test('free text: exact ids / labels, word boundaries and empty input', () => {
  assert.deepEqual(bodyRegionsFromText('right-hand-back, Head (back)'), ['right-hand-back', 'head-back'])
  assert.deepEqual(bodyRegionsFromText('handled the forklift, harmless headache'), [])
  assert.deepEqual(bodyRegionsFromText(''), [])
  assert.deepEqual(bodyRegionsFromText(null), [])
})

// ---- 2.0: de-duplication ----

const row = (overrides) => ({ label: 'x', href: '/x', date: '2026-10-01', bodyLocations: ['left-hand-front'], ...overrides })

test('a WC case, its OSHA case and its incident count once', () => {
  const merged = mergeBodyMapInjuries([
    row({ source: 'incident', recordId: 'i1' }),
    row({ source: 'osha', recordId: 'o1', incidentId: 'i1', personnelId: 'p1', employeeName: 'Pat Doe', bodyLocations: ['right-hand-front'] }),
    row({ source: 'workers_comp', recordId: 'w1', incidentId: 'i1', personnelId: 'p1', employeeName: 'Pat Doe', oshaCaseId: 'o1' })
  ])

  assert.equal(merged.length, 1)
  assert.equal(merged[0].source, 'workers_comp')
  assert.deepEqual(merged[0].bodyLocations, ['left-hand-front'])
})

test('two workers hurt in one incident stay two injuries', () => {
  const merged = mergeBodyMapInjuries([
    row({ source: 'workers_comp', recordId: 'w1', incidentId: 'i1', personnelId: 'p1', employeeName: 'Pat Doe' }),
    row({ source: 'workers_comp', recordId: 'w2', incidentId: 'i1', personnelId: 'p2', employeeName: 'Sam Roe' })
  ])

  assert.equal(merged.length, 2)
})

test('WC and OSHA on the same incident merge by employee name when personnel is missing', () => {
  const merged = mergeBodyMapInjuries([
    row({ source: 'workers_comp', recordId: 'w1', incidentId: 'i1', personnelId: 'p1', employeeName: 'Pat  Doe', bodyLocations: [] }),
    row({ source: 'osha', recordId: 'o1', incidentId: 'i1', personnelId: null, employeeName: 'pat doe', bodyLocations: ['neck-front'] })
  ])

  assert.equal(merged.length, 1)
  assert.equal(merged[0].source, 'osha')
  assert.deepEqual(merged[0].bodyLocations, ['neck-front'])
})

test('unlinked records stay separate; records without body parts drop', () => {
  const merged = mergeBodyMapInjuries([
    row({ source: 'workers_comp', recordId: 'w1', date: '2026-01-01' }),
    row({ source: 'osha', recordId: 'o1', date: '2026-03-01' }),
    row({ source: 'incident', recordId: 'i9', date: '2026-02-01' }),
    row({ source: 'incident', recordId: 'i8', bodyLocations: [] })
  ])

  assert.deepEqual(merged.map(item => item.id), ['osha:o1', 'incident:i9', 'workers_comp:w1'])
})

// ---- 2.0: periods ----

test('period parsing defaults to 12 months', () => {
  assert.equal(parseBodyMapPeriod('6m'), '6m')
  assert.equal(parseBodyMapPeriod(['all']), 'all')
  assert.equal(parseBodyMapPeriod('bogus'), '12m')
  assert.equal(parseBodyMapPeriod(undefined), '12m')
})

test('window start and summary', () => {
  const now = new Date('2026-11-16T12:00:00Z')

  assert.equal(bodyMapWindowStart(6, now), '2026-05-16')
  assert.equal(bodyMapWindowStart(12, now), '2025-11-16')
  assert.equal(bodyMapWindowStart(null, now), null)

  const injuries = [
    { id: 'a', source: 'workers_comp', label: 'A', href: '/a', date: '2026-10-01', bodyLocations: ['left-hand-front', 'left-hand-back'] },
    { id: 'b', source: 'osha', label: 'B', href: '/b', date: '2026-01-10', bodyLocations: ['left-hand-front'] },
    { id: 'c', source: 'incident', label: 'C', href: '/c', date: '2024-03-01', bodyLocations: ['head-front'] }
  ]

  const six = summarizeBodyMap(injuries, { months: 6, now })

  assert.equal(six.total, 1)
  assert.deepEqual(six.counts, { 'left-hand-front': 1, 'left-hand-back': 1 })
  assert.deepEqual(six.parts, [{ part: 'Left hand / wrist', regionIds: ['left-hand-front', 'left-hand-back'], count: 1 }])

  const year = summarizeBodyMap(injuries, { months: 12, now })

  assert.equal(year.total, 2)
  assert.equal(year.maxCount, 2)
  assert.deepEqual(year.recent.map(item => item.id), ['a', 'b'])

  const all = summarizeBodyMap(injuries, { months: null, now, cap: 2 })

  assert.equal(all.total, 3)
  assert.equal(all.recent.length, 2)
  assert.equal(all.parts[0].part, 'Left hand / wrist')
})
