const { test, expect } = require('@playwright/test')

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const password = 'ForgeDev2!'

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 20000 })
}

test.describe.configure({ mode: 'serial' })

test('customer support end-to-end smoke test', async ({ browser }) => {
  const customerContext = await browser.newContext()
  const customer = await customerContext.newPage()
  await login(customer, 'user@forge2.local')

  await customer.goto(baseURL + '/support')
  await expect(customer.getByRole('heading', { name: 'Customer Support' })).toBeVisible()

  await customer.getByRole('button', { name: /New request/i }).click()
  await customer.locator('input[name="subject"]').fill('Support smoke test ticket')
  await customer.locator('textarea[name="description"]').fill(
    'Automated smoke test validating customer support ticket, replies, attachments, privacy, resolution, reopen, and tenant isolation.'
  )
  await customer.locator('select[name="category"]').selectOption('bug')
  await customer.locator('select[name="priority"]').selectOption('high')
  await customer.locator('input[name="product_area"]').fill('Customer Support')
  await customer.locator('input[name="page_url"]').fill('/support')
  await customer.locator('input[name="environment"]').fill('Playwright Chromium CI')
  await customer.getByRole('button', { name: 'Submit request' }).click()

  await customer.waitForURL(/\/support\/[0-9a-f-]+$/i, { timeout: 20000 })
  const ticketUrl = customer.url()
  const ticketId = ticketUrl.split('/').pop()

  await expect(customer.getByRole('heading', { name: 'Support smoke test ticket' })).toBeVisible()
  await expect(customer.getByText(/SUP-\d{6}/)).toBeVisible()

  await customer.getByLabel('Reply').fill('Customer smoke-test reply.')
  await customer.getByRole('button', { name: 'Send reply' }).click()
  await expect(customer.getByText('Customer smoke-test reply.')).toBeVisible()

  const publicAttachmentName = 'customer-smoke.txt'
  await customer.locator('input[type="file"]').setInputFiles({
    name: publicAttachmentName,
    mimeType: 'text/plain',
    buffer: Buffer.from('customer support smoke attachment')
  })
  await customer.getByRole('button', { name: 'Upload' }).click()
  await expect(customer.getByText('Attachment uploaded.')).toBeVisible()
  await customer.reload()
  const publicAttachment = customer.getByRole('link', { name: new RegExp(publicAttachmentName) })
  await expect(publicAttachment).toBeVisible()

  const downloadHref = await publicAttachment.getAttribute('href')
  expect(downloadHref).toBeTruthy()
  const downloadResponse = await customerContext.request.get(baseURL + downloadHref)
  expect(downloadResponse.ok()).toBeTruthy()
  expect(await downloadResponse.body()).toContain(Buffer.from('customer support smoke attachment'))

  // Company-wide tenant access: seeded local admin is Company Owner in the same tenant.
  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  await login(admin, 'admin@forge2.local')
  await admin.goto(baseURL + '/support')
  await expect(admin.getByText('Support smoke test ticket')).toBeVisible()
  await admin.goto(baseURL + '/support/' + ticketId)
  await expect(admin.getByRole('heading', { name: 'Support smoke test ticket' })).toBeVisible()

  // Forge staff triage flow.
  await admin.goto(baseURL + '/admin/creator/support/' + ticketId)
  await expect(admin.getByRole('heading', { name: 'Support smoke test ticket' })).toBeVisible()

  await admin.getByLabel('Reply').fill('Public Forge Support smoke-test reply.')
  await admin.getByRole('button', { name: 'Send reply' }).click()
  await expect(admin.getByText('Public Forge Support smoke-test reply.')).toBeVisible()

  await admin.getByLabel('Internal note').check()
  await admin.getByLabel('Reply').fill('INTERNAL-SMOKE-NOTE-DO-NOT-EXPOSE')
  await admin.getByRole('button', { name: 'Save internal note' }).click()
  await expect(admin.getByText('INTERNAL-SMOKE-NOTE-DO-NOT-EXPOSE')).toBeVisible()

  const internalAttachmentName = 'internal-smoke.txt'
  await admin.locator('input[type="file"]').setInputFiles({
    name: internalAttachmentName,
    mimeType: 'text/plain',
    buffer: Buffer.from('internal support smoke attachment')
  })
  await admin.getByLabel('Internal only').check()
  await admin.getByRole('button', { name: 'Upload' }).click()
  await expect(admin.getByText('Attachment uploaded.')).toBeVisible()
  await admin.reload()
  await expect(admin.getByRole('link', { name: new RegExp(internalAttachmentName) })).toBeVisible()

  await admin.getByLabel('Status').selectOption('resolved')
  await admin.getByLabel('Priority').selectOption('urgent')
  await admin.getByLabel('Resolution summary').fill('Resolved successfully by automated smoke test.')
  await admin.getByRole('button', { name: 'Save changes' }).click()
  await expect(admin.getByText('Request updated.')).toBeVisible()
  await admin.reload()
  await expect(admin.getByText('resolved', { exact: true })).toBeVisible()

  // Customer can see public support content, but never internal staff content.
  await customer.goto(ticketUrl)
  await expect(customer.getByText('Public Forge Support smoke-test reply.')).toBeVisible()
  await expect(customer.getByText('INTERNAL-SMOKE-NOTE-DO-NOT-EXPOSE')).toHaveCount(0)
  await expect(customer.getByText(new RegExp(internalAttachmentName))).toHaveCount(0)
  await expect(customer.getByText('Resolved successfully by automated smoke test.')).toBeVisible()
  await expect(customer.getByRole('button', { name: 'Reopen request' })).toBeVisible()

  await customer.getByRole('button', { name: 'Reopen request' }).click()
  await expect(customer.getByText('Request reopened.')).toBeVisible()
  await customer.reload()
  await expect(customer.getByText('waiting on forge', { exact: true })).toBeVisible()

  // A user who belongs only to another tenant must not be able to open tenant-one ticket URLs.
  const outsiderContext = await browser.newContext()
  const outsider = await outsiderContext.newPage()
  await login(outsider, 'outsider@forge2.local')
  await outsider.goto(ticketUrl)
  await expect(outsider.getByText(/404|not found|could not be found/i)).toBeVisible()

  await outsiderContext.close()
  await adminContext.close()
  await customerContext.close()
})
