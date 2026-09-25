import { test, expect, type Page } from '@playwright/test'

const appUrl = process.env.SMOKE_APP_URL || 'http://127.0.0.1:3000'
const foreignTicketId = '30000000-0000-4000-8000-000000000202'
const adminOnlySubject = 'Admin-only support ticket'
const foreignSubject = 'Foreign tenant support ticket'
const smokeSubject = 'Support smoke ' + Date.now()

async function signIn(page: Page, email: string) {
  await page.goto(appUrl + '/auth/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill('ForgeDev2!')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.includes('/auth/login'), { timeout: 20_000 })
}

async function openUserTicket(page: Page, ticketId: string) {
  await page.goto(appUrl + '/support/' + ticketId)
  await expect(page.getByRole('heading', { name: smokeSubject })).toBeVisible()
}

test('customer support end-to-end smoke test', async ({ browser }) => {
  const userContext = await browser.newContext({ acceptDownloads: true })
  const adminContext = await browser.newContext({ acceptDownloads: true })
  const user = await userContext.newPage()
  const admin = await adminContext.newPage()

  await test.step('tenant employee signs in and only sees their own support queue', async () => {
    await signIn(user, 'user@forge2.local')
    await user.goto(appUrl + '/support')
    await expect(user.getByRole('heading', { name: 'Customer Support' })).toBeVisible()
    await expect(user.getByText(adminOnlySubject)).toHaveCount(0)

    const forbiddenStaffResponse = await user.goto(appUrl + '/admin/creator/support')
    expect(
      forbiddenStaffResponse?.status() === 404 ||
      forbiddenStaffResponse?.status() === 403 ||
      !user.url().includes('/admin/creator/support')
    ).toBeTruthy()

    await user.goto(appUrl + '/support')
  })

  let ticketId = ''

  await test.step('tenant employee creates a ticket', async () => {
    await user.getByRole('button', { name: 'New request' }).click()
    await user.getByLabel('Subject').fill(smokeSubject)
    await user.getByLabel('Category').selectOption('bug')
    await user.getByLabel('Priority').selectOption('high')
    await user.getByLabel('Description').fill('Automated smoke test for the Forge customer support workflow.')
    await user.getByLabel('Product area').fill('Customer Support')
    await user.getByLabel('Page URL').fill('/support')
    await user.getByLabel('Device / browser').fill('Playwright Chromium')
    await user.getByRole('button', { name: 'Submit request' }).click()
    await user.waitForURL(/\/support\/[0-9a-f-]+$/i, { timeout: 20_000 })

    ticketId = user.url().split('/').pop() || ''
    expect(ticketId).toMatch(/^[0-9a-f-]{36}$/i)
    await expect(user.getByRole('heading', { name: smokeSubject })).toBeVisible()
  })

  await test.step('customer replies and uploads a public attachment', async () => {
    const reply = 'Customer smoke reply: issue remains reproducible.'
    await user.getByLabel('Reply').fill(reply)
    await user.getByRole('button', { name: 'Send reply' }).click()
    await expect(user.getByText(reply)).toBeVisible()

    await user.getByLabel('Add file').setInputFiles({
      name: 'customer-smoke.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Forge support smoke test public attachment.')
    })
    await user.getByRole('button', { name: 'Upload' }).click()
    await expect(user.getByRole('link', { name: /customer-smoke\.txt/ })).toBeVisible()

    const downloadPromise = user.waitForEvent('download')
    await user.getByRole('link', { name: /customer-smoke\.txt/ }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('customer-smoke.txt')
  })

  await test.step('Forge staff sees all tenants and sends a public reply', async () => {
    await signIn(admin, 'admin@forge2.local')
    await admin.goto(appUrl + '/admin/creator/support')
    await expect(admin.getByRole('heading', { name: 'Forge Support Queue' })).toBeVisible()
    await expect(admin.getByText(smokeSubject)).toBeVisible()
    await expect(admin.getByText(foreignSubject)).toBeVisible()

    await admin.goto(appUrl + '/admin/creator/support/' + ticketId)
    const staffReply = 'Forge support public smoke reply.'
    await admin.getByLabel('Reply').fill(staffReply)
    await admin.getByRole('button', { name: 'Send reply' }).click()
    await expect(admin.getByText(staffReply)).toBeVisible()

    await openUserTicket(user, ticketId)
    await expect(user.getByText(staffReply)).toBeVisible()
    await expect(user.getByText(/waiting on customer/i)).toBeVisible()
  })

  await test.step('customer response moves request back to Forge', async () => {
    const customerFollowUp = 'Customer follow-up after Forge response.'
    await user.getByLabel('Reply').fill(customerFollowUp)
    await user.getByRole('button', { name: 'Send reply' }).click()
    await expect(user.getByText(customerFollowUp)).toBeVisible()

    await admin.goto(appUrl + '/admin/creator/support/' + ticketId)
    await expect(admin.getByText(customerFollowUp)).toBeVisible()
    await expect(admin.getByText(/waiting on forge/i)).toBeVisible()
  })

  let internalAttachmentHref = ''

  await test.step('internal notes and internal attachments stay staff-only', async () => {
    const internalNote = 'INTERNAL SMOKE NOTE — tenant must never see this.'
    await admin.getByLabel('Internal note').check()
    await admin.getByLabel('Reply').fill(internalNote)
    await admin.getByRole('button', { name: 'Save internal note' }).click()
    await expect(admin.getByText(internalNote)).toBeVisible()

    await admin.getByLabel('Internal only').check()
    await admin.getByLabel('Add file').setInputFiles({
      name: 'internal-smoke.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Private Forge support smoke attachment.')
    })
    await admin.getByRole('button', { name: 'Upload' }).click()

    const internalLink = admin.getByRole('link', { name: /internal-smoke\.txt/ })
    await expect(internalLink).toBeVisible()
    internalAttachmentHref = (await internalLink.getAttribute('href')) || ''
    expect(internalAttachmentHref).toMatch(/^\/api\/support\/attachments\//)

    await openUserTicket(user, ticketId)
    await expect(user.getByText(internalNote)).toHaveCount(0)
    await expect(user.getByRole('link', { name: /internal-smoke\.txt/ })).toHaveCount(0)

    const internalResponse = await user.request.get(appUrl + internalAttachmentHref, {
      maxRedirects: 0
    })
    expect(internalResponse.status()).toBe(404)
  })

  await test.step('staff triages, assigns, changes priority, and resolves', async () => {
    await admin.goto(appUrl + '/admin/creator/support/' + ticketId)

    await admin.getByLabel('Status').selectOption('resolved')
    await admin.getByLabel('Priority').selectOption('urgent')

    const assignment = admin.getByLabel('Assigned to')
    if ((await assignment.locator('option').count()) > 1) {
      await assignment.selectOption({ index: 1 })
    }

    await admin.getByLabel('Resolution summary').fill(
      'Smoke test resolution: customer workflow, permissions, and attachment controls validated.'
    )
    await admin.getByRole('button', { name: 'Save changes' }).click()
    await expect(admin.getByText('Request updated.')).toBeVisible()

    await openUserTicket(user, ticketId)
    await expect(user.getByText(/Smoke test resolution/)).toBeVisible()
    await expect(user.getByRole('button', { name: 'Reopen request' })).toBeVisible()
  })

  await test.step('customer can reopen a resolved request', async () => {
    await user.getByRole('button', { name: 'Reopen request' }).click()
    await expect(user.getByText('Request reopened.')).toBeVisible()
    await user.reload()
    await expect(user.getByText(/waiting on forge/i)).toBeVisible()
  })

  await test.step('company admin can see company-wide tickets while employee cannot', async () => {
    await user.goto(appUrl + '/support')
    await expect(user.getByText(adminOnlySubject)).toHaveCount(0)

    await admin.goto(appUrl + '/support')
    await expect(admin.getByText(adminOnlySubject)).toBeVisible()
    await expect(admin.getByText(smokeSubject)).toBeVisible()
  })

  await test.step('direct cross-tenant ticket access returns not found', async () => {
    const response = await user.goto(appUrl + '/support/' + foreignTicketId)
    expect(response?.status()).toBe(404)
  })

  await userContext.close()
  await adminContext.close()
})
