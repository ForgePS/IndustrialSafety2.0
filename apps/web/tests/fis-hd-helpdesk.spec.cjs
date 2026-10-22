/**
 * FIS-HD-01 — Help Desk browser regression.
 *  1. Customer: Help Center search, guided ticket submission with attachment, reply.
 *  2. Staff: console queue, internal note, note->reply confirmation, reply + resolve, internal attachment.
 *  3. Customer: sees public reply only, internal attachment denied by URL, CSAT, reopen.
 *  4. Security: cross-tenant ticket/attachment/article denial, own vs company scope,
 *     console + export denied to tenant admins, legacy /support redirect.
 */
const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const API = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.API_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
const password = 'ForgeDev2!'
const DEMO_ORG = '20000000-0000-4000-8000-000000000100'
const DEMO_USER = '20000000-0000-4000-8000-000000000002'

const run = Date.now().toString(36)
const subject = `HD browser regression ${run}`
const publicReply = `Public Forge reply ${run}`
const internalNote = `INTERNAL-HD-NOTE-${run}`
const customerFile = `customer-${run}.txt`
const internalFile = `internal-${run}.txt`
let ticketId = null

async function rest(urlPath, init = {}) {
  const res = await fetch(API + urlPath, {
    ...init,
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', ...(init.headers || {}) }
  })
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

async function attachmentId(name) {
  const rows = await rest(`/rest/v1/forge_support_attachments?ticket_id=eq.${ticketId}&file_name=eq.${encodeURIComponent(name)}&select=id`)
  return rows?.[0]?.id
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

test('customer submits a guided ticket from the Help Center', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, 'northstar.user@forge2.local')

  await page.goto(baseURL + '/help-desk')
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible()

  await page.goto(baseURL + '/help-desk/articles?q=password')
  await page.getByRole('link', { name: /Resetting your Forge password/ }).click()
  await expect(page.getByRole('heading', { name: 'Resetting your Forge password' })).toBeVisible()

  await page.goto(baseURL + '/help-desk/tickets/new')
  await expect(page.getByRole('heading', { name: 'Submit a ticket' })).toBeVisible()
  await page.getByRole('radio', { name: /Technical Issue/ }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Where is this happening?')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Subject').fill(subject)
  await page.getByLabel('What happened? What did you expect?').fill('Automated regression: the dashboard widget shows a spinner after saving a filter.')
  await page.locator('input[type="file"][multiple]').setInputFiles({ name: customerFile, mimeType: 'text/plain', buffer: Buffer.from('customer help desk attachment') })
  await expect(page.getByText(customerFile)).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Review and submit')).toBeVisible()
  await page.getByRole('button', { name: /Technical details we will include/ }).click()
  await expect(page.getByText(/never collect passwords, cookies or page query strings/)).toBeVisible()
  await page.getByRole('button', { name: 'Submit ticket' }).click()

  await page.waitForURL(/\/help-desk\/tickets\/[0-9a-f-]{36}\?created=1$/i, { timeout: 60000 })
  ticketId = new URL(page.url()).pathname.split('/').pop()
  await expect(page.getByText(/Ticket SUP-\d{4}-\d{6} submitted\./)).toBeVisible()
  await expect(page.getByRole('heading', { name: subject })).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(customerFile) })).toBeVisible()

  const technical = await rest(`/rest/v1/forge_support_ticket_technical_context?ticket_id=eq.${ticketId}&select=browser_name,page_url,user_agent`)
  expect(technical?.[0]?.browser_name).toBeTruthy()
  expect(String(technical?.[0]?.page_url || '')).not.toContain('?')

  await page.getByLabel('Reply to Forge Support').fill('Adding detail: it happens on every filter.')
  await page.getByRole('button', { name: 'Send reply' }).click()
  await expect(page.getByText('Adding detail: it happens on every filter.')).toBeVisible()

  await page.goto(baseURL + '/help-desk/tickets')
  await expect(page.getByText(subject)).toBeVisible()
  await context.close()
})

test('Forge support works the ticket in the console', async ({ browser }) => {
  expect(ticketId).toBeTruthy()
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, 'support@forge2.local')

  await page.goto(baseURL + '/help-desk/console?q=' + encodeURIComponent(subject))
  await expect(page.getByRole('heading', { name: 'Support Console' })).toBeVisible()
  await page.getByRole('row').filter({ hasText: subject }).getByRole('link', { name: /SUP-\d{4}-\d{6}/ }).click()
  await page.waitForURL(new RegExp(`/help-desk/console/tickets/${ticketId}$`))
  await expect(page.getByRole('heading', { name: new RegExp(subject) })).toBeVisible()
  await expect(page.getByText('Automated regression: the dashboard widget')).toBeVisible()

  await page.getByRole('tab', { name: /Internal Note/ }).click()
  await page.getByLabel('Internal note', { exact: true }).fill(internalNote)
  await page.getByRole('button', { name: 'Add internal note' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Internal note added.' })).toBeVisible()
  await expect(page.getByText(internalNote)).toBeVisible()

  // A drafted note never silently becomes a customer reply.
  await page.getByLabel('Internal note', { exact: true }).fill('Draft that must stay internal')
  await page.getByRole('tab', { name: /Reply to Customer/ }).click()
  await expect(page.getByRole('heading', { name: 'Switch to a customer reply?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep as internal note' }).click()
  await expect(page.getByRole('tab', { name: /Internal Note/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByLabel('Internal note', { exact: true }).fill('')
  await page.getByRole('tab', { name: /Reply to Customer/ }).click()

  await page.locator('input[type="file"][multiple]').setInputFiles({ name: internalFile, mimeType: 'text/plain', buffer: Buffer.from('internal help desk attachment') })
  await page.getByLabel('Internal only (never visible to the customer)').check()
  await page.getByRole('button', { name: 'Upload 1 file' }).click()
  await expect(page.getByText('Attachment uploaded.')).toBeVisible()
  await expect(page.getByText(internalFile, { exact: true })).toBeVisible()

  await page.getByLabel('Reply to customer', { exact: true }).fill(publicReply)
  await page.getByLabel('Set status with reply').selectOption('resolved')
  await page.getByRole('button', { name: 'Send and resolve' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Reply sent to the customer.' })).toBeVisible()
  await expect(page.getByText(publicReply).first()).toBeVisible()
  await expect(page.getByText('Reopen this ticket before replying')).toHaveCount(0)

  const t = (await rest(`/rest/v1/forge_support_tickets?id=eq.${ticketId}&select=status,first_responded_at,resolution_summary`))[0]
  expect(t.status).toBe('resolved')
  expect(t.first_responded_at).toBeTruthy()
  expect(t.resolution_summary).toContain(publicReply)
  await context.close()
})

test('customer sees only public content, rates and reopens', async ({ browser }) => {
  expect(ticketId).toBeTruthy()
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, 'northstar.user@forge2.local')

  await page.goto(baseURL + '/help-desk/tickets/' + ticketId)
  await expect(page.getByText(publicReply).first()).toBeVisible()
  await expect(page.getByText(internalNote)).toHaveCount(0)
  await expect(page.getByText(internalFile)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Resolution' })).toBeVisible()

  const internalId = await attachmentId(internalFile)
  expect(internalId).toBeTruthy()
  const denied = await context.request.get(baseURL + '/api/helpdesk/attachments/' + internalId, { maxRedirects: 0 })
  expect([403, 404]).toContain(denied.status())
  const publicId = await attachmentId(customerFile)
  const allowed = await context.request.get(baseURL + '/api/helpdesk/attachments/' + publicId)
  expect(allowed.ok()).toBeTruthy()
  expect((await allowed.body()).toString('utf8')).toContain('customer help desk attachment')

  await page.getByRole('radio', { name: '5 stars' }).click()
  await page.getByRole('button', { name: 'Submit rating' }).click()
  await expect(page.getByText('Thanks for rating your experience.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Your rating:')).toBeVisible()

  await page.getByRole('button', { name: 'Not fixed? Reopen' }).click()
  await page.getByLabel('Reason for reopening').fill('The spinner is back after the latest update.')
  await page.getByRole('button', { name: 'Reopen ticket' }).click()
  await expect(page.getByText('Ticket reopened.')).toBeVisible()
  const t = (await rest(`/rest/v1/forge_support_tickets?id=eq.${ticketId}&select=status,reopen_count`))[0]
  expect(t.status).toBe('reopened')
  expect(t.reopen_count).toBe(1)
  await context.close()
})

test('knowledge review workflow separates drafting from publishing', async ({ browser }) => {
  const articleTitle = `Regression article ${run}`
  const errors = []

  // Support agents draft and submit; only publishers can publish.
  const agentContext = await browser.newContext()
  const agent = await agentContext.newPage()
  agent.on('pageerror', e => errors.push('agent: ' + e.message))
  await login(agent, 'support@forge2.local')
  await agent.goto(baseURL + '/help-desk/console/knowledge/new')
  await expect(agent.getByRole('heading', { name: 'New article' })).toBeVisible()
  await agent.getByLabel('Title').fill(articleTitle)
  await agent.getByLabel('Summary').fill('How to clear a stuck dashboard filter.')
  await agent.getByLabel('Visibility').selectOption('authenticated_users')
  await agent.getByLabel('Search keywords').fill(`regression ${run}`)
  await agent.getByLabel('Article body').fill('## Fix\n1. Open the dashboard.\n2. Choose **Reset filters**.')
  await agent.getByRole('button', { name: 'Create draft' }).click()
  await agent.waitForURL(/\/help-desk\/console\/knowledge\/[0-9a-f-]{36}$/)
  const articleUrl = agent.url()
  await agent.getByRole('button', { name: 'Submit for review' }).click()
  await expect(agent.getByRole('button', { name: 'Request changes' })).toBeVisible()
  await expect(agent.getByRole('button', { name: 'Approve & publish' })).toHaveCount(0)
  await agentContext.close()

  const ownerContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  owner.on('pageerror', e => errors.push('owner: ' + e.message))
  await login(owner, 'admin@forge2.local')
  await owner.goto(articleUrl)
  await owner.getByRole('button', { name: 'Approve & publish' }).click()
  await expect(owner.getByRole('button', { name: 'Unpublish to draft' })).toBeVisible()
  await ownerContext.close()

  const customerContext = await browser.newContext()
  const customer = await customerContext.newPage()
  await login(customer, 'northstar.user@forge2.local')
  await customer.goto(baseURL + '/help-desk/articles?q=' + encodeURIComponent('regression ' + run))
  await expect(customer.getByRole('link', { name: new RegExp(articleTitle) })).toBeVisible()
  await customerContext.close()

  expect(errors).toEqual([])
})

test('console surfaces render for the Forge owner', async ({ browser }) => {
  // Each console route compiles on first hit against a cold `next dev` server.
  test.setTimeout(600000)
  expect(ticketId).toBeTruthy()
  const errors = []
  const ownerContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  owner.on('pageerror', e => errors.push(e.message))
  await login(owner, 'admin@forge2.local')

  const surfaces = [
    ['/help-desk/console', 'Support Console'],
    ['/help-desk/console/incidents', 'Incidents & service status'],
    ['/help-desk/console/knowledge', 'Knowledge base'],
    ['/help-desk/console/development', 'Development issues'],
    ['/help-desk/console/analytics?range=7d', 'Help Desk analytics'],
    ['/help-desk/console/tenants', 'Tenant support health'],
    ['/help-desk/console/settings', 'Help Desk settings']
  ]
  for (const [route, heading] of surfaces) {
    const response = await owner.goto(baseURL + route)
    expect(response?.status(), route).toBeLessThan(400)
    await expect(owner.getByRole('heading', { name: heading })).toBeVisible()
  }
  const [incident] = await rest('/rest/v1/forge_support_platform_incidents?status=neq.resolved&order=created_at.asc&limit=1&select=id,incident_number')
  await owner.goto(baseURL + '/help-desk/console/incidents/' + incident.id)
  await expect(owner.getByRole('heading', { name: new RegExp(incident.incident_number) })).toBeVisible()
  const [issue] = await rest('/rest/v1/forge_support_development_issues?order=created_at.asc&limit=1&select=id,issue_number')
  await owner.goto(baseURL + '/help-desk/console/development/' + issue.id)
  await expect(owner.getByRole('heading', { name: new RegExp(issue.issue_number) })).toBeVisible()

  await owner.goto(baseURL + `/help-desk/console/tickets/${ticketId}/print?internal=0`)
  await expect(owner.getByText('Customer-safe copy')).toBeVisible()
  await expect(owner.getByText(publicReply).first()).toBeVisible()
  await expect(owner.getByText(internalNote)).toHaveCount(0)
  await ownerContext.close()

  expect(errors).toEqual([])
})

test('tenant isolation, scope and staff-only surfaces are enforced', async ({ browser }) => {
  expect(ticketId).toBeTruthy()
  const publicId = await attachmentId(customerFile)
  const [adminTicket] = await rest('/rest/v1/forge_support_tickets?ticket_number=like.SUP-*-000003&select=id')
  const [watchedTicket] = await rest('/rest/v1/forge_support_tickets?ticket_number=like.SUP-*-000001&select=id,subject')
  const demoTicket = await rest('/rest/v1/rpc/forge_support_create_ticket', {
    method: 'POST',
    body: JSON.stringify({
      p_organization_id: DEMO_ORG,
      p_requester_user_id: DEMO_USER,
      p_payload: {
        subject: 'Demo tenant ticket ' + run,
        description: 'Ticket in another tenant used for isolation checks.',
        product_id: (await rest('/rest/v1/forge_support_products?product_key=eq.forge_industrial_safety&select=id'))[0].id,
        category_id: (await rest('/rest/v1/forge_support_categories?category_key=eq.technical_issue&select=id'))[0].id
      }
    })
  })
  expect(demoTicket.ok).toBeTruthy()

  // Another tenant: ticket page, attachment and tenant-only article must all be invisible.
  const outsider = await browser.newContext()
  const outsiderPage = await outsider.newPage()
  await login(outsiderPage, 'user@forge2.local')
  const crossTicket = await outsiderPage.goto(baseURL + '/help-desk/tickets/' + ticketId)
  expect(crossTicket?.status()).toBe(404)
  const crossFile = await outsider.request.get(baseURL + '/api/helpdesk/attachments/' + publicId, { maxRedirects: 0 })
  expect([403, 404]).toContain(crossFile.status())
  const crossArticle = await outsiderPage.goto(baseURL + '/help-desk/articles/northstar-inspection-conventions')
  expect(crossArticle?.status()).toBe(404)
  await outsiderPage.goto(baseURL + '/help-desk/articles?q=northstar%20forklift')
  await expect(outsiderPage.getByText('Northstar Plant 2: inspection checklist conventions')).toHaveCount(0)
  await outsider.close()

  // Employee (own scope): colleague tickets and other tenants are hidden; uploads to them are refused.
  const employee = await browser.newContext()
  const employeePage = await employee.newPage()
  await login(employeePage, 'northstar.user@forge2.local')
  const colleague = await employeePage.goto(baseURL + '/help-desk/tickets/' + adminTicket.id)
  expect(colleague?.status()).toBe(404)
  const sameOrigin = { origin: new URL(baseURL).origin }
  const upload = await employee.request.post(baseURL + `/api/helpdesk/tickets/${demoTicket.ticket_id}/attachments`, {
    headers: sameOrigin,
    multipart: { file: { name: 'probe.txt', mimeType: 'text/plain', buffer: Buffer.from('probe') } }
  })
  expect(upload.status()).toBe(404)
  const blocked = await employee.request.post(baseURL + `/api/helpdesk/tickets/${ticketId}/attachments`, {
    headers: sameOrigin,
    multipart: { file: { name: 'payload.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') } }
  })
  expect(blocked.status()).toBe(400)
  const crossSite = await employee.request.post(baseURL + `/api/helpdesk/tickets/${ticketId}/attachments`, {
    headers: { origin: 'https://attacker.example' },
    multipart: { file: { name: 'probe.txt', mimeType: 'text/plain', buffer: Buffer.from('probe') } }
  })
  expect(crossSite.status()).toBe(403)
  await employeePage.goto(baseURL + '/help-desk/articles?q=northstar%20forklift')
  await expect(employeePage.getByText('Northstar Plant 2: inspection checklist conventions')).toBeVisible()
  await employeePage.goto(baseURL + '/support')
  await employeePage.waitForURL(/\/help-desk\/tickets$/)
  await employee.close()

  // Company administrator: company-wide tickets, but no Forge console or exports.
  const admin = await browser.newContext()
  const adminPage = await admin.newPage()
  await login(adminPage, 'northstar.admin@forge2.local')
  await adminPage.goto(baseURL + '/help-desk/tickets/' + watchedTicket.id)
  await expect(adminPage.getByRole('heading', { name: watchedTicket.subject })).toBeVisible()
  await adminPage.goto(baseURL + '/help-desk/console')
  await expect(adminPage).not.toHaveURL(/\/help-desk\/console/)
  const exportResponse = await admin.request.get(baseURL + '/api/helpdesk/export/tickets', { maxRedirects: 0 })
  expect([401, 403, 404]).toContain(exportResponse.status())
  const cronResponse = await admin.request.get(baseURL + '/api/helpdesk/cron', {
    headers: { authorization: 'Bearer not-the-configured-cron-secret' },
    maxRedirects: 0
  })
  expect(cronResponse.status()).toBe(401)
  await admin.close()
})
