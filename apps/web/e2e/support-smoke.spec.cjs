const { test, expect } = require('@playwright/test')
const crypto = require('crypto')

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:3000'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) throw new Error('Smoke-test environment is not configured.')

const serviceHeaders = {
  apikey: serviceKey,
  Authorization: 'Bearer ' + serviceKey,
  'Content-Type': 'application/json'
}

async function rest(path, options = {}) {
  const response = await fetch(supabaseUrl + '/rest/v1/' + path, {
    ...options,
    headers: { ...serviceHeaders, ...(options.headers || {}) }
  })
  const text = await response.text()
  if (!response.ok) throw new Error('REST ' + response.status + ' ' + path + ': ' + text)
  return text ? JSON.parse(text) : null
}

async function createSecondTenantUser() {
  const email = 'tenant2-' + Date.now() + '@forge-smoke.local'
  const password = crypto.randomBytes(24).toString('base64url') + 'Aa1!'

  const response = await fetch(supabaseUrl + '/auth/v1/admin/users', {
    method: 'POST',
    headers: serviceHeaders,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name: 'Second Tenant User' } })
  })
  const body = await response.text()
  if (!response.ok) throw new Error('Unable to create second smoke user: ' + body)
  const user = JSON.parse(body)

  const organizationId = '30000000-0000-4000-8000-000000000100'
  await rest('organizations', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: organizationId,
      name: 'Support Smoke Tenant Two',
      slug: 'support-smoke-tenant-two',
      status: 'active',
      created_by: user.id
    })
  })
  const memberships = await rest(
    'organization_memberships?organization_id=eq.' +
      organizationId +
      '&user_id=eq.' +
      user.id +
      '&select=organization_id,user_id'
  )

  if (!memberships?.length) {
    await rest('organization_memberships', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ organization_id: organizationId, user_id: user.id, role: 'member', is_active: true })
    })
  }

  const roles = await rest('forge_tenant_roles?organization_id=eq.' + organizationId + '&role_key=eq.employee&select=id')
  if (!roles?.length) throw new Error('Second tenant employee role was not provisioned.')

  const roleAssignments = await rest(
    'forge_tenant_user_roles?organization_id=eq.' +
      organizationId +
      '&user_id=eq.' +
      user.id +
      '&role_id=eq.' +
      roles[0].id +
      '&select=role_id'
  )

  if (!roleAssignments?.length) {
    await rest('forge_tenant_user_roles', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ organization_id: organizationId, user_id: user.id, role_id: roles[0].id })
    })
  }

  return { email, password }
}

async function loginLocalDemo(page, admin) {
  await page.goto(baseURL + '/auth/login')
  await page.getByRole('button', { name: admin ? 'Local Forge Admin' : 'Local Demo User' }).click()
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 15000 })
}

async function loginWithCredentials(page, email, password) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 15000 })
}

test('customer support tenant, staff, attachment, resolution, reopen, and isolation smoke', async ({ browser }) => {
  const tenantTwo = await createSecondTenantUser()
  const subject = 'Smoke test support request ' + Date.now()
  const publicReply = 'Public Forge reply from automated smoke test.'
  const internalNote = 'INTERNAL-SMOKE-NOTE-' + Date.now()
  const publicFileName = 'smoke-public.txt'
  const internalFileName = 'smoke-internal.txt'

  const customerContext = await browser.newContext()
  const customerPage = await customerContext.newPage()
  await loginLocalDemo(customerPage, false)
  await customerPage.goto(baseURL + '/support')
  await expect(customerPage.getByRole('heading', { name: 'Customer Support' })).toBeVisible()

  await customerPage.getByRole('button', { name: 'New request' }).click()
  await customerPage.getByLabel('Subject').fill(subject)
  await customerPage.getByLabel('Category').selectOption('bug')
  await customerPage.getByLabel('Priority').selectOption('high')
  await customerPage.getByLabel('Description').fill('Automated browser smoke test for tenant support workflow and authorization.')
  await customerPage.getByLabel('Product area').fill('Customer Support')
  await customerPage.getByLabel('Page URL').fill('/support')
  await customerPage.getByLabel('Device / browser').fill('Playwright Chromium')
  await customerPage.getByRole('button', { name: 'Submit request' }).click()

  await customerPage.waitForURL(/\/support\/[0-9a-f-]+$/)
  const ticketUrl = customerPage.url()
  await expect(customerPage.getByRole('heading', { name: subject })).toBeVisible()

  await customerPage.locator('input[type="file"]').setInputFiles({
    name: publicFileName,
    mimeType: 'text/plain',
    buffer: Buffer.from('public smoke attachment')
  })
  await customerPage.getByRole('button', { name: 'Upload' }).click()
  await expect(customerPage.getByText('Attachment uploaded.')).toBeVisible()
  await customerPage.reload()
  await expect(customerPage.getByRole('link', { name: new RegExp(publicFileName) })).toBeVisible()

  const staffContext = await browser.newContext()
  const staffPage = await staffContext.newPage()
  await loginLocalDemo(staffPage, true)
  await staffPage.goto(baseURL + '/admin/creator/support')
  await expect(staffPage.getByRole('heading', { name: 'Forge Support Queue' })).toBeVisible()
  await staffPage.getByText(subject, { exact: true }).click()

  const replyBox = staffPage.getByLabel('Reply')
  await replyBox.fill(internalNote)
  await staffPage.getByLabel('Internal note').check()
  await staffPage.getByRole('button', { name: 'Save internal note' }).click()
  await expect(staffPage.getByText('Internal note saved.')).toBeVisible()

  await replyBox.fill(publicReply)
  await staffPage.getByLabel('Internal note').uncheck()
  await staffPage.getByRole('button', { name: 'Send reply' }).click()
  await expect(staffPage.getByText('Reply sent.')).toBeVisible()

  await staffPage.locator('input[type="file"]').setInputFiles({
    name: internalFileName,
    mimeType: 'text/plain',
    buffer: Buffer.from('internal smoke attachment')
  })
  await staffPage.getByLabel('Internal only').check()
  await staffPage.getByRole('button', { name: 'Upload' }).click()
  await expect(staffPage.getByText('Attachment uploaded.')).toBeVisible()

  await staffPage.getByLabel('Priority').selectOption('urgent')
  await staffPage.getByLabel('Status').selectOption('resolved')
  await staffPage.getByLabel('Resolution summary').fill('Automated smoke test resolution summary.')
  await staffPage.getByRole('button', { name: 'Save changes' }).click()
  await expect(staffPage.getByText('Request updated.')).toBeVisible()

  await customerPage.goto(ticketUrl)
  await expect(customerPage.getByText(publicReply)).toBeVisible()
  await expect(customerPage.getByText(internalNote)).toHaveCount(0)
  await expect(customerPage.getByText(internalFileName)).toHaveCount(0)
  await expect(customerPage.getByRole('link', { name: new RegExp(publicFileName) })).toBeVisible()
  await expect(customerPage.getByRole('button', { name: 'Reopen request' })).toBeVisible()

  const downloadPromise = customerPage.waitForEvent('download')
  await customerPage.getByRole('link', { name: new RegExp(publicFileName) }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(publicFileName)

  await customerPage.getByRole('button', { name: 'Reopen request' }).click()
  await expect(customerPage.getByText('Request reopened.')).toBeVisible()

  const tenantTwoContext = await browser.newContext()
  const tenantTwoPage = await tenantTwoContext.newPage()
  await loginWithCredentials(tenantTwoPage, tenantTwo.email, tenantTwo.password)
  await tenantTwoPage.goto(baseURL + '/support')
  await expect(tenantTwoPage.getByRole('heading', { name: 'Customer Support' })).toBeVisible()
  await expect(tenantTwoPage.getByText(subject)).toHaveCount(0)

  await tenantTwoPage.goto(ticketUrl)
  await expect(tenantTwoPage.getByRole('heading', { name: subject })).toHaveCount(0)

  await customerContext.close()
  await staffContext.close()
  await tenantTwoContext.close()
})
