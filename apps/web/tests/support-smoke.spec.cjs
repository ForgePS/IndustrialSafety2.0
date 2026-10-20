const { test, expect } = require('@playwright/test')

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const password = 'ForgeDev2!'

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await expect(page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i })).toBeEnabled({ timeout: 20000 })
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 20000 })
}

test.describe.configure({ mode: 'serial' })
// Includes additional notification, feedback, reporting, and access-denial flows.
test.setTimeout(240000)

test('production login rejects bad credentials and omits the user directory', async ({ page }) => {
  await page.goto(baseURL + '/auth/login')
  const submit = page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i })
  await expect(submit).toBeEnabled({ timeout: 20000 })
  expect(await page.content()).not.toContain('admin@forge2.local')
  await page.locator('input[name="email"]').fill('user@forge2.local')
  await page.locator('input[name="password"]').fill('DefinitelyWrongPassword!2')
  await submit.click()
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 })
  await expect(page).toHaveURL(/\/auth\/login/)
})

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
  const publicUploadResponsePromise = customer.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      /\/api\/support\/[0-9a-f-]+\/attachments$/i.test(new URL(response.url()).pathname)
  )
  await customer.getByRole('button', { name: 'Upload' }).click()
  const publicUploadResponse = await publicUploadResponsePromise
  expect(publicUploadResponse.status()).toBe(200)
  await customer.reload()
  const publicAttachment = customer.getByRole('link', { name: new RegExp(publicAttachmentName) })
  await expect(publicAttachment).toBeVisible()

  const downloadHref = await publicAttachment.getAttribute('href')
  expect(downloadHref).toBeTruthy()
  const downloadResponse = await customerContext.request.get(baseURL + downloadHref)
  expect(downloadResponse.ok()).toBeTruthy()
  expect((await downloadResponse.body()).toString('utf8')).toContain('customer support smoke attachment')

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
  const publicReplyPost = admin.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/admin/creator/support/' + ticketId
  )
  await admin.getByRole('button', { name: 'Send reply' }).click()
  expect((await publicReplyPost).ok()).toBeTruthy()
  await expect(admin.getByText('Reply sent.', { exact: true })).toBeVisible()
  await admin.reload()
  await expect(admin.getByText('Public Forge Support smoke-test reply.')).toBeVisible()

  await admin.getByLabel('Internal note').check()
  await admin.getByLabel('Reply').fill('INTERNAL-SMOKE-NOTE-DO-NOT-EXPOSE')
  const internalNotePost = admin.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/admin/creator/support/' + ticketId
  )
  await admin.getByRole('button', { name: 'Save internal note' }).click()
  expect((await internalNotePost).ok()).toBeTruthy()
  await expect(admin.getByText('Internal note saved.', { exact: true })).toBeVisible()
  await admin.reload()
  await expect(admin.getByText('INTERNAL-SMOKE-NOTE-DO-NOT-EXPOSE')).toBeVisible()

  const internalAttachmentName = 'internal-smoke.txt'
  await admin.locator('input[type="file"]').setInputFiles({
    name: internalAttachmentName,
    mimeType: 'text/plain',
    buffer: Buffer.from('internal support smoke attachment')
  })
  await admin.getByLabel('Internal only').check()
  const internalUploadResponsePromise = admin.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      /\/api\/support\/[0-9a-f-]+\/attachments$/i.test(new URL(response.url()).pathname)
  )
  await admin.getByRole('button', { name: 'Upload' }).click()
  const internalUploadResponse = await internalUploadResponsePromise
  expect(internalUploadResponse.status()).toBe(200)
  await admin.reload()
  const internalAttachment = admin.getByRole('link', { name: new RegExp(internalAttachmentName) })
  await expect(internalAttachment).toBeVisible()
  const internalDownloadHref = await internalAttachment.getAttribute('href')
  expect(internalDownloadHref).toBeTruthy()

  await admin.getByLabel('Status').selectOption('resolved')
  await admin.getByLabel('Priority').selectOption('urgent')
  await admin.getByLabel('Resolution summary').fill('Resolved successfully by automated smoke test.')
  await admin.getByRole('button', { name: 'Save changes' }).click()
  await expect(admin.getByText('Request updated.')).toBeVisible()
  await admin.reload()
  await expect(admin.getByLabel('Status')).toHaveValue('resolved')

  // Customers receive public updates without any internal note content.
  await customer.goto(baseURL + '/support')
  const inbox = customer.getByRole('region', { name: 'Support inbox' })
  await expect(inbox.getByText('Forge Support replied · Unread', { exact: true })).toBeVisible()
  await expect(inbox.getByText('INTERNAL-SMOKE-NOTE-DO-NOT-EXPOSE')).toHaveCount(0)
  await inbox.getByRole('button', { name: 'Mark shown notifications read' }).click()
  await expect(inbox.getByText(/^0 unread in the latest/)).toBeVisible()

  // Customer can see public support content, but never internal staff content.
  await customer.goto(ticketUrl)
  await expect(customer.getByText('Public Forge Support smoke-test reply.')).toBeVisible()
  await expect(customer.getByText('INTERNAL-SMOKE-NOTE-DO-NOT-EXPOSE')).toHaveCount(0)
  await expect(customer.getByText(new RegExp(internalAttachmentName))).toHaveCount(0)

  // UI hiding is not enough: the customer must also be denied if they call the
  // internal attachment download endpoint directly.
  const internalDownloadResponse = await customerContext.request.get(baseURL + internalDownloadHref)
  expect([403, 404]).toContain(internalDownloadResponse.status())

  await expect(customer.getByText('Resolved successfully by automated smoke test.')).toBeVisible()
  await expect(customer.getByRole('button', { name: 'Reopen request' })).toBeVisible()

  // Only the original requester may rate the resolved ticket.
  await admin.goto(baseURL + '/support/' + ticketId)
  await expect(admin.getByLabel('Support rating')).toHaveCount(0)
  await expect(customer.getByLabel('Support rating')).toBeVisible()
  await customer.getByLabel('Support rating').selectOption('5')
  await customer.getByLabel('Feedback comments').fill('Support was clear and helpful.')
  await customer.getByRole('button', { name: 'Submit feedback' }).click()
  await expect(customer.getByText('Rating: 5 / 5', { exact: true })).toBeVisible()
  await expect(customer.getByRole('button', { name: 'Submit feedback' })).toHaveCount(0)

  await admin.goto(baseURL + '/admin/creator/support/' + ticketId)
  await expect(admin.getByText('Support was clear and helpful.')).toBeVisible()
  await admin.goto(baseURL + '/admin/creator/support/reports')
  await expect(admin.getByRole('heading', { name: 'Support reports' })).toBeVisible()
  await expect(admin.getByTestId('support-feedback-count')).toHaveText('1')

  // Exercise database guards as well as UI controls. Credentials remain in the
  // Node test process and are never injected into browser pages.
  const api = process.env.API_URL
  const serviceKey = process.env.SERVICE_ROLE_KEY
  const anonKey = process.env.ANON_KEY
  expect(Boolean(api && serviceKey && anonKey)).toBeTruthy()
  const serviceHeaders = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' }
  const ticketResponse = await fetch(api + '/rest/v1/forge_support_tickets?id=eq.' + ticketId + '&select=organization_id,requester_user_id', { headers: serviceHeaders })
  expect(ticketResponse.ok).toBeTruthy()
  const [ticketRecord] = await ticketResponse.json()
  const feedbackInput = {
    p_org: ticketRecord.organization_id, p_ticket: ticketId,
    p_actor: ticketRecord.requester_user_id, p_rating: 5, p_comment: 'Duplicate attempt'
  }
  const duplicate = await fetch(api + '/rest/v1/rpc/submit_forge_support_feedback', {
    method: 'POST', headers: serviceHeaders, body: JSON.stringify(feedbackInput)
  })
  expect(duplicate.status).toBe(409)
  const otherRequester = await fetch(api + '/rest/v1/rpc/submit_forge_support_feedback', {
    method: 'POST', headers: serviceHeaders,
    body: JSON.stringify({ ...feedbackInput, p_actor: '00000000-0000-4000-8000-000000000001' })
  })
  expect(otherRequester.ok).toBeFalsy()
  const otherTenant = await fetch(api + '/rest/v1/rpc/submit_forge_support_feedback', {
    method: 'POST', headers: serviceHeaders,
    body: JSON.stringify({ ...feedbackInput, p_org: '30000000-0000-4000-8000-000000000100' })
  })
  expect(otherTenant.ok).toBeFalsy()
  const noticesResponse = await fetch(api + '/rest/v1/forge_support_notifications?ticket_id=eq.' + ticketId + '&audience=eq.customer&kind=eq.forge_reply&select=id', { headers: serviceHeaders })
  expect(noticesResponse.ok).toBeTruthy()
  expect((await noticesResponse.json()).length).toBe(1)
  const directReport = await fetch(api + '/rest/v1/rpc/forge_support_report', {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: 'Bearer ' + anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_start: '2020-01-01T00:00:00Z', p_end: '2040-01-01T00:00:00Z' })
  })
  expect([401, 403]).toContain(directReport.status)
  const deniedReportPage = await customerContext.request.get(baseURL + '/admin/creator/support/reports', { maxRedirects: 0 })
  expect([303, 307]).toContain(deniedReportPage.status())
  expect(deniedReportPage.headers().location).toContain('/admin')

  // Keep the customer on the already hydrated ticket while testing staff access
  // through an HTTP request. Then wait for the reopen action itself to complete.
  const reopenPost = customer.waitForResponse(response =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === '/support/' + ticketId
  )
  await customer.getByRole('button', { name: 'Reopen request' }).click()
  expect((await reopenPost).ok()).toBeTruthy()
  await expect(customer.getByText('Request reopened.')).toBeVisible()
  await customer.reload()
  await expect(customer.getByText('waiting on forge', { exact: true })).toBeVisible()

  // Tenant isolation: use the same authenticated user, switch only the active tenant,
  // then prove the tenant-one ticket URL resolves as not found.
  const customerState = await customerContext.storageState()
  const isolationContext = await browser.newContext({ storageState: customerState })
  await isolationContext.addCookies([{
    name: 'forge-active-organization',
    value: '30000000-0000-4000-8000-000000000100',
    domain: '127.0.0.1',
    path: '/'
  }])
  const isolated = await isolationContext.newPage()

  // The ticket must disappear from the other tenant's support list.
  await isolated.goto(baseURL + '/support')
  await expect(isolated.getByText('Support smoke test ticket')).toHaveCount(0)
  await expect(isolated.getByRole('region', { name: 'Support inbox' }).getByText(/Support smoke test ticket/)).toHaveCount(0)

  // Direct record navigation must fail in the other tenant.
  const isolatedTicketResponse = await isolated.goto(ticketUrl)
  expect(isolatedTicketResponse?.status()).toBe(404)

  // Direct attachment download must also fail after changing only tenant scope.
  const isolatedDownloadResponse = await isolationContext.request.get(baseURL + downloadHref)
  expect([403, 404]).toContain(isolatedDownloadResponse.status())

  await isolationContext.close()
  await adminContext.close()
  await customerContext.close()
})
