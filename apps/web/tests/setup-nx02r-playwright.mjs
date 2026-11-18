/**
 * NX-02R Playwright fixtures:
 * - Tenant B org + dedicated admin (direct login, not Active Company switcher)
 * - Location A2 on Tenant A
 * - Location-scoped user limited to Location A1 (DEMO)
 * - Three unlinked crew personnel for JSA execution acknowledgments
 *
 * Requires API_URL + SERVICE_ROLE_KEY (from `supabase status -o env`).
 */
const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!apiUrl || !serviceRoleKey) {
  throw new Error('API_URL and SERVICE_ROLE_KEY are required from supabase status -o env.')
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: 'Bearer ' + serviceRoleKey,
  'Content-Type': 'application/json'
}

const ORG_A = '20000000-0000-4000-8000-000000000100'
const ORG_B = '30000000-0000-4000-8000-000000000100'
const LOC_A1 = '20000000-0000-4000-8000-000000000300'
const LOC_A2 = '20000000-0000-4000-8000-000000000301'
const DIV_A = '20000000-0000-4000-8000-000000000200'
const USER_ADMIN_A = '20000000-0000-4000-8000-000000000001'
const TENANT_B_ADMIN_ID = '30000000-0000-4000-8000-000000000001'
const SCOPED_USER_ID = '20000000-0000-4000-8000-000000000003'
const CREW_1 = '20000000-0000-4000-8000-000000000610'
const CREW_2 = '20000000-0000-4000-8000-000000000611'
const CREW_3 = '20000000-0000-4000-8000-000000000612'
const PASSWORD = 'ForgeDev2!'

async function request(path, options = {}) {
  const response = await fetch(apiUrl + path, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  })
  const text = await response.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!response.ok) {
    throw new Error(
      String(options.method || 'GET') +
        ' ' +
        path +
        ' failed (' +
        response.status +
        '): ' +
        (typeof body === 'string' ? body : JSON.stringify(body))
    )
  }
  return body
}

async function ensureAuthUser({ id, email, name }) {
  const list = await request('/auth/v1/admin/users?page=1&per_page=200', { method: 'GET' })
  const existing = (list?.users || []).find(u => u.email === email || u.id === id)
  if (existing) {
    await request('/auth/v1/admin/users/' + existing.id, {
      method: 'PUT',
      body: JSON.stringify({
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name, email, email_verified: true }
      })
    })
    return existing.id
  }

  const created = await request('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      id,
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name, email, email_verified: true }
    })
  })
  return created.id || id
}

// --- Tenant B ---
await request('/rest/v1/organizations', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    id: ORG_B,
    name: 'Outside Tenant Smoke Test',
    slug: 'outside-tenant-smoke-test',
    status: 'active',
    created_by: USER_ADMIN_A
  })
})

const tenantBAdminId = await ensureAuthUser({
  id: TENANT_B_ADMIN_ID,
  email: 'tenantb@forge2.local',
  name: 'Tenant B Admin'
})

await request('/rest/v1/organization_memberships', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    organization_id: ORG_B,
    user_id: tenantBAdminId,
    role: 'owner',
    is_active: true
  })
})

let roleOwnerB = null
try {
  const roles = await request('/rest/v1/forge_tenant_roles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      organization_id: ORG_B,
      role_key: 'company-owner',
      name: 'Company Owner',
      description: 'Tenant B owner for NX-02R cross-tenant UI.',
      is_system_role: true,
      is_active: true,
      sort_order: 10
    })
  })
  roleOwnerB = roles?.[0]?.id
} catch {
  /* exists */
}
if (!roleOwnerB) {
  const roles = await request(
    '/rest/v1/forge_tenant_roles?select=id&organization_id=eq.' +
      ORG_B +
      '&role_key=eq.company-owner'
  )
  roleOwnerB = roles?.[0]?.id
}
if (!roleOwnerB) throw new Error('Unable to prepare Tenant B company-owner role.')

const viewPerms = await request(
  '/rest/v1/forge_permission_registry?select=id,permission_key&permission_key=in.(observations.view,risk_register.view,jsa_jha.view,jsa_jha.execute)'
)
await request('/rest/v1/forge_tenant_role_permissions', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(
    (viewPerms || []).map(permission => ({
      role_id: roleOwnerB,
      permission_id: permission.id,
      allowed: true,
      scope: 'organization',
      constraints: {}
    }))
  )
})

await request('/rest/v1/forge_tenant_user_roles', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    organization_id: ORG_B,
    user_id: tenantBAdminId,
    role_id: roleOwnerB
  })
})

try {
  await request('/rest/v1/forge_subscriptions', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      organization_id: ORG_B,
      plan_id: '20000000-0000-4000-8000-000000000401',
      status: 'active'
    })
  })
} catch (error) {
  const message = String(error.message || error)
  if (!message.includes('23505') && !message.includes('409')) throw error
}

// --- Location A2 ---
await request('/rest/v1/locations', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    id: LOC_A2,
    organization_id: ORG_A,
    division_id: DIV_A,
    name: 'Location A2',
    code: 'A2',
    city: 'DeWitt',
    state_region: 'AR',
    country_code: 'US',
    is_active: true
  })
})

// --- Location-scoped user (A1 only) ---
const scopedUserId = await ensureAuthUser({
  id: SCOPED_USER_ID,
  email: 'scoped@forge2.local',
  name: 'Location Scoped User'
})

await request('/rest/v1/organization_memberships', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    organization_id: ORG_A,
    user_id: scopedUserId,
    role: 'member',
    is_active: true
  })
})

const locAdminRoles = await request(
  '/rest/v1/forge_tenant_roles?select=id&organization_id=eq.' +
    ORG_A +
    '&role_key=eq.location-administrator'
)
const locAdminRoleId = locAdminRoles?.[0]?.id
if (!locAdminRoleId) throw new Error('location-administrator role missing on Tenant A')

await request('/rest/v1/forge_tenant_user_roles', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    organization_id: ORG_A,
    user_id: scopedUserId,
    role_id: locAdminRoleId
  })
})

await request('/rest/v1/forge_tenant_user_location_access', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    organization_id: ORG_A,
    user_id: scopedUserId,
    location_id: LOC_A1
  })
})

// --- Crew personnel (no auth_user_id) for execution acks ---
for (const [id, first, last, emp] of [
  [CREW_1, 'NX', 'Crew Lead', 'EMP-NX-01'],
  [CREW_2, 'NX', 'Crew Two', 'EMP-NX-02'],
  [CREW_3, 'NX', 'Crew Three', 'EMP-NX-03']
]) {
  await request('/rest/v1/forge_personnel', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id,
      organization_id: ORG_A,
      auth_user_id: null,
      first_name: first,
      last_name: last,
      employee_number: emp,
      employment_status: 'active',
      job_title: 'NX-02R Crew',
      location_id: LOC_A1,
      division_id: DIV_A,
      created_by: USER_ADMIN_A,
      updated_by: USER_ADMIN_A
    })
  })
}

console.log(
  JSON.stringify(
    {
      ok: true,
      tenantBAdminEmail: 'tenantb@forge2.local',
      scopedUserEmail: 'scoped@forge2.local',
      locationA1: LOC_A1,
      locationA2: LOC_A2,
      crewPersonnelIds: [CREW_1, CREW_2, CREW_3]
    },
    null,
    2
  )
)
