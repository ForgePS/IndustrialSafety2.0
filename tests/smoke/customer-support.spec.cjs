const { test, expect } = require('@playwright/test')

const USER_EMAIL = 'user@forge2.local'
const ADMIN_EMAIL = 'admin@forge2.local'
const PASSWORD = 'ForgeDev2!'

async function login(page, email) {
  await page.goto('/auth/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
}

async function createTicket(page, {
  subject,
  description,
  category = 'bug',
  priority = 'high',
  productArea = 'Customer Support'
}) {
  await page.goto('/support')
  await expect(page.getByRole('heading', { name: 'Customer Support' })).toBeVisible()
  await page.getByRole('button', { name: 'New request' }).click()
  await page.getByLabel('Subject').fill(subject)
  await page.getByLabel('Category').selectOption(category)
  await page.getByLabel('Priority').selectOption(priority)
  await page.getByLabel('Description').fill(description)
  await page.getByLabel('Product area').fill(productArea)
  await page.getByLabel('Page URL').fill('/support')
  await page.getByLabel('Device / browser').fill('Playwright Chromium smoke test')
  await page.getByRole('button', { name: 'Submit request' }).click()
  await page.waitForURL(/\/support\/[0-9a-f-]{36}$/i, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: subject })).toBeVisible()
  return new URL(page.url()).pathname
}

test('customer support end-to-end smoke', async ({ browser }) => {
  const userContext = await browser.newContext()
  const userPage = await userContext.newPage()
  await login(userPage, USER_EMAIL)

  const subject = 'Automated Support Smoke Ticket'
  const ticketPath = await createTicket(userPage, {
    subject,
    description: 'Automated browser smoke test for customer support ticket creation, conversation, attachments, support handling, resolution, and reopen.'
  })

  await userPage.getByLabel('Reply').fill('Customer smoke-test reply before Forge triage.')
  await userPage.getByRole('button', { name: 'Send reply' }).click()
  await expect(userPage.getByText('Reply sent.')).toBeVisible()
  await expect(userPage.getByText('Customer smoke-test reply before Forge triage.')).toBeVisible()

  const publicFileInput = userPage.locator('input[type="file"]')
  await publicFileInput.setInputFiles({
    name: 'customer-smoke.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('customer support smoke attachment')
  })
  await userPage.getByRole('button', { name: 'Upload' }).click()
  await expect(userPage.getByText('Attachment uploaded.')).toBeVisible()
  const publicAttachment = userPage.getByRole('link', { name: /customer-smoke\.txt/i })
  await expect(publicAttachment).toBeVisible()
  const publicAttachmentHref = await publicAttachment.getAttribute('href')
  expect(publicAttachmentHref).toMatch(/^\/api\/support\/attachments\//)

  const downloadResponse = await userPage.request.get(publicAttachmentHref)
  expect(downloadResponse.ok()).toBeTruthy()

  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await login(adminPage, ADMIN_EMAIL)

  // Company-owner permission should allow visibility from the tenant support workspace.
  await adminPage.goto('/support')
  await expect(adminPage.getByText(subject)).toBeVisible()

  // Forge platform support queue should see the same ticket across the support workspace.
  await adminPage.goto('/admin/creator/support')
  await expect(adminPage.getByRole('heading', { name: 'Forge Support Queue' })).toBeVisible()
  await adminPage.getByRole('link', { name: new RegExp(subject, 'i') }).click()
  await expect(adminPage.getByRole('heading', { name: subject })).toBeVisible()
  await expect(adminPage.getByText('Customer smoke-test reply before Forge triage.')).toBeVisible()
  await expect(adminPage.getByRole('link', { name: /customer-smoke\.txt/i })).toBeVisible()

  // Internal note must be visible to Forge staff.
  await adminPage.getByLabel('Internal note').check()
  await adminPage.getByLabel('Reply').fill('INTERNAL-SMOKE-NOTE: tenant must never see this.')
  await adminPage.getByRole('button', { name: 'Save internal note' }).click()
  await expect(adminPage.getByText('Internal note saved.')).toBeVisible()
  await expect(adminPage.getByText('INTERNAL-SMOKE-NOTE: tenant must never see this.')).toBeVisible()

  // Internal attachment must be visible to Forge staff.
  await adminPage.locator('input[type="file"]').setInputFiles({
    name: 'internal-smoke.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('internal-only support evidence')
  })
  await adminPage.getByLabel('Internal only').check()
  await adminPage.getByRole('button', { name: 'Upload' }).click()
  await expect(adminPage.getByText('Attachment uploaded.')).toBeVisible()
  await expect(adminPage.getByRole('link', { name: /internal-smoke\.txt/i })).toBeVisible()

  // Send a public Forge response.
  await adminPage.getByLabel('Internal note').uncheck()
  await adminPage.getByLabel('Reply').fill('Public Forge smoke-test response.')
  await adminPage.getByRole('button', { name: 'Send reply' }).click()
  await expect(adminPage.getByText('Reply sent.')).toBeVisible()
  await expect(adminPage.getByText('Public Forge smoke-test response.')).toBeVisible()

  // Triage and assignment.
  await adminPage.getByLabel('Priority').selectOption('urgent')
  const assignedTo = adminPage.getByLabel('Assigned to')
  if (await assignedTo.locator('option').count() > 1) {
    await assignedTo.selectOption({ index: 1 })
  }
  await adminPage.getByLabel('Status').selectOption('in_progress')
  await adminPage.getByRole('button', { name: 'Save changes' }).click()
  await expect(adminPage.getByText('Request updated.')).toBeVisible()

  // Resolve with required summary.
  await adminPage.getByLabel('Status').selectOption('resolved')
  await adminPage.getByLabel('Resolution summary').fill('Smoke test resolution summary.')
  await adminPage.getByRole('button', { name: 'Save changes' }).click()
  await expect(adminPage.getByText('Request updated.')).toBeVisible()

  // Tenant can see public response and resolution, but no internal material.
  await userPage.goto(ticketPath)
  await expect(userPage.getByText('Public Forge smoke-test response.')).toBeVisible()
  await expect(userPage.getByText('Smoke test resolution summary.')).toBeVisible()
  await expect(userPage.getByText('INTERNAL-SMOKE-NOTE: tenant must never see this.')).toHaveCount(0)
  await expect(userPage.getByRole('link', { name: /internal-smoke\.txt/i })).toHaveCount(0)

  // Resolved request can be reopened by the requester.
  await userPage.getByRole('button', { name: 'Reopen request' }).click()
  await expect(userPage.getByText('Request reopened.')).toBeVisible()

  // Create a tenant-owner ticket; the normal employee must not be able to open another requester's ticket.
  const adminPrivateSubject = 'Admin-only requester smoke ticket'
  const adminTicketPath = await createTicket(adminPage, {
    subject: adminPrivateSubject,
    description: 'Ticket created by the tenant owner to verify an employee cannot open another requester ticket.'
  })

  const forbiddenResponse = await userPage.goto(adminTicketPath)
  expect(forbiddenResponse && forbiddenResponse.status()).toBe(404)
  await expect(userPage.getByText(adminPrivateSubject)).toHaveCount(0)

  await userContext.close()
  await adminContext.close()
})
