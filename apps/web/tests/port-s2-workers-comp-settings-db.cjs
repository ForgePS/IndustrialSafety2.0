/**
 * Port slice 2 completion: workers' comp settings database checks.
 * Run: node apps/web/tests/port-s2-workers-comp-settings-db.cjs
 */
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ADMIN_USER = '20000000-0000-4000-8000-000000000001'
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
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    const error = new Error((data && data.message) || String(response.status))
    error.code = data && data.code
    throw error
  }
  return data
}

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message)
  console.log('  ok - ' + message)
}

async function expectFailure(promise, message, code) {
  try {
    await promise
  } catch (error) {
    if (code && error.code !== code) throw new Error(`FAIL: ${message} (expected ${code}, got ${error.code}: ${error.message})`)
    console.log('  ok - ' + message)
    return
  }
  throw new Error('FAIL: ' + message + ' (unexpectedly succeeded)')
}

async function main() {
  console.log('Port slice 2 completion: workers\' comp settings DB checks')
  const [org] = await request('/rest/v1/organizations', {
    method: 'POST',
    body: { name: 'WC Settings ' + RUN, slug: 'wc-settings-' + RUN, status: 'active', created_by: ADMIN_USER }
  })

  try {
    const [settings] = await request('/rest/v1/forge_wc_settings', { method: 'POST', body: { organization_id: org.id } })
    assert(
      settings.weekly_email_enabled === false && settings.weekly_email_weekday === 5 && settings.weekly_email_hour === 7 && settings.time_zone === 'America/Chicago',
      'defaults match 1.0: off, Fridays 7:00 AM Central'
    )

    await expectFailure(
      request(`/rest/v1/forge_wc_settings?organization_id=eq.${org.id}`, { method: 'PATCH', body: { weekly_email_enabled: true } }),
      'the email cannot be turned on without recipients',
      '23514'
    )
    await expectFailure(
      request(`/rest/v1/forge_wc_settings?organization_id=eq.${org.id}`, { method: 'PATCH', body: { weekly_email_weekday: 7 } }),
      'weekday must be 0-6',
      '23514'
    )
    await expectFailure(
      request(`/rest/v1/forge_wc_settings?organization_id=eq.${org.id}`, { method: 'PATCH', body: { weekly_email_hour: 24 } }),
      'hour must be 0-23',
      '23514'
    )
    await expectFailure(
      request(`/rest/v1/forge_wc_settings?organization_id=eq.${org.id}`, {
        method: 'PATCH',
        body: { weekly_email_recipients: Array.from({ length: 51 }, (_, index) => `r${index}@example.com`) }
      }),
      'no more than 50 recipients',
      '23514'
    )

    const [enabled] = await request(`/rest/v1/forge_wc_settings?organization_id=eq.${org.id}`, {
      method: 'PATCH',
      body: { weekly_email_enabled: true, weekly_email_recipients: ['risk@example.com'] }
    })
    assert(enabled.weekly_email_enabled && enabled.updated_at !== settings.updated_at, 'enabling with a recipient works and updates the timestamp')

    const tokenResponse = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@forge2.local', password: 'ForgeDev2!' })
    })
    const { access_token: token } = await tokenResponse.json()
    await expectFailure(request('/rest/v1/forge_wc_settings?select=*', { token }), 'members cannot read workers\' comp settings')

    console.log('All workers\' comp settings DB checks passed.')
  } finally {
    await request(`/rest/v1/organizations?id=eq.${org.id}`, { method: 'DELETE' }).catch(() => {})
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
