/**
 * Port slice 14 browser checks: Emergency Plans and Emergency Alerts.
 *
 * As admin@forge2.local:
 * - creates an action plan, a drill linked to it (completing it needs the after-action review) and a response
 *   team with a member
 * - sends a company-wide drill alert after checking who it reaches
 * As user@forge2.local (employee, no alert permissions):
 * - the alert is waiting on the Alerts page; answers "I need help" with a note
 * - can't open the send screen, or an alert that wasn't sent to them
 * As admin: the roll call shows the help request first; sends an update and the all-clear; the employee's
 * response panel is gone and the timeline has all three steps.
 *
 * Run from apps/web: SMOKE_BASE_URL=http://localhost:3001 npx playwright test tests/port-s14-emergency.spec.cjs --reporter=line --workers=1
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { test, expect: baseExpect } = require('@playwright/test')

const expect = baseExpect.configure({ timeout: 30000 })

for (const name of ['.env.local', '.env']) {
  const envPath = path.join(__dirname, '..', name)

  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ORG = '20000000-0000-4000-8000-000000000100'
const RUN = Date.now().toString().slice(-7) + crypto.randomBytes(2).toString('hex')
const PLAN = `S14 EAP ${RUN}`
const DRILL = `S14 drill ${RUN}`
const TEAM = `S14 team ${RUN}`
const HEADLINE = `S14 evacuation drill ${RUN}`
const fixture = {}

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

const rest = async (pathname, { method = 'GET', body } = {}) => {
  const response = await fetch(API_URL + pathname, {
    method,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${pathname} failed: ${text}`)
  return text ? JSON.parse(text) : null
}

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

const open = async (page, url) => {
  const response = await page.goto(baseURL + url)
  await page.waitForLoadState('networkidle')
  return response
}

test.afterAll(async () => {
  for (const title of [DRILL, PLAN, TEAM]) await rest(`/rest/v1/forge_emergency_plans?organization_id=eq.${ORG}&title=eq.${encodeURIComponent(title)}`, { method: 'DELETE' }).catch(() => {})
  if (fixture.alertId) {
    await rest(`/rest/v1/forge_notification_events?resource_id=eq.${fixture.alertId}`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_emergency_alerts?id=eq.${fixture.alertId}`, { method: 'DELETE' }).catch(() => {})
  }
})

test('admin writes an action plan, a drill with its review, and a response team', async ({ page }) => {
  await login(page, 'admin@forge2.local')

  await open(page, '/emergency/new?kind=plan')
  await page.getByLabel('Title').fill(PLAN)
  await page.locator('select[name="status"]').selectOption('active')
  await page.getByLabel('Next review').fill('2027-06-01')
  await page.getByLabel('Procedure').fill('1. Sound the alarm.\n2. Evacuate to the north lot.')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/emergency\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: PLAN })).toBeVisible()
  await expect(page.getByText('Evacuate to the north lot.')).toBeVisible()

  await open(page, '/emergency/new?kind=drill')
  await page.getByLabel('Title').fill(DRILL)
  await page.locator('select[name="planId"]').selectOption({ label: PLAN })
  await page.locator('select[name="scenarioType"]').selectOption('evacuation')
  await page.locator('select[name="status"]').selectOption('completed')
  await page.getByLabel('Participants').fill('38')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Add the after-action review to complete the drill.')).toBeVisible()
  await page.getByLabel('After-action review').fill('Everyone out in 6 minutes. The east door alarm was not heard in the mill.')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/emergency\/[0-9a-f-]{36}$/)
  await expect(page.locator('[data-emergency-after-action]')).toContainText('east door alarm')
  await expect(page.getByRole('link', { name: PLAN })).toBeVisible()

  await page.getByRole('link', { name: PLAN }).click()
  await expect(page.getByRole('link', { name: DRILL })).toBeVisible()

  await open(page, '/emergency/new?kind=team')
  await page.getByLabel('Title').fill(TEAM)
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/emergency\/[0-9a-f-]{36}$/)
  await page.getByLabel('Add a person to the team').fill('Denise')
  await page.getByRole('button', { name: 'Denise Carter' }).click()
  await page.getByLabel('Role for Denise Carter').fill('Incident commander')
  await page.getByRole('button', { name: 'Save team' }).click()
  await expect(page.getByText('Team saved.')).toBeVisible()

  const [team] = await rest(`/rest/v1/forge_emergency_plans?organization_id=eq.${ORG}&title=eq.${encodeURIComponent(TEAM)}&select=forge_emergency_team_members(team_role)`)

  expect(team.forge_emergency_team_members).toEqual([{ team_role: 'Incident commander' }])

  await open(page, '/emergency?kind=drill')
  await expect(page.locator(`[data-emergency-plan="${DRILL}"]`)).toBeVisible()
})

test('admin sends a company-wide drill alert', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/emergency/alerts/new')

  await page.locator('select[name="alertType"]').selectOption('evacuation')
  await page.locator('select[name="severity"]').selectOption('extreme')
  await page.getByLabel('Headline').fill(HEADLINE)
  await page.getByLabel('Message', { exact: true }).fill('Leave the building by the nearest exit.')
  await page.locator('input[name="isDrill"]').check()
  await expect(page.locator('[data-emergency-notice-preview]')).toContainText('[DRILL] EVACUATION: ' + HEADLINE)

  await expect(page.locator('[data-emergency-send]')).toBeDisabled()
  await page.locator('[data-emergency-preview-button]').click()
  await expect(page.locator('[data-emergency-preview]')).toContainText('Forge Demo User')
  await expect(page.locator('[data-emergency-excluded="no_account"]')).toBeVisible()

  await page.locator('[data-emergency-send]').click()
  await expect(page.locator('[data-emergency-confirm-text]')).toContainText('Send this drill')
  await page.locator('[data-emergency-confirm]').click()
  await page.waitForURL(/\/emergency\/alerts\/[0-9a-f-]{36}$/)
  fixture.alertId = page.url().split('/').pop()

  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible()
  await expect(page.locator('[data-emergency-roll-counts]')).toContainText('0%')

  const events = await rest(`/rest/v1/forge_notification_events?resource_id=eq.${fixture.alertId}&select=title,forge_notification_deliveries(channel,status)`)

  expect(events).toHaveLength(1)
  expect(events[0].title).toBe('[DRILL] EVACUATION: ' + HEADLINE)
  expect(events[0].forge_notification_deliveries.filter(row => row.channel === 'email').every(row => row.status === 'pending')).toBe(true)
})

test('the employee answers, and cannot send or open other alerts', async ({ page }) => {
  await login(page, 'user@forge2.local')

  await open(page, '/emergency/alerts')
  await expect(page.locator('[data-emergency-awaiting]')).toContainText(HEADLINE)
  await page.locator('[data-emergency-awaiting]').getByRole('link', { name: new RegExp(HEADLINE) }).click()
  await page.getByLabel(/Where you are/).fill('Stuck behind the dryer, dock 3')
  await page.getByRole('button', { name: 'I need help' }).click()
  await expect(page.locator('[data-emergency-my-response="need_help"]')).toBeVisible()
  await expect(page.locator('[data-emergency-roll-call]')).toHaveCount(0)
  await expect(page.locator('[data-emergency-manage]')).toHaveCount(0)

  await open(page, '/emergency/alerts/new')
  await expect(page).toHaveURL(/\/emergency\/alerts$/)

  // An alert sent only to the admin.
  const [other] = await rest('/rest/v1/forge_emergency_alerts', {
    method: 'POST',
    body: {
      organization_id: ORG,
      alert_number: 'EA-20261119-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
      alert_type: 'general',
      severity: 'minor',
      headline: 'Admins only ' + RUN,
      message: 'Not for the employee.',
      audience: { scope: 'targeted', personnelIds: [] },
      recipient_count: 0
    }
  })

  try {
    expect((await open(page, '/emergency/alerts/' + other.id)).status()).toBe(404)
  } finally {
    await rest('/rest/v1/forge_emergency_alerts?id=eq.' + other.id, { method: 'DELETE' })
  }
})

test('admin sees the help request, sends an update and the all-clear', async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage()

  await login(admin, 'admin@forge2.local')
  await open(admin, '/emergency/alerts/' + fixture.alertId)

  await expect(admin.locator('[data-emergency-roll-call] tbody tr').first()).toContainText('Needs help')
  await expect(admin.locator('[data-roll-row="Forge Demo User"]')).toContainText('dock 3')

  const help = await rest(`/rest/v1/forge_notification_events?resource_id=eq.${fixture.alertId}&event_type=eq.emergency_alert_need_help&select=title`)

  expect(help).toHaveLength(1)
  expect(help[0].title).toMatch(/Needs help: Forge Demo User/)

  await admin.getByRole('button', { name: 'Send an update' }).click()
  await admin.locator('[data-emergency-update-form] textarea').first().fill('Assembly point moved to the south lot.')
  admin.once('dialog', dialog => dialog.accept())
  await admin.locator('[data-emergency-update-form]').getByRole('button', { name: /Send update to/ }).click()
  await expect(admin.locator('[data-emergency-timeline]')).toContainText('south lot')

  await admin.locator('[data-emergency-clear-open]').click()
  await admin.locator('[data-emergency-clear-submit]').click()
  await expect(admin.locator('[data-emergency-alert-status="cleared"]')).toBeVisible()
  await expect(admin.locator('[data-emergency-manage]')).toHaveCount(0)

  const steps = await rest(`/rest/v1/forge_emergency_alert_updates?alert_id=eq.${fixture.alertId}&select=kind&order=created_at`)

  expect(steps.map(step => step.kind)).toEqual(['issued', 'update', 'all_clear'])

  const notices = await rest(`/rest/v1/forge_notification_events?resource_id=eq.${fixture.alertId}&select=event_type&order=created_at`)

  expect(notices.map(row => row.event_type)).toEqual(['emergency_alert_issued', 'emergency_alert_need_help', 'emergency_alert_update', 'emergency_alert_all_clear'])

  const user = await (await browser.newContext()).newPage()

  await login(user, 'user@forge2.local')
  await open(user, '/emergency/alerts/' + fixture.alertId)
  await expect(user.locator('[data-emergency-alert-status="cleared"]')).toBeVisible()
  await expect(user.locator('[data-emergency-respond]')).toHaveCount(0)
})
