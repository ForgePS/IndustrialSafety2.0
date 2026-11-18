/**
 * Forge AI Command Center stage 2 database regression (local Supabase, after `supabase db reset`):
 *  - knowledge search functions cannot be called by anonymous or signed-in clients (they take an
 *    organization id, so a client could otherwise read another tenant's knowledge);
 *  - full-text knowledge search stays inside one tenant, skips drafts, and hides restricted
 *    sources unless asked;
 *  - chunks without embeddings are allowed and searchable by text;
 *  - knowledge versions are closed to clients;
 *  - every tool an agent can use is a registered capability.
 * Run: node apps/web/tests/forge-ai-agents-knowledge-db.cjs
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

if (!API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing Supabase URL, anon key or service role key.')
  process.exit(1)
}

const CYPRESS = '20000000-0000-4000-8000-000000000100'
const NORTHSTAR = '40000000-0000-4000-8000-000000000100'
const MARKER = 'zephyrquartz' + Date.now().toString(36)

async function call(pathname, { key = SERVICE_ROLE_KEY, bearer = key, method = 'GET', body, prefer = 'return=representation' } = {}) {
  const response = await fetch(API_URL + pathname, {
    method,
    headers: { apikey: key, Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json', Prefer: prefer },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  let data = null

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  return { ok: response.ok, status: response.status, data }
}

async function must(pathname, options) {
  const result = await call(pathname, options)

  if (!result.ok) throw new Error(pathname + ' failed: ' + result.status + ' ' + JSON.stringify(result.data))

  return result.data
}

async function signIn(email) {
  const response = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ForgeDev2!' })
  })
  const data = await response.json()

  if (!data.access_token) throw new Error('Sign-in failed for ' + email)

  return data.access_token
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('  ok - ' + message)
}

async function source(org, title, { status = 'active', sensitivity = 'internal' } = {}) {
  const content = `${title}. Operators verify the ${MARKER} interlock before every start-up.`
  const [row] = await must('/rest/v1/forge_ai_knowledge_sources', {
    method: 'POST',
    body: { organization_id: org, source_type: 'sop', title, status, sensitivity, content_text: content, current_version: 1, indexed_version: 1, retrieval_mode: 'lexical' }
  })

  // No embedding: lexical-only chunks are valid since stage 2.
  await must('/rest/v1/forge_ai_knowledge_chunks', {
    method: 'POST',
    body: { organization_id: org, source_id: row.id, chunk_index: 0, section_title: title, content, content_hash: MARKER + row.id, version_number: 1 },
    prefer: 'return=minimal'
  })

  return row.id
}

const textSearch = (org, includeRestricted, options) =>
  call('/rest/v1/rpc/search_forge_ai_knowledge_text', {
    method: 'POST',
    body: { p_organization_id: org, p_query: MARKER, p_match_count: 10, p_include_restricted: includeRestricted },
    ...options
  })

async function main() {
  console.log('Forge AI Command Center agents and knowledge (database)...')

  const created = []

  try {
    created.push(await source(CYPRESS, 'Cypress internal SOP'))
    created.push(await source(CYPRESS, 'Cypress restricted SOP', { sensitivity: 'restricted' }))
    created.push(await source(CYPRESS, 'Cypress draft SOP', { status: 'draft' }))
    created.push(await source(NORTHSTAR, 'Northstar internal SOP'))

    const token = await signIn('admin@forge2.local')
    const zero = '[' + new Array(1536).fill(0).join(',') + ']'

    for (const [label, options] of [['anonymous', { key: ANON_KEY }], ['signed-in', { key: ANON_KEY, bearer: token }]]) {
      const text = await textSearch(NORTHSTAR, true, options)
      assert(!text.ok, label + ' clients cannot call full-text knowledge search')

      const semantic = await call('/rest/v1/rpc/match_forge_ai_knowledge', {
        method: 'POST',
        body: { p_organization_id: NORTHSTAR, p_query_embedding: zero, p_match_count: 5, p_include_restricted: true },
        ...options
      })
      assert(!semantic.ok, label + ' clients cannot call semantic knowledge search')

      const versions = await call('/rest/v1/forge_ai_knowledge_source_versions?select=id&limit=1', options)
      assert(!versions.ok || (Array.isArray(versions.data) && versions.data.length === 0), label + ' clients cannot read knowledge versions')
    }

    const internalOnly = (await must('/rest/v1/rpc/search_forge_ai_knowledge_text', {
      method: 'POST',
      body: { p_organization_id: CYPRESS, p_query: MARKER, p_match_count: 10, p_include_restricted: false }
    })).map(row => row.source_title)

    assert(internalOnly.length === 1 && internalOnly[0] === 'Cypress internal SOP', 'full-text search returns the tenant\'s active internal source only')

    const withRestricted = (await must('/rest/v1/rpc/search_forge_ai_knowledge_text', {
      method: 'POST',
      body: { p_organization_id: CYPRESS, p_query: MARKER, p_match_count: 10, p_include_restricted: true }
    })).map(row => row.source_title).sort()

    assert(
      JSON.stringify(withRestricted) === JSON.stringify(['Cypress internal SOP', 'Cypress restricted SOP']),
      'restricted sources appear only when requested; drafts and other tenants never do'
    )

    const northstar = (await must('/rest/v1/rpc/search_forge_ai_knowledge_text', {
      method: 'POST',
      body: { p_organization_id: NORTHSTAR, p_query: MARKER, p_match_count: 10, p_include_restricted: true }
    })).map(row => row.source_title)

    assert(northstar.length === 1 && northstar[0] === 'Northstar internal SOP', 'Northstar sees only its own knowledge')

    const semantic = await must('/rest/v1/rpc/match_forge_ai_knowledge', {
      method: 'POST',
      body: { p_organization_id: CYPRESS, p_query_embedding: zero, p_match_count: 20, p_include_restricted: true }
    })

    assert(!semantic.some(row => created.includes(row.source_id)), 'semantic search skips chunks that have no embedding')

    // Concurrent saves of one source each get their own version, and the source ends on the
    // text of whichever version is current.
    const [fresh] = await must('/rest/v1/forge_ai_knowledge_sources', {
      method: 'POST',
      body: { organization_id: CYPRESS, source_type: 'sop', title: 'Concurrent save ' + MARKER, status: 'draft', sensitivity: 'internal', content_text: 'start' }
    })

    created.push(fresh.id)
    const saves = await Promise.all(
      [1, 2, 3, 4, 5, 6].map(n =>
        call('/rest/v1/rpc/forge_ai_save_knowledge_version', {
          method: 'POST',
          body: { p_organization_id: CYPRESS, p_source_id: fresh.id, p_actor_user_id: null, p_content_text: 'Text ' + n, p_content_hash: 'hash-' + n, p_origin: 'manual' }
        })
      )
    )

    assert(saves.every(result => result.ok), 'six concurrent knowledge saves all succeed')
    const numbers = saves.map(result => result.data[0].version_number).sort((x, y) => x - y)

    assert(numbers.join(',') === '1,2,3,4,5,6', 'concurrent saves take distinct version numbers')
    const [after] = await must(`/rest/v1/forge_ai_knowledge_sources?id=eq.${fresh.id}&select=current_version,content_text`)
    const [currentVersion] = await must(
      `/rest/v1/forge_ai_knowledge_source_versions?source_id=eq.${fresh.id}&version_number=eq.${after.current_version}&select=content_text`
    )

    assert(after.current_version === 6 && after.content_text === currentVersion.content_text, 'the source text matches its current version')

    const wrongTenant = await call('/rest/v1/rpc/forge_ai_save_knowledge_version', {
      method: 'POST',
      body: { p_organization_id: NORTHSTAR, p_source_id: fresh.id, p_actor_user_id: null, p_content_text: 'x', p_content_hash: 'x', p_origin: 'manual' }
    })

    assert(!wrongTenant.ok, 'a save naming another tenant is refused')

    const capabilities = (await must('/rest/v1/forge_ai_capabilities?select=capability_key,required_permission_key')).map(row => row.capability_key)
    assert(capabilities.includes('search_watch_alerts'), 'search_watch_alerts capability is registered')

    const agentsSource = fs.readFileSync(path.join(__dirname, '../src/lib/forgeAiAgents.ts'), 'utf8')
    const tools = [...new Set([...agentsSource.matchAll(/tools: \[([^\]]*)\]/g)].flatMap(match => [...match[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1])))]
    const missing = tools.filter(tool => !capabilities.includes(tool))

    assert(tools.length > 10 && missing.length === 0, 'every agent tool is a registered capability' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''))
  } finally {
    for (const id of created) {
      await call(`/rest/v1/forge_ai_knowledge_sources?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
    }
  }

  console.log('Forge AI Command Center agents and knowledge database checks passed.')
}

main().catch(error => {
  console.error('FAILED:', error.message)
  process.exit(1)
})
