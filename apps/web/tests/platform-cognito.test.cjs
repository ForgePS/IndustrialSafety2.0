/**
 * Portability phase 1: Cognito access-token checks and the 1.0 session exchange, against the local
 * 1.0 stand-in (scripts/portability/dev-platform.cjs). No database needed.
 * Run: node --experimental-strip-types --test apps/web/tests/platform-cognito.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { spawn } = require('child_process')

const port = 4100 + Math.floor(Math.random() * 800)
const platform = `http://127.0.0.1:${port}`

process.env.FORGE_COGNITO_ISSUER = `${platform}/local-pool`
process.env.FORGE_COGNITO_CLIENT_ID = 'forge2-local'
process.env.FORGE_PLATFORM_API_URL = platform
process.env.FORGE_PLATFORM_LOGIN_URL = `${platform}/login`

const cognito = require(path.join(__dirname, '../src/lib/platform/cognito.ts'))

let child

test.before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, '../../../scripts/portability/dev-platform.cjs'), '--port', String(port), '--ttl', '2'], { stdio: ['ignore', 'pipe', 'inherit'] })
  await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => String(chunk).includes('Local 1.0 sign-in') && resolve())
    child.on('exit', code => reject(new Error(`dev-platform exited ${code}`)))
  })
})

test.after(() => child?.kill())

const signIn = async email => {
  const res = await fetch(`${platform}/login`, {
    method: 'POST',
    body: new URLSearchParams({ email, name: 'Test Person', next: '/dashboard' }),
    redirect: 'manual'
  })

  return /forge-session=([^;]+)/.exec(res.headers.get('set-cookie'))[1]
}

test('claim checks accept only access tokens for a configured client', () => {
  const config = { clientIds: ['a', 'b'] }

  assert.equal(cognito.checkClaims({ sub: 's', token_use: 'access', client_id: 'b' }, config)?.sub, 's')
  assert.equal(cognito.checkClaims({ sub: 's', token_use: 'id', client_id: 'a' }, config), null)
  assert.equal(cognito.checkClaims({ sub: 's', token_use: 'access', client_id: 'c' }, config), null)
  assert.equal(cognito.checkClaims({ sub: '', token_use: 'access', client_id: 'a' }, config), null)
  assert.equal(cognito.checkClaims({ sub: 's', token_use: 'access', aud: 'a' }, config), null)
})

test('a 1.0 session exchanges for a token that verifies, and its profile comes back', async () => {
  const session = await signIn('Person@Example.test')
  const exchanged = await cognito.exchangePlatformSession(session, 'http://127.0.0.1:3020')

  assert.ok(exchanged?.accessToken)
  assert.equal(exchanged.expiresIn, 2)

  const claims = await cognito.verifyAccessToken(exchanged.accessToken)

  assert.equal(claims?.token_use, 'access')
  assert.match(claims.sub, /^[0-9a-f-]{36}$/)
  assert.deepEqual(await cognito.fetchPlatformProfile(exchanged.accessToken), { email: 'person@example.test', name: 'Test Person' })
})

test('expired, tampered and foreign tokens are rejected; unknown sessions do not exchange', async () => {
  const exchanged = await cognito.exchangePlatformSession(await signIn('expiry@example.test'), 'http://127.0.0.1:3020')
  const [head, body, signature] = exchanged.accessToken.split('.')
  const claims = JSON.parse(Buffer.from(body, 'base64url'))
  const forged = [head, Buffer.from(JSON.stringify({ ...claims, sub: 'someone-else' })).toString('base64url'), signature].join('.')

  assert.equal(await cognito.verifyAccessToken(forged), null)
  assert.equal(await cognito.verifyAccessToken(exchanged.accessToken, { ...cognito.cognitoConfig(), issuer: `${platform}/other-pool` }), null)
  assert.equal(await cognito.verifyAccessToken(exchanged.accessToken, { ...cognito.cognitoConfig(), clientIds: ['other'] }), null)
  assert.equal(await cognito.exchangePlatformSession('not-a-session', 'http://127.0.0.1:3020'), null)

  await new Promise(resolve => setTimeout(resolve, 8000)) // ttl 2s plus the 5s clock tolerance
  assert.equal(await cognito.verifyAccessToken(exchanged.accessToken), null)
})

test('sign-in redirects carry where to come back to', () => {
  const url = new URL(cognito.loginRedirectUrl('/v2/incidents?x=1'))

  assert.equal(url.origin + url.pathname, `${platform}/login`)
  assert.equal(url.searchParams.get('next'), '/v2/incidents?x=1')
})

test("a cached token is used only with the 1.0 session it was exchanged for", async () => {
  const jar = values => ({ get: name => (values[name] ? { value: values[name] } : undefined) })
  const bound = await cognito.bindToken('session-a', 'header.payload.signature')

  assert.deepEqual(await cognito.readBoundToken(jar({ 'forge-session': 'session-a', 'forge2-access': bound })), { session: 'session-a', token: 'header.payload.signature' })
  assert.deepEqual(await cognito.readBoundToken(jar({ 'forge-session': 'session-b', 'forge2-access': bound })), { session: 'session-b', token: null })
  assert.deepEqual(await cognito.readBoundToken(jar({ 'forge-session': 'session-a', 'forge2-access': 'header.payload.signature' })), { session: 'session-a', token: null })
  assert.deepEqual(await cognito.readBoundToken(jar({ 'forge2-access': bound })), { session: null, token: null })
})
