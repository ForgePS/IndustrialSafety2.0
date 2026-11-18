import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import {
  ACCESS_COOKIES,
  accessCookieName,
  bindToken,
  cognitoConfig,
  exchangePlatformSession,
  loginRedirectUrl,
  readBoundToken,
  readCookie,
  verifyAccessToken
} from './cognito'

// Pages that need someone signed in. Others check for themselves (the (back) layout, API routes)
// or are public (QR scans, the help center's public articles). Same list as the Supabase middleware.
const SIGNED_IN_PREFIXES = ['/admin', '/dashboard', '/my-profile', '/reset-password']

const isLocalHost = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)

/**
 * Middleware for FORGE_AUTH_PROVIDER=cognito. Keeps 2.0's access-token cookie in step with 1.0's
 * session: refreshed through 1.0 when missing or expired, removed as soon as 1.0's session cookie is
 * gone (signed out in 1.0). Sign-in pages belong to 1.0, so 2.0's /auth pages redirect there.
 */
export async function updateCognitoSession(request: NextRequest) {
  const config = cognitoConfig()
  const { pathname, basePath } = request.nextUrl

  // The address the browser used. request.url names the server's own host (localhost, or the
  // container behind CloudFront), where the person's cookies would not be sent, so prefer the
  // configured origin and fall back to the forwarded headers.
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim() || request.headers.get('host') || request.nextUrl.host
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || request.nextUrl.protocol.replace(/:$/, '')
  const origin = config.appOrigin || `${forwardedProtocol}://${forwardedHost}`
  const { protocol, host } = new URL(origin)
  const secure = protocol === 'https:' && !isLocalHost(host)
  const cookieName = accessCookieName(secure)
  const existing = readCookie(request.cookies, ACCESS_COOKIES)

  // A cached token counts only if it was exchanged for the 1.0 session cookie present now; after a
  // sign-out and someone else's sign-in on the same browser, the old token is not reused.
  const bound = await readBoundToken(request.cookies)
  const session = bound.session
  let token = bound.token && (await verifyAccessToken(bound.token, config)) ? bound.token : null
  let cookieValue = token ? readCookie(request.cookies, ACCESS_COOKIES) : null
  let refreshed: { value: string; maxAge: number } | null = null

  if (session && !token) {
    const exchanged = await exchangePlatformSession(session, origin, config)
    const claims = exchanged ? await verifyAccessToken(exchanged.accessToken, config) : null

    if (exchanged && claims) {
      token = exchanged.accessToken
      cookieValue = await bindToken(session, token)
      refreshed = { value: cookieValue, maxAge: Math.max(60, Math.min(exchanged.expiresIn, (claims.exp || 0) - Math.floor(Date.now() / 1000))) }
    }
  }

  // Server code in this request reads the cookie from the request, so update it there too.
  for (const name of ACCESS_COOKIES) request.cookies.delete(name)
  if (token && cookieValue) request.cookies.set(cookieName, cookieValue)

  const finish = (response: NextResponse) => {
    if (refreshed) {
      response.cookies.set(cookieName, refreshed.value, {
        httpOnly: true,
        secure,
        sameSite: 'strict',
        path: basePath || '/',
        maxAge: refreshed.maxAge
      })
    } else if (!token && existing) {
      for (const name of ACCESS_COOKIES) response.cookies.set(name, '', { path: basePath || '/', maxAge: 0 })
    }

    return response
  }

  const here = `${basePath}${pathname}${request.nextUrl.search}`

  if (pathname.startsWith('/auth')) {
    if (token) return finish(NextResponse.redirect(`${origin}${basePath}/dashboard`))

    return finish(NextResponse.redirect(loginRedirectUrl(`${basePath}/dashboard`, config)))
  }

  if (!token && SIGNED_IN_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'))) {
    return finish(NextResponse.redirect(loginRedirectUrl(here, config)))
  }

  return finish(NextResponse.next({ request }))
}
