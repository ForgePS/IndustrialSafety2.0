/**
 * Forge AI chat pipeline, end to end through /api/forge-ai/chat with the guarded test provider
 * (server started with FORGE_AI_TEST_PROVIDER=1 FORGE_AI_PROVIDER_OVERRIDE=test). The provider is
 * scripted, but everything else is real: sign-in, tenant permissions, scoped tool queries against
 * the seeded plant, tool allowlisting, argument validation, agent-run, tool-run, usage and audit
 * logging, and provider-failure handling.
 * Run against a server: SMOKE_BASE_URL=http://127.0.0.1:3000 pnpm exec playwright test apps/web/tests/forge-ai-pipeline.spec.cjs
 */
const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

const envPath = path.join(__dirname, '../.env.local')

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)

    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const CYPRESS = '20000000-0000-4000-8000-000000000100'

const rest = async pathname => {
  const response = await fetch(API_URL + pathname, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY } })

  return response.json()
}

async function signIn(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.waitForFunction(
    () => {
      const form = document.querySelector('input[name="password"]')?.form

      return !!form && Object.keys(form).some(key => key.startsWith('__react'))
    },
    null,
    { timeout: 90000 }
  )
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.locator('form', { has: page.locator('input[name="password"]') }).locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

const chat = (page, message, conversationId = null) =>
  page.request.post(baseURL + '/api/forge-ai/chat', { data: { message, conversationId } })

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

test('a scoped tool call returns real plant records and is fully logged', async ({ page }) => {
  await signIn(page, 'admin@forge2.local')

  const [incident] = await rest(`/rest/v1/forge_incidents?organization_id=eq.${CYPRESS}&select=incident_number&order=incident_number&limit=1`)
  const res = await chat(page, `Find incident ${incident.incident_number} [[forge-test:tool:search_incidents {"query":"${incident.incident_number}","status":null,"limit":5}]]`)

  expect(res.status()).toBe(200)
  const body = await res.json()

  expect(body.message.content).toContain(incident.incident_number)

  const [run] = await rest(`/rest/v1/forge_ai_agent_runs?conversation_id=eq.${body.conversationId}&select=*`)

  expect(run.status).toBe('completed')
  expect(run.provider).toBe('test')
  expect(run.prompt_key).toBe('assistant.general')
  expect(run.prompt_version).toBe(1)
  expect(run.tool_calls).toBe(1)

  const toolRuns = await rest(`/rest/v1/forge_ai_tool_runs?agent_run_id=eq.${run.id}&select=capability_key,status,input`)

  expect(toolRuns).toHaveLength(1)
  expect(toolRuns[0].capability_key).toBe('search_incidents')
  expect(toolRuns[0].status).toBe('completed')

  const usage = await rest(`/rest/v1/forge_ai_usage_events?agent_run_id=eq.${run.id}&select=provider,total_tokens,estimated_cost_cents`)

  expect(usage).toHaveLength(1)
  expect(usage[0].total_tokens).toBeGreaterThan(0)
  expect(usage[0].estimated_cost_cents).toBeNull()
})

test('tools outside the allowlist and invalid arguments never execute', async ({ page }) => {
  await signIn(page, 'admin@forge2.local')

  const res = await chat(
    page,
    'Probe [[forge-test:tool:delete_all_records {}]] [[forge-test:tool:search_incidents {"query":"x","status":null,"limit":500}]]'
  )

  expect(res.status()).toBe(200)
  const body = await res.json()

  expect(body.message.content).toContain('delete_all_records: refused (tool_not_allowed)')
  expect(body.message.content).toContain('search_incidents: refused (invalid_arguments)')

  const [run] = await rest(`/rest/v1/forge_ai_agent_runs?conversation_id=eq.${body.conversationId}&select=id,metadata`)
  const toolRuns = await rest(`/rest/v1/forge_ai_tool_runs?agent_run_id=eq.${run.id}&select=id`)

  expect(toolRuns).toHaveLength(0)
  expect(run.metadata.rejected_tool_calls).toBe(2)

  const audit = await rest(`/rest/v1/forge_ai_audit_events?agent_run_id=eq.${run.id}&event_type=eq.tool_call.refused&select=detail`)

  expect(audit).toHaveLength(1)
  expect(audit[0].detail.refused).toBe(2)
})

test('a provider failure is contained, logged and shown without provider detail', async ({ page }) => {
  await signIn(page, 'admin@forge2.local')

  const res = await chat(page, 'Summarise open incidents [[forge-test:fail:timeout]]')

  expect(res.status()).toBe(502)
  const body = await res.json()

  expect(body.error).toBe('The AI provider took too long to respond. Try again.')

  const [run] = await rest(`/rest/v1/forge_ai_agent_runs?conversation_id=eq.${body.conversationId}&select=status,error_kind`)

  expect(run.status).toBe('timeout')
  expect(run.error_kind).toBe('timeout')

  // The conversation keeps working after a failure.
  const retry = await chat(page, 'Try again', body.conversationId)

  expect(retry.status()).toBe(200)
})

test('another tenant never sees this plant\'s records', async ({ page }) => {
  await signIn(page, 'northstar.admin@forge2.local')

  const incidents = await rest(`/rest/v1/forge_incidents?organization_id=eq.${CYPRESS}&select=incident_number&limit=3`)
  const res = await chat(page, `[[forge-test:tool:search_incidents {"query":"","status":null,"limit":50}]]`)

  if (res.status() === 200) {
    const body = await res.json()

    for (const incident of incidents) expect(body.message.content).not.toContain(incident.incident_number)
  } else {
    // Forge AI is not enabled for that tenant: refused before any tool runs.
    expect([401, 403]).toContain(res.status())
  }
})
