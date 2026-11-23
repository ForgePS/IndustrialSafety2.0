/**
 * Port slice 13 browser checks: Reporting.
 *
 * As admin@forge2.local:
 * - the library lists the reports by module and search narrows it
 * - the incident log runs, groups by severity, and the CSV and PDF downloads work
 * - the report is saved and shared, opens from Saved reports, and gets a weekly schedule sent to user@ as well
 * - history lists the runs and downloads
 * As user@forge2.local (employee, no reporting permission): Reporting sends them back to the dashboard.
 * Then the saved report is deleted.
 *
 * Run from apps/web: SMOKE_BASE_URL=http://localhost:3001 npx playwright test tests/port-s13-reporting.spec.cjs --reporter=line --workers=1
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
const NAME = `S13 incidents ${RUN}`

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
  await rest(`/rest/v1/forge_saved_reports?organization_id=eq.${ORG}&name=eq.${encodeURIComponent(NAME)}`, { method: 'DELETE' }).catch(() => {})
})

test('admin runs, downloads, saves and schedules a report', async ({ page }) => {
  await login(page, 'admin@forge2.local')

  await open(page, '/reporting')
  await expect(page.locator('[data-report-module="Incidents"] [data-report-card="incidents.log"]')).toBeVisible()
  await expect(page.locator('[data-report-card="osha.log_300"]')).toBeVisible()
  await expect(page.locator('[data-report-card]')).toHaveCount(12)

  await page.getByLabel('Search reports').fill('lockout')
  await page.getByLabel('Search reports').press('Enter')
  await page.waitForURL(/q=lockout/)
  await expect(page.locator('[data-report-card="loto.lockouts"]')).toBeVisible()
  await expect(page.locator('[data-report-card="incidents.log"]')).toHaveCount(0)

  await open(page, '/reporting/incidents.log')
  await page.locator('select[name="preset"]').selectOption('all')
  await page.locator('select[name="groupBy"]').selectOption('severity')
  await page.getByRole('button', { name: 'Run report' }).click()
  await page.waitForURL(/groupBy=severity/)
  await expect(page.getByRole('heading', { name: 'By severity' })).toBeVisible()

  // Fetch what the download links point at, with the signed-in session.
  const csvHref = await page.locator('[data-report-export="csv"]').getAttribute('href')
  const csv = await page.request.get(baseURL + csvHref)

  expect(csv.status()).toBe(200)
  expect(csv.headers()['content-disposition']).toMatch(/filename="incidents-log-\d{4}-\d{2}-\d{2}\.csv"/)
  expect(await csv.text()).toMatch(/^﻿Severity,Count\r\n/)

  const pdf = await page.request.get(baseURL + (await page.locator('[data-report-export="pdf"]').getAttribute('href')))

  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toBe('application/pdf')
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')

  await page.locator('[data-report-save-open]').click()
  await page.getByLabel('Name').fill(NAME)
  await page.locator('#report-shared').check()
  await page.locator('[data-report-save-form]').getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/reporting\/saved\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: NAME })).toBeVisible()
  await expect(page.getByText('Shared with the company')).toBeVisible()

  await open(page, '/reporting/saved')
  await page.getByRole('link', { name: NAME }).click()
  await page.waitForURL(/\/reporting\/saved\//)

  const form = page.locator('[data-report-schedule-form]')

  await form.locator('select[name="frequency"]').selectOption('weekly')
  await form.locator('select[name="weekday"]').selectOption('3')
  await form.locator('select[name="hour"]').selectOption('8')
  await form.locator('select[name="timezone"]').selectOption('America/New_York')
  await form.locator('[data-report-recipients] label', { hasText: 'Forge 2.0 Demo User' }).locator('input').check()
  await form.getByRole('button', { name: 'Create schedule' }).click()
  await expect(page.getByText(/Every Wednesday at 8:00 AM \(America\/New_York\)\. Next: /)).toBeVisible()

  const [saved] = await rest(`/rest/v1/forge_saved_reports?organization_id=eq.${ORG}&name=eq.${encodeURIComponent(NAME)}&select=id,visibility,params,forge_report_schedules(frequency,weekday,hour,timezone,forge_report_schedule_recipients(user_id))`)

  expect(saved.visibility).toBe('organization')
  expect(saved.params.groupBy).toBe('severity')
  expect(saved.forge_report_schedules.frequency).toBe('weekly')
  expect(saved.forge_report_schedules.forge_report_schedule_recipients).toHaveLength(2)

  await open(page, '/reporting/history')
  await expect(page.getByRole('row', { name: /Incident log CSV download Succeeded/ }).first()).toBeVisible()
  await expect(page.getByRole('row', { name: /Incident log PDF download Succeeded/ }).first()).toBeVisible()
})

test('an employee without reporting access is sent back to the dashboard', async ({ page }) => {
  await login(page, 'user@forge2.local')

  for (const url of ['/reporting', '/reporting/incidents.log', '/reporting/saved', '/reporting/history']) {
    await open(page, url)
    await expect(page).toHaveURL(/\/dashboard/)
  }

  expect((await page.request.get(baseURL + '/reporting/incidents.log/export?format=csv', { maxRedirects: 0 })).status()).not.toBe(200)
})

test('the owner deletes the saved report and its schedule', async ({ page }) => {
  await login(page, 'admin@forge2.local')

  const [saved] = await rest(`/rest/v1/forge_saved_reports?organization_id=eq.${ORG}&name=eq.${encodeURIComponent(NAME)}&select=id`)

  await open(page, '/reporting/saved/' + saved.id)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.waitForURL(/\/reporting\/saved$/)
  await expect(page.getByRole('link', { name: NAME })).toHaveCount(0)

  const [after] = await rest(`/rest/v1/forge_saved_reports?id=eq.${saved.id}&select=archived_at,forge_report_schedules(id)`)

  expect(after.archived_at).not.toBeNull()
  expect(after.forge_report_schedules).toBeNull()
})
