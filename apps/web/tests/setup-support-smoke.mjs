const apiUrl = process.env.API_URL
const serviceRoleKey = process.env.SERVICE_ROLE_KEY

if (!apiUrl || !serviceRoleKey) {
  throw new Error('API_URL and SERVICE_ROLE_KEY are required from supabase status -o env.')
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: 'Bearer ' + serviceRoleKey,
  'Content-Type': 'application/json'
}

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
      String(options.method || 'GET') + ' ' + path + ' failed (' + response.status + '): ' +
      (typeof body === 'string' ? body : JSON.stringify(body))
    )
  }

  return body
}

const userId = '20000000-0000-4000-8000-000000000002'
const organizationId = '30000000-0000-4000-8000-000000000100'

await request('/rest/v1/organizations', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    id: organizationId,
    name: 'Outside Tenant Smoke Test',
    slug: 'outside-tenant-smoke-test',
    status: 'active',
    created_by: userId
  })
})

await request('/rest/v1/organization_memberships', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    organization_id: organizationId,
    user_id: userId,
    role: 'member',
    is_active: true
  })
})

let roleId = null
try {
  const createdRoles = await request('/rest/v1/forge_tenant_roles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      organization_id: organizationId,
      role_key: 'employee',
      name: 'Employee',
      description: 'Smoke-test tenant employee.',
      is_system_role: true,
      is_active: true,
      sort_order: 50
    })
  })
  roleId = createdRoles?.[0]?.id
} catch (error) {
  if (!String(error.message || error).includes('23505') && !String(error.message || error).includes('409')) {
    throw error
  }
}

if (!roleId) {
  const roles = await request(
    '/rest/v1/forge_tenant_roles?select=id&organization_id=eq.' + organizationId + '&role_key=eq.employee',
    { method: 'GET' }
  )
  roleId = roles?.[0]?.id
}

if (!roleId) throw new Error('Unable to prepare smoke-test tenant role.')

const permissions = await request(
  '/rest/v1/forge_permission_registry?select=id,permission_key&permission_key=in.(customer_support.view,customer_support.create,corrective_actions.view,tasks.view)',
  { method: 'GET' }
)

if (!Array.isArray(permissions) || permissions.length < 2) {
  throw new Error('Required smoke-test permissions are missing from the registry.')
}

const requiredKeys = [
  'customer_support.view',
  'customer_support.create',
  'corrective_actions.view',
  'tasks.view'
]
const missing = requiredKeys.filter(
  key => !permissions.some(permission => permission.permission_key === key)
)
if (missing.length) {
  throw new Error('Missing smoke-test permissions: ' + missing.join(', '))
}

await request('/rest/v1/forge_tenant_role_permissions', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(
    permissions.map(permission => ({
      role_id: roleId,
      permission_id: permission.id,
      allowed: true,
      scope: 'own',
      constraints: {}
    }))
  )
})

await request('/rest/v1/forge_tenant_user_roles', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    organization_id: organizationId,
    user_id: userId,
    role_id: roleId
  })
})

// Outside tenant needs an active plan so entitlement-gated modules (CAPA/Tasks) resolve.
await request('/rest/v1/forge_subscriptions', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    organization_id: organizationId,
    plan_id: '20000000-0000-4000-8000-000000000401',
    status: 'active'
  })
})

console.log('Second tenant prepared for support smoke test.')
