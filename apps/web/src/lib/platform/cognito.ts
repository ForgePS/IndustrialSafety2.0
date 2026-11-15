import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { JWTPayload } from 'jose'

/**
 * Signing in through 1.0 (docs/INTEGRATION_2X_INTO_1X_PLAN.md, phase 1). Safe for middleware and
 * server code alike: no Node or Next server imports.
 *
 * 1.0 keeps the browser session itself. Its `__Host-forge-session` cookie (`forge-session` on
 * localhost) is an opaque token; `POST /api/v1/auth/session/refresh` exchanges it for a Cognito
 * access token. 2.0 does that exchange in middleware, keeps the access token in its own HttpOnly
 * cookie until it expires, and verifies it on every request with the user pool's keys, exactly as
 * 1.0's platform-api does. 1.0 owns sign-in, sign-out and passwords.
 */

export type CognitoClaims = JWTPayload & { sub: string; client_id: string; token_use: 'access'; username?: string }

export type CognitoConfig = {

  /** https://cognito-idp.<region>.amazonaws.com/<pool id>, or the local test issuer. */
  issuer: string
  clientIds: string[]

  /** Where 2.0's server reaches 1.0's platform-api, e.g. https://app.example.com. */
  platformApiUrl: string

  /** The public origin 1.0 trusts for session refresh; defaults to the request's origin. */
  platformOrigin: string | null

  /**
   * The public origin 2.0 is served from, for its own redirects. Inside 1.0 that is 1.0's origin,
   * so it defaults to platformOrigin. Next's middleware sees the server's own host (localhost),
   * not the browser's, so the request alone cannot be trusted for this.
   */
  appOrigin: string | null

  /** 1.0's sign-in page. `next` is appended. */
  loginUrl: string
}

const origin = (value: string | undefined) => value?.trim().replace(/\/+$/, '') || null

const required = (name: string) => {
  const value = process.env[name]?.trim()

  if (!value) throw new Error(`${name} must be set when FORGE_AUTH_PROVIDER=cognito.`)

  return value
}

export const cognitoConfig = (): CognitoConfig => ({
  issuer: required('FORGE_COGNITO_ISSUER').replace(/\/+$/, ''),
  clientIds: required('FORGE_COGNITO_CLIENT_ID')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean),
  platformApiUrl: required('FORGE_PLATFORM_API_URL').replace(/\/+$/, ''),
  platformOrigin: origin(process.env.FORGE_PLATFORM_ORIGIN),
  appOrigin: origin(process.env.FORGE_APP_ORIGIN) || origin(process.env.FORGE_PLATFORM_ORIGIN),
  loginUrl: required('FORGE_PLATFORM_LOGIN_URL')
})

export const isCognitoMode = () => process.env.FORGE_AUTH_PROVIDER === 'cognito'

// 1.0's cookie names (apps/platform-api/src/modules/auth-context/auth-session-cookie.ts).
export const PLATFORM_SESSION_COOKIES = ['__Host-forge-session', 'forge-session'] as const

/** 2.0's copy of the current access token. `__Secure-` needs https; localhost uses the plain name. */
export const accessCookieName = (secure: boolean) => (secure ? '__Secure-forge2-access' : 'forge2-access')

export const ACCESS_COOKIES = [accessCookieName(true), accessCookieName(false)] as const

type CookieReader = { get(name: string): { value: string } | undefined }

export const readCookie = (cookies: CookieReader, names: readonly string[]) => {
  for (const name of names) {
    const value = cookies.get(name)?.value

    if (value) return value
  }

  return null
}

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

const jwks = (issuer: string) => {
  let set = jwksByIssuer.get(issuer)

  if (!set) {
    set = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
    jwksByIssuer.set(issuer, set)
  }

  return set
}

/** Claim checks after the signature is verified. Stricter than 1.0: only access tokens. */
export const checkClaims = (payload: JWTPayload, config: Pick<CognitoConfig, 'clientIds'>): CognitoClaims | null => {
  const claims = payload as Partial<CognitoClaims>

  if (typeof claims.sub !== 'string' || !claims.sub) return null
  if (claims.token_use !== 'access') return null
  if (typeof claims.client_id !== 'string' || !config.clientIds.includes(claims.client_id)) return null

  return claims as CognitoClaims
}

/** The verified claims of a Cognito access token, or null if it is invalid or expired. */
export const verifyAccessToken = async (token: string, config: CognitoConfig = cognitoConfig()) => {
  try {
    const { payload } = await jwtVerify(token, jwks(config.issuer), { issuer: config.issuer, clockTolerance: 5 })

    return checkClaims(payload, config)
  } catch {
    return null
  }
}

type Envelope<T> = { data?: T }

/**
 * Exchanges 1.0's session cookie for a fresh access token. Null when 1.0 says the session is gone.
 * The cookie value stays as it is: 1.0 keeps it stable across refreshes.
 */
export const exchangePlatformSession = async (
  sessionCookie: string,
  origin: string,
  config: CognitoConfig = cognitoConfig()
): Promise<{ accessToken: string; expiresIn: number } | null> => {
  const cookieHeader = PLATFORM_SESSION_COOKIES.map(name => `${name}=${encodeURIComponent(sessionCookie)}`).join('; ')

  try {
    const response = await fetch(`${config.platformApiUrl}/api/v1/auth/session/refresh`, {
      method: 'POST',
      headers: { cookie: cookieHeader, origin: config.platformOrigin || origin, accept: 'application/json' },
      cache: 'no-store'
    })

    if (!response.ok) return null

    const body = (await response.json()) as Envelope<{ accessToken?: string; expiresIn?: number }>
    const accessToken = body.data?.accessToken

    return accessToken ? { accessToken, expiresIn: Number(body.data?.expiresIn) || 3600 } : null
  } catch {
    return null
  }
}

/** The signed-in person's email and display name from 1.0, used when 2.0 first links them. */
export const fetchPlatformProfile = async (
  accessToken: string,
  config: CognitoConfig = cognitoConfig()
): Promise<{ email: string | null; name: string | null } | null> => {
  try {
    const response = await fetch(`${config.platformApiUrl}/api/v1/auth/profile`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      cache: 'no-store'
    })

    if (!response.ok) return null

    const body = (await response.json()) as Envelope<{ email?: string | null; displayName?: string | null }>

    return { email: body.data?.email ?? null, name: body.data?.displayName ?? null }
  } catch {
    return null
  }
}

/**
 * 1.0's sign-in page with `next` set to where to come back to. 1.0's sign-in does not read `next` yet
 * (its legal acknowledgement page does); until it does, people land on 1.0's home after signing in.
 */
export const loginRedirectUrl = (returnTo: string, config: CognitoConfig = cognitoConfig()) => {
  const url = new URL(config.loginUrl)

  url.searchParams.set('next', returnTo)

  return url.toString()
}
