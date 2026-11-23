/**
 * Forge Waypoint, phase 0: database contract checks for areas.
 * Tenant guards on areas, equipment placement rules (same company, same location, not archived; moving the
 * equipment's location takes it out of the area), area QR targets, archive-only deletion of areas with QRs,
 * name uniqueness, lookups and permissions, and no direct table access for signed-in users.
 * Run: node apps/web/tests/waypoint-db.cjs
 */
const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')

for (const name of ['.env.local', '.env']) {
  const envPath = path.join(__dirname, '..', name)

  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)

    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const ORG = '20000000-0000-4000-8000-000000000100'
const LOCATION = '20000000-0000-4000-8000-000000000300'
const OTHER_ORG = '40000000-0000-4000-8000-000000000100'
const OTHER_LOCATION = '40000000-0000-4000-8000-000000000300'
const RUN = Date.now().toString().slice(-7)

async function request(pathname, options = {}) {
  const token = options.token || SERVICE_ROLE_KEY
  const response = await fetch(API_URL + pathname, {
    method: options.method || 'GET',
    headers: {
      apikey: options.token ? ANON_KEY : SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const text = await response.text()
  let data = null

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  return { status: response.status, data }
}

const rest = (table, query = '', options = {}) => request('/rest/v1/' + table + (query ? '?' + query : ''), options)

async function ok(promise, label) {
  const result = await promise

  if (result.status >= 300) throw new Error(label + ' failed: ' + result.status + ' ' + JSON.stringify(result.data))

  return result.data
}

async function fails(promise, pattern, label) {
  const result = await promise

  assert.ok(result.status >= 400, label + ' should fail but returned ' + result.status)
  assert.match(String(result.data?.message || JSON.stringify(result.data)), pattern, label)
}

async function signIn(email) {
  const response = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ForgeDev2!' })
  })
  const data = await response.json()

  if (!data.access_token) throw new Error('Sign-in failed for ' + email)

  return data
}

async function main() {
  const user = await signIn('user@forge2.local')
  const areas = []
  const assets = []
  const qrs = []
  let tempLocation = null

  const area = async (body, label) =>
    (
      await ok(
        rest('forge_areas', '', { method: 'POST', body: { organization_id: ORG, location_id: LOCATION, ...body } }),
        label
      )
    )[0]

  const asset = async (body, label) => {
    const row = (
      await ok(
        rest('forge_assets', '', {
          method: 'POST',
          body: {
            organization_id: ORG,
            location_id: LOCATION,
            name: 'Waypoint test ' + RUN + ' ' + label,
            asset_number: 'WPT-' + RUN + '-' + assets.length,
            ...body
          }
        }),
        'insert asset ' + label
      )
    )[0]

    assets.push(row.id)

    return row
  }

  try {
    // Areas
    const booth = await area(
      { name: 'Paint Booth ' + RUN, code: 'PB' + RUN, hazards: ['chemical'], required_ppe: ['respirator'] },
      'insert area'
    )

    areas.push(booth.id)
    assert.equal(booth.archived_at, null)
    console.log('ok - an area is created at a location of its company')

    await fails(
      rest('forge_areas', '', {
        method: 'POST',
        body: { organization_id: ORG, location_id: OTHER_LOCATION, name: 'Cross ' + RUN }
      }),
      /does not belong/i,
      'area at another company location'
    )
    console.log("ok - an area cannot use another company's location")

    await fails(
      rest('forge_areas', 'id=eq.' + booth.id, { method: 'PATCH', body: { organization_id: OTHER_ORG } }),
      /another company/i,
      'move area to another company'
    )
    console.log('ok - an area cannot move to another company')

    await fails(
      rest('forge_areas', '', {
        method: 'POST',
        body: { organization_id: ORG, location_id: LOCATION, name: ' paint booth ' + RUN + ' ' }
      }),
      /duplicate|unique/i,
      'duplicate area name'
    )
    await fails(
      rest('forge_areas', '', {
        method: 'POST',
        body: { organization_id: ORG, location_id: LOCATION, name: 'Other ' + RUN, code: 'pb' + RUN }
      }),
      /duplicate|unique/i,
      'duplicate area code'
    )
    console.log('ok - names are unique per location and codes per company (case-insensitive)')

    // Equipment placement
    const press = await asset({}, 'press')

    await ok(
      rest('forge_assets', 'id=eq.' + press.id, { method: 'PATCH', body: { area_id: booth.id } }),
      'place equipment'
    )
    console.log("ok - equipment at the area's location can be placed in it")

    const otherArea = (
      await ok(
        rest('forge_areas', '', {
          method: 'POST',
          body: { organization_id: OTHER_ORG, location_id: OTHER_LOCATION, name: 'Northstar ' + RUN }
        }),
        'other company area'
      )
    )[0]

    areas.push(otherArea.id)
    await fails(
      rest('forge_assets', 'id=eq.' + press.id, { method: 'PATCH', body: { area_id: otherArea.id } }),
      /does not belong/i,
      'equipment into another company area'
    )
    console.log("ok - equipment cannot be placed in another company's area")

    tempLocation = (
      await ok(
        rest('locations', '', {
          method: 'POST',
          body: { organization_id: ORG, name: 'Waypoint temp ' + RUN, code: 'WPT' + RUN }
        }),
        'temp location'
      )
    )[0]

    const elsewhere = await asset({ location_id: tempLocation.id }, 'elsewhere')

    await fails(
      rest('forge_assets', 'id=eq.' + elsewhere.id, { method: 'PATCH', body: { area_id: booth.id } }),
      /own location/i,
      'equipment from another location'
    )
    console.log('ok - equipment can only be placed in an area at its own location')

    const moved = await ok(
      rest('forge_assets', 'id=eq.' + press.id, { method: 'PATCH', body: { location_id: tempLocation.id } }),
      'move equipment'
    )

    assert.equal(moved[0].area_id, null)
    console.log('ok - moving equipment to another location takes it out of the area')

    const archivedArea = await area({ name: 'Old Bay ' + RUN, archived_at: new Date().toISOString() }, 'archived area')

    areas.push(archivedArea.id)

    const mixer = await asset({}, 'mixer')

    await fails(
      rest('forge_assets', 'id=eq.' + mixer.id, { method: 'PATCH', body: { area_id: archivedArea.id } }),
      /archived/i,
      'equipment into an archived area'
    )
    console.log('ok - equipment cannot be placed in an archived area')

    const reused = await area({ name: 'Old Bay ' + RUN }, 'reuse archived name')

    areas.push(reused.id)
    console.log("ok - an archived area's name is free for a new area")

    // QR target
    const qrNumber = await ok(
      request('/rest/v1/rpc/next_forge_qr_number', { method: 'POST', body: { p_organization_id: ORG } }),
      'qr number'
    )

    const qr = (
      await ok(
        rest('forge_qr_codes', '', {
          method: 'POST',
          body: {
            organization_id: ORG,
            qr_number: qrNumber,
            token: require('crypto').randomBytes(24).toString('hex'),
            name: 'Area Card ' + RUN,
            target_type: 'area',
            target_id: booth.id,
            default_action: 'scan_menu',
            access_mode: 'employee_number'
          }
        }),
        'area QR'
      )
    )[0]

    qrs.push(qr.id)
    console.log('ok - a QR can point at an area (Area Card)')

    await fails(
      rest('forge_qr_codes', 'id=eq.' + qr.id, { method: 'PATCH', body: { target_id: otherArea.id } }),
      /does not belong/i,
      'QR pointing at another company area'
    )

    await fails(
      rest('forge_qr_codes', 'id=eq.' + qr.id, { method: 'PATCH', body: { default_action: 'asset_record' } }),
      /check|violates/i,
      'area QR with a record action'
    )
    console.log("ok - an area QR cannot point at another company's area or skip the scan menu")

    await fails(
      rest('forge_areas', 'id=eq.' + booth.id, { method: 'DELETE' }),
      /archive it instead/i,
      'delete area with QR'
    )
    console.log('ok - an area with QR codes can only be archived')

    // Issue reports can carry the area.
    const columns = await ok(rest('forge_qr_issue_reports', 'select=area_id&limit=1'), 'issue report area column')

    assert.ok(Array.isArray(columns))
    console.log('ok - scan issue reports record the area')

    // Lookups and permissions
    const lookups = await ok(
      rest(
        'forge_lookup_definitions',
        'select=lookup_key,forge_lookup_options(option_key)&lookup_key=in.(waypoint.hazard,waypoint.ppe)'
      ),
      'lookups'
    )

    assert.equal(lookups.length, 2)
    assert.ok(lookups.every(row => row.forge_lookup_options.length >= 10))
    console.log('ok - hazard and PPE lookups are seeded')

    const grants = await ok(
      rest(
        'forge_tenant_role_permissions',
        'select=scope,forge_tenant_roles!inner(role_key,organization_id),forge_permission_registry!inner(permission_key)&forge_permission_registry.feature_key=eq.waypoint&forge_tenant_roles.organization_id=eq.' +
          ORG
      ),
      'grants'
    )

    const grant = (role, key) =>
      grants.find(
        row => row.forge_tenant_roles.role_key === role && row.forge_permission_registry.permission_key === key
      )

    assert.equal(grant('employee', 'waypoint.view')?.scope, 'organization')
    assert.equal(grant('employee', 'waypoint.manage'), undefined)
    assert.equal(grant('supervisor', 'waypoint.manage')?.scope, 'location')
    assert.equal(grant('company-administrator', 'waypoint.manage')?.scope, 'organization')
    console.log('ok - employees view, supervisors manage at their locations, administrators manage everywhere')

    for (const table of ['forge_areas', 'forge_area_activity']) {
      const result = await rest(table, 'select=id&limit=1', { token: user.access_token })

      assert.ok(
        result.status >= 400 || (Array.isArray(result.data) && result.data.length === 0),
        table + ' readable by a signed-in user'
      )

      const write = await rest(table, '', {
        method: 'POST',
        token: user.access_token,
        body: { organization_id: ORG, location_id: LOCATION, name: 'Direct ' + RUN }
      })

      assert.ok(write.status >= 400, table + ' writable by a signed-in user')
    }

    console.log('ok - signed-in users have no direct table access')
  } finally {
    for (const id of qrs) await rest('forge_qr_codes', 'id=eq.' + id, { method: 'DELETE' })
    for (const id of assets) await rest('forge_assets', 'id=eq.' + id, { method: 'DELETE' })
    for (const id of areas) await rest('forge_areas', 'id=eq.' + id, { method: 'DELETE' })
    if (tempLocation) await rest('locations', 'id=eq.' + tempLocation.id, { method: 'DELETE' })
  }

  console.log('\nwaypoint database checks passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
