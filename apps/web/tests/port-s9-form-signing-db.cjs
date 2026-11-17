/**
 * Port slice 9, piece C database checks (plain node against PostgREST): form submissions, sign requests and
 * submission activity are service-role only (anon and members get permission denied); published form
 * versions are immutable (an UPDATE fails, even for the service role); sign request tokens are stored as a
 * sha256 hex hash only.
 *
 * Run from apps/web: node tests/port-s9-form-signing-db.cjs
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const assert = require('assert')

const envPath = path.join(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ORG = '20000000-0000-4000-8000-000000000100'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const USER = '20000000-0000-4000-8000-000000000002'
const RUN = Date.now().toString().slice(-6)

const call = async (pathname, { key, token, method = 'GET', body } = {}) => {
  const response = await fetch(API_URL + pathname, {
    method,
    headers: { apikey: key, Authorization: 'Bearer ' + (token || key), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  let json = null

  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }

  return { status: response.status, ok: response.ok, json }
}

const service = (pathname, options = {}) => call(pathname, { ...options, key: SERVICE_ROLE_KEY })

const must = async (pathname, options) => {
  const result = await service(pathname, options)

  if (!result.ok) throw new Error(`${options?.method || 'GET'} ${pathname} failed: ${JSON.stringify(result.json)}`)

  return result.json
}

const memberToken = async () => {
  const response = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@forge2.local', password: 'ForgeDev2!' })
  })
  const json = await response.json()

  if (!json.access_token) throw new Error('Member sign-in failed: ' + JSON.stringify(json))

  return json.access_token
}

const denied = result => !result.ok && [401, 403].includes(result.status)

let passed = 0
const results = []

const check = async (name, fn) => {
  try {
    await fn()
    passed += 1
    results.push('  ok   ' + name)
  } catch (error) {
    results.push('  FAIL ' + name + '\n       ' + error.message)
  }
}

const main = async () => {
  const fixture = {}
  const schema = {
    fields: [
      { id: 'task', label: 'Task', type: 'text' },
      { id: 'supervisor-signature', label: 'Supervisor Signature', type: 'signature', signatory: 'supervisor' }
    ]
  }

  try {
    const [template] = await must('/rest/v1/forge_form_templates', {
      method: 'POST',
      body: { organization_id: ORG, title: `S9 signing db ${RUN}`, status: 'active', schema, current_version: 1, created_by: ADMIN }
    })
    fixture.templateId = template.id

    const [version] = await must('/rest/v1/forge_form_template_versions', {
      method: 'POST',
      body: { organization_id: ORG, template_id: template.id, version: 1, title: template.title, schema, published_by: ADMIN }
    })
    fixture.versionId = version.id

    const [submission] = await must('/rest/v1/forge_form_submissions', {
      method: 'POST',
      body: {
        organization_id: ORG,
        submission_number: `FRM-S9DB-${RUN}`,
        template_id: template.id,
        template_version_id: version.id,
        title: template.title,
        status: 'pending_signature',
        answers: { task: 'Secret answer' },
        created_by: USER,
        submitted_by: USER
      }
    })
    fixture.submissionId = submission.id

    const token = crypto.randomBytes(24).toString('base64url')

    const [request] = await must('/rest/v1/forge_form_sign_requests', {
      method: 'POST',
      body: {
        organization_id: ORG,
        submission_id: submission.id,
        field_id: 'supervisor-signature',
        token_hash: crypto.createHash('sha256').update(token).digest('hex'),
        requested_for_user_id: USER,
        requested_for_name: 'Demo User',
        requested_by: ADMIN,
        expires_at: new Date(Date.now() + 86_400_000).toISOString()
      }
    })
    fixture.requestId = request.id

    await must('/rest/v1/forge_form_submission_activity', {
      method: 'POST',
      body: { organization_id: ORG, submission_id: submission.id, activity_type: 'submitted', message: 'Seeded', actor_user_id: USER }
    })

    const member = await memberToken()
    const asMember = (pathname, options = {}) => call(pathname, { ...options, key: ANON_KEY, token: member })
    const asAnon = (pathname, options = {}) => call(pathname, { ...options, key: ANON_KEY })

    await check('anon cannot read sign requests', async () => {
      const result = await asAnon(`/rest/v1/forge_form_sign_requests?id=eq.${request.id}&select=id,token_hash`)

      assert.ok(denied(result), `expected permission denied, got ${result.status} ${JSON.stringify(result.json)}`)
    })

    await check('anon cannot read submissions', async () => {
      const result = await asAnon(`/rest/v1/forge_form_submissions?id=eq.${submission.id}&select=id,answers`)

      assert.ok(denied(result), `expected permission denied, got ${result.status} ${JSON.stringify(result.json)}`)
    })

    await check('member cannot read sign requests (even one issued to them)', async () => {
      const result = await asMember(`/rest/v1/forge_form_sign_requests?id=eq.${request.id}&select=id,token_hash`)

      assert.ok(denied(result), `expected permission denied, got ${result.status} ${JSON.stringify(result.json)}`)
    })

    await check('member cannot read submissions directly (even their own)', async () => {
      const result = await asMember(`/rest/v1/forge_form_submissions?id=eq.${submission.id}&select=id,answers`)

      assert.ok(denied(result), `expected permission denied, got ${result.status} ${JSON.stringify(result.json)}`)
    })

    await check('member cannot read submission activity', async () => {
      const result = await asMember(`/rest/v1/forge_form_submission_activity?submission_id=eq.${submission.id}`)

      assert.ok(denied(result), `expected permission denied, got ${result.status} ${JSON.stringify(result.json)}`)
    })

    await check('member cannot write a signature into a submission', async () => {
      const result = await asMember(`/rest/v1/forge_form_submissions?id=eq.${submission.id}`, { method: 'PATCH', body: { status: 'submitted' } })

      assert.ok(denied(result), `expected permission denied, got ${result.status} ${JSON.stringify(result.json)}`)
    })

    await check('member cannot mark a sign request used', async () => {
      const result = await asMember(`/rest/v1/forge_form_sign_requests?id=eq.${request.id}`, { method: 'PATCH', body: { used_at: new Date().toISOString() } })

      assert.ok(denied(result), `expected permission denied, got ${result.status} ${JSON.stringify(result.json)}`)
    })

    await check('member can read the published version (org members select)', async () => {
      const result = await asMember(`/rest/v1/forge_form_template_versions?id=eq.${version.id}&select=id,version`)

      assert.ok(result.ok, `expected 200, got ${result.status} ${JSON.stringify(result.json)}`)
      assert.strictEqual(result.json.length, 1)
    })

    await check('member cannot update a published version', async () => {
      const result = await asMember(`/rest/v1/forge_form_template_versions?id=eq.${version.id}`, { method: 'PATCH', body: { title: 'Changed' } })

      assert.ok(!result.ok, `expected failure, got ${result.status}`)
    })

    await check('published versions are immutable (service role UPDATE fails)', async () => {
      const result = await service(`/rest/v1/forge_form_template_versions?id=eq.${version.id}`, {
        method: 'PATCH',
        body: { schema: { fields: [{ id: 'x', label: 'X', type: 'text' }] } }
      })

      assert.ok(!result.ok, `expected failure, got ${result.status}`)
      assert.match(JSON.stringify(result.json), /Published form versions cannot be changed/)

      const [after] = await must(`/rest/v1/forge_form_template_versions?id=eq.${version.id}&select=schema`)

      assert.strictEqual(after.schema.fields.length, 2)
    })

    await check('sign request token_hash must be a sha256 hex', async () => {
      const result = await service('/rest/v1/forge_form_sign_requests', {
        method: 'POST',
        body: {
          organization_id: ORG,
          submission_id: submission.id,
          field_id: 'supervisor-signature',
          token_hash: token,
          expires_at: new Date(Date.now() + 86_400_000).toISOString()
        }
      })

      assert.ok(!result.ok, `expected the raw token to be rejected, got ${result.status}`)
    })
  } finally {
    if (fixture.submissionId) await service(`/rest/v1/forge_form_submissions?id=eq.${fixture.submissionId}`, { method: 'DELETE' })
    if (fixture.templateId) await service(`/rest/v1/forge_form_templates?id=eq.${fixture.templateId}`, { method: 'DELETE' })
  }

  console.log(results.join('\n'))
  console.log(`\n${passed}/${results.length} passed`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
