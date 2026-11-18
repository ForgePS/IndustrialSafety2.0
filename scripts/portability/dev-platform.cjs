#!/usr/bin/env node
// A local stand-in for 1.0's sign-in, so 2.0 can run with FORGE_AUTH_PROVIDER=cognito without AWS
// (docs/INTEGRATION_2X_INTO_1X_PLAN.md, phase 1). It mimics what 2.0 uses from 1.0's platform-api:
//
//   GET  /login?next=...                      sign-in form (any email; no password)
//   POST /login                               sets the forge-session cookie, as 1.0 does on localhost
//   POST /api/v1/auth/session/refresh         forge-session cookie -> Cognito-shaped access token
//   GET  /api/v1/auth/profile                 Bearer token -> { email, displayName }
//   POST /api/v1/auth/session/logout          ends the session and clears the cookie
//   GET  /local-pool/.well-known/jwks.json    the signing key, as Cognito publishes it
//
//   node scripts/portability/dev-platform.cjs [--port 4010] [--app http://localhost:3020] [--ttl 3600]
//
// Cookies are per host, not per port, so a forge-session cookie set here reaches 2.0 on the same
// host. Open both in the browser as localhost, not 127.0.0.1: Next rewrites loopback addresses in
// middleware redirects to localhost, and the cookies would then be on the wrong host. Server-to-
// server calls (token keys, refresh, profile) use 127.0.0.1. Keys and sessions live in memory:
// restarting signs everyone out. Local use only.
const crypto = require('crypto')
const http = require('http')

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)

  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const port = Number(arg('port', process.env.DEV_PLATFORM_PORT || 4010))
const appUrl = arg('app', process.env.DEV_PLATFORM_APP_URL || 'http://localhost:3020').replace(/\/+$/, '')
const ttl = Number(arg('ttl', process.env.DEV_PLATFORM_TOKEN_TTL || 3600))
const host = arg('host', '127.0.0.1')
const issuer = `http://${host}:${port}/local-pool`
const clientId = process.env.DEV_PLATFORM_CLIENT_ID || 'forge2-local'

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const kid = crypto.randomBytes(8).toString('hex')
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }

const b64url = value => Buffer.from(value).toString('base64url')

const sign = claims => {
  const head = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }))
  const body = b64url(JSON.stringify(claims))
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')

  return `${head}.${body}.${signature}`
}

const verify = token => {
  const [head, body, signature] = String(token || '').split('.')

  if (!signature) return null

  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${head}.${body}`), publicKey, Buffer.from(signature, 'base64url'))
  const claims = ok ? JSON.parse(Buffer.from(body, 'base64url').toString()) : null

  return claims && claims.exp > Date.now() / 1000 ? claims : null
}

// Cognito subs are UUIDs; derive a stable one per email so a person keeps their 2.0 link across restarts.
const subjectFor = email => {
  const hex = crypto.createHash('sha256').update(`forge-dev-platform:${email}`).digest('hex')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const sessions = new Map() // session token -> { sub, email, name }
const people = new Map() // sub -> { email, name }

const cookies = req =>
  Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map(part => part.trim().split('='))
      .filter(([name]) => name)
      .map(([name, ...rest]) => [name, decodeURIComponent(rest.join('='))])
  )

const readBody = req =>
  new Promise(resolve => {
    let data = ''

    req.on('data', chunk => (data += chunk))
    req.on('end', () => resolve(data))
  })

const send = (res, status, body, headers = {}) => {
  const json = typeof body !== 'string'

  res.writeHead(status, { 'content-type': json ? 'application/json' : 'text/html; charset=utf-8', ...headers })
  res.end(json ? JSON.stringify(body) : body)
}

const cors = req =>
  req.headers.origin === new URL(appUrl).origin
    ? { 'access-control-allow-origin': req.headers.origin, 'access-control-allow-credentials': 'true', vary: 'origin' }
    : {}

const escape = text => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

const loginPage = next => `<!doctype html><meta charset="utf-8"><title>Forge 1.0 sign-in (local)</title>
<style>body{font:16px system-ui;max-width:420px;margin:64px auto;padding:0 16px}input,button{font:inherit;padding:8px;width:100%;box-sizing:border-box;margin:6px 0}</style>
<h1>Forge 1.0 sign-in</h1><p>Local stand-in for 1.0's Cognito sign-in. Any email signs in.</p>
<form method="post" action="/login"><input type="hidden" name="next" value="${escape(next)}">
<label>Email<input name="email" type="email" required autofocus></label>
<label>Display name<input name="name"></label><button type="submit">Sign in</button></form>`

// Only paths on the 2.0 app, never another site.
const safeNext = value => (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard')

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`)

  if (req.method === 'OPTIONS') {
    return send(res, 204, '', { ...cors(req), 'access-control-allow-methods': 'POST, GET', 'access-control-allow-headers': 'content-type, x-forge-csrf' })
  }

  if (req.method === 'GET' && url.pathname === '/local-pool/.well-known/jwks.json') return send(res, 200, { keys: [jwk] })

  if (req.method === 'GET' && url.pathname === '/login') return send(res, 200, loginPage(safeNext(url.searchParams.get('next'))))

  if (req.method === 'POST' && url.pathname === '/login') {
    const form = new URLSearchParams(await readBody(req))
    const email = String(form.get('email') || '').trim().toLowerCase()

    if (!email) return send(res, 400, loginPage(safeNext(form.get('next'))))

    const sub = subjectFor(email)
    const name = String(form.get('name') || '').trim() || email.split('@')[0]
    const token = crypto.randomBytes(32).toString('base64url')

    people.set(sub, { email, name })
    sessions.set(token, { sub })

    return send(res, 303, '', {
      'set-cookie': `forge-session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${12 * 3600}`,
      location: appUrl + safeNext(form.get('next'))
    })
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/auth/session/refresh') {
    // 1.0 requires a trusted Origin or Referer here.
    if (!req.headers.origin && !req.headers.referer) return send(res, 403, { error: { code: 'FORBIDDEN', message: 'Untrusted request origin' } })

    const session = sessions.get(cookies(req)['forge-session'] || cookies(req)['__Host-forge-session'])

    if (!session) return send(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Session not found' } })

    const now = Math.floor(Date.now() / 1000)
    const person = people.get(session.sub)

    const accessToken = sign({
      sub: session.sub,
      iss: issuer,
      client_id: clientId,
      origin_jti: crypto.randomUUID(),
      event_id: crypto.randomUUID(),
      token_use: 'access',
      scope: 'aws.cognito.signin.user.admin',
      auth_time: now,
      iat: now,
      exp: now + ttl,
      jti: crypto.randomUUID(),
      username: person.email
    })

    return send(res, 200, { data: { accessToken, expiresIn: ttl, csrfToken: crypto.randomBytes(16).toString('hex') } })
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/auth/profile') {
    const claims = verify(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''))
    const person = claims && people.get(claims.sub)

    if (!person) return send(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' } })

    return send(res, 200, { data: { userId: claims.sub, email: person.email, displayName: person.name } })
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/auth/session/logout') {
    sessions.delete(cookies(req)['forge-session'])

    return send(res, 200, { data: { loggedOut: true } }, { ...cors(req), 'set-cookie': 'forge-session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' })
  }

  send(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } })
})

server.listen(port, host, () => {
  console.log(`Local 1.0 sign-in on http://${host}:${port}  (issuer ${issuer}, client ${clientId}, app ${appUrl})`)
  console.log('Run 2.0 with:')
  console.log('  FORGE_AUTH_PROVIDER=cognito NEXT_PUBLIC_FORGE_AUTH_PROVIDER=cognito')
  console.log(`  FORGE_COGNITO_ISSUER=${issuer} FORGE_COGNITO_CLIENT_ID=${clientId}`)
  console.log(`  FORGE_PLATFORM_API_URL=http://${host}:${port} FORGE_PLATFORM_LOGIN_URL=http://localhost:${port}/login FORGE_APP_ORIGIN=${appUrl}`)
  console.log(`  NEXT_PUBLIC_FORGE_PLATFORM_LOGIN_URL=http://localhost:${port}/login NEXT_PUBLIC_FORGE_PLATFORM_LOGOUT_URL=http://localhost:${port}/api/v1/auth/session/logout`)
})
