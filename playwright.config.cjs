/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  timeout: 300000,
  expect: { timeout: 20000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 45000,
    navigationTimeout: 90000
  }
}
